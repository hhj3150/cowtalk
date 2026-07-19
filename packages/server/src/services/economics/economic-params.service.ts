// 경제 파라미터 서비스 — 기본값(카탈로그) + 글로벌/농장 오버라이드 병합
//
// 원칙: 경제 계산식의 단가·비용은 하드코딩하지 않는다.
// - 병합·검증은 순수 함수 (단위 테스트 대상)
// - DB에는 오버라이드 행만 존재 — 기본값과 같더라도 명시 저장은 허용(운영자가 고정 의도)
// - 60초 캐시: 결정 큐 등 핫패스에서 매 요청 DB 왕복 방지

import { and, eq, isNull, or, inArray } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { economicParameters } from '../../db/schema.js';
import {
  ECONOMIC_PARAMETER_DEFS,
  ECONOMIC_PARAMETER_MAP,
  isEconomicParameterKey,
} from '@cowtalk/shared';
import type {
  EconomicParameterKey,
  EconomicParameterView,
} from '@cowtalk/shared';
import { logger } from '../../lib/logger.js';

export interface OverrideRow {
  readonly farmId: string | null;
  readonly paramKey: string;
  readonly value: number;
  readonly updatedAt: Date;
}

/** 병합 (순수) — 기본값 < 글로벌(farmId null) < 농장별 순으로 덮어쓴다 */
export function mergeParameterViews(
  overrides: readonly OverrideRow[],
  farmId?: string,
): EconomicParameterView[] {
  const globals = new Map<string, OverrideRow>();
  const farmOnes = new Map<string, OverrideRow>();
  for (const row of overrides) {
    if (!isEconomicParameterKey(row.paramKey)) continue; // 카탈로그에서 제거된 키는 무시
    if (row.farmId === null) globals.set(row.paramKey, row);
    else if (farmId && row.farmId === farmId) farmOnes.set(row.paramKey, row);
  }

  return ECONOMIC_PARAMETER_DEFS.map((def) => {
    const farmRow = farmOnes.get(def.key);
    const globalRow = globals.get(def.key);
    const chosen = farmRow ?? globalRow;
    return {
      key: def.key,
      labelKo: def.labelKo,
      unit: def.unit,
      value: chosen?.value ?? def.defaultValue,
      defaultValue: def.defaultValue,
      source: farmRow ? 'farm' : globalRow ? 'global' : 'default',
      basis: def.basis,
      updatedAt: chosen?.updatedAt.toISOString() ?? null,
    };
  });
}

/** 값 검증 (순수) — 카탈로그의 min/max 범위, 유한수만 허용 */
export function validateParameterValue(
  key: string,
  value: number,
): { ok: true; key: EconomicParameterKey } | { ok: false; reason: string } {
  if (!isEconomicParameterKey(key)) {
    return { ok: false, reason: `알 수 없는 파라미터 키: ${key}` };
  }
  const def = ECONOMIC_PARAMETER_MAP[key];
  if (!Number.isFinite(value)) {
    return { ok: false, reason: '값은 유한한 숫자여야 합니다' };
  }
  if (value < def.min || value > def.max) {
    return {
      ok: false,
      reason: `${def.labelKo} 허용 범위(${def.min}~${def.max} ${def.unit})를 벗어났습니다`,
    };
  }
  return { ok: true, key };
}

// ===========================
// DB 접근 + 캐시
// ===========================

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; views: EconomicParameterView[] }>();

function cacheKey(farmId?: string): string {
  return farmId ?? '__global__';
}

export function invalidateEconomicParamsCache(): void {
  cache.clear();
}

/** 유효 파라미터 목록 (정의 + 유효값 + 출처) */
export async function listEconomicParams(farmId?: string): Promise<EconomicParameterView[]> {
  const key = cacheKey(farmId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.views;

  const db = getDb();
  const rows = await db
    .select({
      farmId: economicParameters.farmId,
      paramKey: economicParameters.paramKey,
      value: economicParameters.value,
      updatedAt: economicParameters.updatedAt,
    })
    .from(economicParameters)
    .where(
      farmId
        ? or(isNull(economicParameters.farmId), eq(economicParameters.farmId, farmId))
        : isNull(economicParameters.farmId),
    );

  const views = mergeParameterViews(rows, farmId);
  cache.set(key, { at: Date.now(), views });
  return views;
}

/** 유효값 맵 — 경제 환산 코드가 쓰는 형태. DB 장애 시 카탈로그 기본값으로 폴백 */
export async function getEconomicParamValues(
  farmId?: string,
): Promise<Record<EconomicParameterKey, number>> {
  try {
    const views = await listEconomicParams(farmId);
    return Object.fromEntries(views.map((v) => [v.key, v.value])) as Record<
      EconomicParameterKey,
      number
    >;
  } catch (err) {
    logger.warn({ err, farmId }, '[EconomicParams] 조회 실패 — 카탈로그 기본값 폴백');
    return Object.fromEntries(
      ECONOMIC_PARAMETER_DEFS.map((d) => [d.key, d.defaultValue]),
    ) as Record<EconomicParameterKey, number>;
  }
}

/** 여러 농장의 유효값 맵 일괄 조회 (결정 큐 등 다농장 화면용) */
export async function getEconomicParamValuesByFarm(
  farmIds: readonly string[],
): Promise<Map<string, Record<EconomicParameterKey, number>>> {
  const unique = [...new Set(farmIds)];
  const result = new Map<string, Record<EconomicParameterKey, number>>();
  if (unique.length === 0) return result;

  try {
    const db = getDb();
    const rows = await db
      .select({
        farmId: economicParameters.farmId,
        paramKey: economicParameters.paramKey,
        value: economicParameters.value,
        updatedAt: economicParameters.updatedAt,
      })
      .from(economicParameters)
      .where(or(isNull(economicParameters.farmId), inArray(economicParameters.farmId, unique)));

    for (const fid of unique) {
      const views = mergeParameterViews(rows, fid);
      result.set(
        fid,
        Object.fromEntries(views.map((v) => [v.key, v.value])) as Record<
          EconomicParameterKey,
          number
        >,
      );
    }
  } catch (err) {
    logger.warn({ err }, '[EconomicParams] 일괄 조회 실패 — 카탈로그 기본값 폴백');
    const defaults = Object.fromEntries(
      ECONOMIC_PARAMETER_DEFS.map((d) => [d.key, d.defaultValue]),
    ) as Record<EconomicParameterKey, number>;
    for (const fid of unique) result.set(fid, defaults);
  }
  return result;
}

/** 오버라이드 저장 (upsert) — farmId 없으면 글로벌 */
export async function upsertEconomicParam(input: {
  readonly key: EconomicParameterKey;
  readonly value: number;
  readonly farmId?: string;
  readonly userId: string;
}): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ paramId: economicParameters.paramId })
    .from(economicParameters)
    .where(
      and(
        eq(economicParameters.paramKey, input.key),
        input.farmId
          ? eq(economicParameters.farmId, input.farmId)
          : isNull(economicParameters.farmId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(economicParameters)
      .set({ value: input.value, updatedBy: input.userId, updatedAt: new Date() })
      .where(eq(economicParameters.paramId, existing[0]!.paramId));
  } else {
    await db.insert(economicParameters).values({
      farmId: input.farmId ?? null,
      paramKey: input.key,
      value: input.value,
      updatedBy: input.userId,
    });
  }
  invalidateEconomicParamsCache();
}

/** 오버라이드 제거 — 유효값이 상위(글로벌 또는 기본값)로 되돌아간다 */
export async function deleteEconomicParamOverride(
  key: EconomicParameterKey,
  farmId?: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(economicParameters)
    .where(
      and(
        eq(economicParameters.paramKey, key),
        farmId ? eq(economicParameters.farmId, farmId) : isNull(economicParameters.farmId),
      ),
    );
  invalidateEconomicParamsCache();
}
