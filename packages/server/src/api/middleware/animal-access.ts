// 개체 단위 접근 제어 — "이 사용자가 이 개체를 볼 수 있는가"
//
// 왜 필요한가 (rbac.ts만으로는 부족한 이유):
//   rbac의 requirePermission은 **역할 단위** 검사다. "농장주는 센서를 읽을 수 있다"까지만 본다.
//   requireFarmAccess는 요청에 farmId가 있을 때만 발동한다.
//   그래서 `/sensors/latest/:animalId` 처럼 **개체 id만 받는 경로**는 아무 검사도 받지 않았다.
//   animalId만 알면 남의 목장 데이터가 열린다 — 전형적인 IDOR이다.
//
//   이 미들웨어가 그 구멍을 막는다: 개체 → 소속 농장을 조회해 사용자 스코프와 대조한다.
//
// 설계 원칙:
//   1) 라우트마다 검사를 흩뿌리지 않는다. 새 라우트가 생기면 또 빠지기 때문이다.
//      단일 미들웨어 + "누락 시 실패하는 테스트"로 불변식을 강제한다(animal-access.guard.test.ts).
//   2) 조회 결과를 req에 실어 핸들러가 같은 쿼리를 반복하지 않게 한다.
//   3) 존재하지 않는 개체는 404, 스코프 밖 개체는 403으로 구분한다.
//      개체 id는 UUID라 열거가 사실상 불가능하므로, 현장 디버깅 편의를 우선한다.

import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { animals, smaxtecEvents, eventLabels } from '../../db/schema.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../lib/errors.js';
import { scopedFarmIds, NO_FARM_SENTINEL } from './rbac.js';

/** 개체 → 농장 매핑은 거의 바뀌지 않는다. 짧은 TTL 캐시로 요청당 DB 왕복을 줄인다. */
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 5000;
const farmIdCache = new Map<string, { farmId: string; expiresAt: number }>();

function cacheGet(animalId: string): string | null {
  const hit = farmIdCache.get(animalId);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    farmIdCache.delete(animalId);
    return null;
  }
  return hit.farmId;
}

function cacheSet(animalId: string, farmId: string): void {
  if (farmIdCache.size >= CACHE_MAX) {
    const oldest = farmIdCache.keys().next().value;
    if (oldest) farmIdCache.delete(oldest);
  }
  farmIdCache.set(animalId, { farmId, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** 개체 이동·삭제 등으로 소속이 바뀌었을 때 호출 (쓰기 경로에서 사용) */
export function invalidateAnimalFarmCache(animalId?: string): void {
  if (animalId) farmIdCache.delete(animalId);
  else farmIdCache.clear();
}

/** 개체의 소속 농장을 조회한다. 없으면 null. */
export async function getAnimalFarmId(animalId: string): Promise<string | null> {
  const cached = cacheGet(animalId);
  if (cached) return cached;

  const db = getDb();
  const rows = await db
    .select({ farmId: animals.farmId })
    .from(animals)
    .where(eq(animals.animalId, animalId))
    .limit(1);

  const farmId = rows[0]?.farmId ?? null;
  if (farmId) cacheSet(animalId, farmId);
  return farmId;
}

/** UUID 형태인지 — 잘못된 파라미터로 DB를 때리지 않도록 사전 차단 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AnimalAccessOptions {
  /** 경로 파라미터 이름 (기본 'animalId') */
  readonly param?: string;
  /**
   * 파라미터가 없을 때 통과시킬지.
   * 같은 라우터에 개체 경로와 비-개체 경로가 섞여 있을 때 쓴다. 기본 false(=거부).
   */
  readonly optional?: boolean;
}

/**
 * 요청된 개체가 사용자의 접근 범위 안인지 강제한다.
 *
 * 통과 조건:
 *   - 마스터·미배정 관리역할(scopedFarmIds === null) → 전체 허용
 *   - 그 외 → 개체의 farmId가 사용자 배정 농장에 포함될 때만 허용
 *
 * 성공 시 `req.animalFarmId`에 소속 농장을 실어 핸들러가 재조회하지 않게 한다.
 */
export function requireAnimalAccess(options: AnimalAccessOptions = {}) {
  const param = options.param ?? 'animalId';
  const optional = options.optional ?? false;

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();

      // Express 타입상 params 값은 string | string[] — 배열이면 잘못된 요청으로 본다
      const raw: unknown = req.params[param];
      const animalId = typeof raw === 'string' ? raw : '';
      if (!animalId) {
        if (optional) { next(); return; }
        throw new NotFoundError('개체 ID가 필요합니다');
      }
      if (!UUID_RE.test(animalId)) {
        throw new NotFoundError('개체를 찾을 수 없습니다');
      }

      const farmId = await getAnimalFarmId(animalId);
      if (!farmId) {
        throw new NotFoundError('개체를 찾을 수 없습니다');
      }

      const scope = scopedFarmIds(req);
      // null = 무제한(마스터·미배정 관리역할)
      if (scope === null) {
        req.animalFarmId = farmId;
        next();
        return;
      }
      // 센티널만 들어있으면 "아무 목장도 못 봄"
      if (scope.length === 1 && scope[0] === NO_FARM_SENTINEL) {
        throw new ForbiddenError('배정된 목장이 없습니다 — 관리자에게 목장 배정을 요청하세요');
      }
      if (!scope.includes(farmId)) {
        throw new ForbiddenError('다른 목장의 개체입니다 — 접근 권한이 없습니다');
      }

      req.animalFarmId = farmId;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ── 개체 외 리소스 (우군·알림·처방·치료 등) ──
//
// 개체와 같은 구멍이 리소스 id 경로에도 있다.
//   DELETE /herd-groups/:groupId  — 남의 목장 우군을 지울 수 있다
//   GET    /prescriptions/:prescriptionId/pdf — 남의 목장 처방전을 받을 수 있다
// 리소스마다 소속 농장을 찾는 방법이 다르므로(직접 farmId / 개체 경유),
// "id → farmId" 해석기만 주입받는 얇은 미들웨어로 일반화한다.

/** 리소스 id로 소속 농장을 찾는 함수. 없으면 null. */
export type FarmIdResolver = (resourceId: string) => Promise<string | null>;

export interface ResourceAccessOptions {
  readonly param: string;
  readonly resolveFarmId: FarmIdResolver;
  /** 오류 메시지에 쓸 리소스 이름 (예: '우군', '처방전') */
  readonly label: string;
}

/**
 * 요청된 리소스가 사용자의 접근 범위 안인지 강제한다.
 * 판정 규칙은 requireAnimalAccess와 동일하다 — 배정 우선, 마스터/미배정 관리역할은 전체.
 */
export function requireResourceAccess(options: ResourceAccessOptions) {
  const { param, resolveFarmId, label } = options;

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();

      const raw: unknown = req.params[param];
      const resourceId = typeof raw === 'string' ? raw : '';
      if (!resourceId || !UUID_RE.test(resourceId)) {
        throw new NotFoundError(`${label}을(를) 찾을 수 없습니다`);
      }

      const farmId = await resolveFarmId(resourceId);
      if (!farmId) {
        throw new NotFoundError(`${label}을(를) 찾을 수 없습니다`);
      }

      const scope = scopedFarmIds(req);
      if (scope === null) { next(); return; }
      if (scope.length === 1 && scope[0] === NO_FARM_SENTINEL) {
        throw new ForbiddenError('배정된 목장이 없습니다 — 관리자에게 목장 배정을 요청하세요');
      }
      if (!scope.includes(farmId)) {
        throw new ForbiddenError(`다른 목장의 ${label}입니다 — 접근 권한이 없습니다`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

// ── 본문·쿼리로 들어오는 식별자 ──
//
// requireAnimalAccess/requireResourceAccess는 URL 경로 값만 본다.
// 그런데 레이블·관찰·처방 생성처럼 개체·농장·이벤트 id를 **본문(body)이나 쿼리**로 받는 경로가 있다.
// 예: POST /label-chat/label { animalId, farmId } — 남의 animalId에 내 farmId를 붙이면 통과하던 구조.
// 들어온 식별자 **각각을** 실제 소속 농장으로 해석해 스코프와 대조한다. 하나라도 밖이면 거부.

export type ScopedIdKind = 'animal' | 'farm' | 'event' | 'label';

export interface ScopedIdSpec {
  readonly source: 'params' | 'body' | 'query';
  readonly field: string;
  readonly kind: ScopedIdKind;
  /** 값이 없을 때 거부할지 (기본 false — 없으면 그 항목만 건너뛴다) */
  readonly required?: boolean;
}

async function resolveEventFarmId(eventId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ farmId: smaxtecEvents.farmId })
    .from(smaxtecEvents)
    .where(eq(smaxtecEvents.eventId, eventId))
    .limit(1);
  return rows[0]?.farmId ?? null;
}

async function resolveLabelFarmId(labelId: string): Promise<string | null> {
  const rows = await getDb()
    .select({ farmId: eventLabels.farmId })
    .from(eventLabels)
    .where(eq(eventLabels.labelId, labelId))
    .limit(1);
  return rows[0]?.farmId ?? null;
}

const KIND_LABEL: Readonly<Record<ScopedIdKind, string>> = {
  animal: '개체', farm: '목장', event: '이벤트', label: '레이블',
};

/** 식별자 → 소속 농장. 농장 id는 그 자체가 소속이다 (존재 여부는 핸들러가 판단). */
export async function resolveScopedFarmId(kind: ScopedIdKind, id: string): Promise<string | null> {
  switch (kind) {
    case 'animal': return getAnimalFarmId(id);
    case 'farm': return id;
    case 'event': return resolveEventFarmId(id);
    case 'label': return resolveLabelFarmId(id);
  }
}

function readField(req: Request, spec: ScopedIdSpec): string {
  const bag: unknown =
    spec.source === 'params' ? req.params
    : spec.source === 'query' ? req.query
    : req.body;
  if (!bag || typeof bag !== 'object') return '';
  const raw: unknown = (bag as Record<string, unknown>)[spec.field];
  return typeof raw === 'string' ? raw : '';
}

/**
 * 요청에 담긴 식별자들이 모두 사용자 스코프 안인지 강제한다.
 * 판정 규칙은 requireAnimalAccess와 같다 — 배정 우선, 마스터/미배정 관리역할은 전체.
 * 성공 시 개체가 있으면 `req.animalFarmId`를 채운다.
 */
export function requireScopedIds(specs: readonly ScopedIdSpec[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new UnauthorizedError();
      const scope = scopedFarmIds(req);

      for (const spec of specs) {
        const id = readField(req, spec);
        const label = KIND_LABEL[spec.kind];
        if (!id) {
          if (spec.required) throw new NotFoundError(`${label} ID가 필요합니다`);
          continue;
        }
        if (!UUID_RE.test(id)) throw new NotFoundError(`${label}을(를) 찾을 수 없습니다`);

        const farmId = await resolveScopedFarmId(spec.kind, id);
        if (!farmId) throw new NotFoundError(`${label}을(를) 찾을 수 없습니다`);
        if (spec.kind === 'animal') req.animalFarmId = farmId;

        if (scope === null) continue;
        if (scope.length === 1 && scope[0] === NO_FARM_SENTINEL) {
          throw new ForbiddenError('배정된 목장이 없습니다 — 관리자에게 목장 배정을 요청하세요');
        }
        if (!scope.includes(farmId)) {
          throw new ForbiddenError(`다른 목장의 ${label}입니다 — 접근 권한이 없습니다`);
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * 본문의 animalId 가 본문의 farmId 소속인지 — requireScopedIds(animal) 뒤에 둔다.
 * "내 목장 id + 남의 소" 조합으로 남의 소 기록을 내 목장에 붙이거나 그 반대를 막는다. (SEC-08/09)
 */
export function requireAnimalInBodyFarm(field = 'farmId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const farmId = (req.body as Record<string, unknown> | undefined)?.[field];
    if (typeof farmId === 'string' && farmId !== '' && req.animalFarmId && req.animalFarmId !== farmId) {
      res.status(400).json({ success: false, error: '개체가 해당 목장 소속이 아닙니다' });
      return;
    }
    next();
  };
}

/** 본문 animalId(필수)·farmId(필수) 스코프 검사 + 소속 일치 */
export const requireScopedAnimalAndFarmBody = [
  requireScopedIds([
    { source: 'body', field: 'animalId', kind: 'animal', required: true },
    { source: 'body', field: 'farmId', kind: 'farm', required: true },
  ]),
  requireAnimalInBodyFarm(),
];

/** 테스트·진단용 */
export const __testing = {
  clearCache: () => farmIdCache.clear(),
  cacheSize: () => farmIdCache.size,
};
