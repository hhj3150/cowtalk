// RBAC 미들웨어 — 역할 + 권한 검사

import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../lib/errors.js';
import { hasPermission } from '@cowtalk/shared';
import type { Role, ResourceType, ActionType } from '@cowtalk/shared';
import { eq, inArray, sql, type AnyColumn, type SQL } from 'drizzle-orm';

/**
 * SEC-21: 목장 범위 제한이 없는 토큰인가 — 마스터(소유자) 또는 OPEN_DATA_SCOPE 열람 토큰.
 * 데이터 범위 판정에만 쓴다. 관리 권한 판정(requirePlatformAdmin·requireRoleOrMaster)에는 isMaster 만.
 */
export function hasAllFarmScope(user: { readonly isMaster?: boolean; readonly openScope?: boolean } | undefined): boolean {
  return Boolean(user?.isMaster || user?.openScope);
}

/** 특정 역할 또는 마스터(소유자) 토큰 허용 — 방역·행정 업무 화면용 (SEC-12) */
export function requireRoleOrMaster(...roles: readonly Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new UnauthorizedError();
    if (req.user.isMaster || roles.includes(req.user.role)) {
      next();
      return;
    }
    throw new ForbiddenError(`이 작업은 ${roles.join('/')} 역할만 수행할 수 있습니다`);
  };
}

const FARM_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SEC-13: 경로 파라미터 :farmId 범위 검사 — `router.param('farmId', farmParamGuard())` 로 라우터 전체에 건다.
 * 예전엔 쿼리의 farmId 만 검사하고 경로 파라미터는 보지 않아 남의 목장 프로필·센서·기상·드릴다운이 열렸다.
 * @param hideExistence true 면 범위 밖도 404 (존재 자체를 숨김), false 면 403
 */
export function farmParamGuard(hideExistence = false) {
  return (req: Request, res: Response, next: NextFunction, value: unknown): void => {
    const farmId = typeof value === 'string' ? value : '';
    if (!FARM_UUID_RE.test(farmId)) {
      res.status(404).json({ success: false, error: '농장을 찾을 수 없습니다' });
      return;
    }
    const scope = scopedFarmIds(req);
    if (scope !== null && !scope.includes(farmId)) {
      if (hideExistence) res.status(404).json({ success: false, error: '농장을 찾을 수 없습니다' });
      else res.status(403).json({ success: false, error: '접근 권한이 없는 농장입니다' });
      return;
    }
    next();
  };
}

/** 특정 역할만 허용 */
export function requireRole(...roles: readonly Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Role '${req.user.role}' is not authorized for this resource`);
    }
    next();
  };
}

/** 권한 매트릭스 기반 검사 */
export function requirePermission(resource: ResourceType, action: ActionType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    if (!hasPermission(req.user.role, resource, action)) {
      throw new ForbiddenError(
        `Role '${req.user.role}' lacks '${action}' permission on '${resource}'`,
      );
    }
    next();
  };
}

/**
 * 플랫폼 관리 권한 — 마스터(소유자) 토큰, 또는 배정 없는(전국) 행정관만.
 * 배정이 걸린 행정관·농장주·수의사·방역관은 사용자 목록·감사 로그·시스템 작업에 접근할 수 없다. (SEC-05)
 */
export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw new UnauthorizedError();
  }
  const unrestrictedAdmin = req.user.role === 'government_admin' && (req.user.farmIds ?? []).length === 0;
  if (!req.user.isMaster && !unrestrictedAdmin) {
    throw new ForbiddenError('플랫폼 관리자만 사용할 수 있습니다');
  }
  next();
}

/**
 * 단일 farmId 를 받는 조회 API 용 범위 계산 (SEC-08).
 * - farmId 를 지정했으면 배정 스코프 안이어야 한다 (밖이면 403)
 * - 지정하지 않았으면 무제한 사용자는 전체(undefined), 제한 사용자는 자기 배정 목록
 *   (미배정 농장주·수의사는 NO_FARM_SENTINEL → 빈 결과)
 */
export function farmScopeForRequest(req: Request, requestedFarmId?: string): string | readonly string[] | undefined {
  const scope = scopedFarmIds(req);
  if (requestedFarmId) {
    if (scope !== null && !scope.includes(requestedFarmId)) {
      throw new ForbiddenError('접근 권한이 없는 농장입니다');
    }
    return requestedFarmId;
  }
  return scope === null ? undefined : scope;
}

/**
 * 요청 스코프를 쿼리 조건으로 — farmScopeForRequest 결과(단일 farmId·배정 목록·무제한)를 그대로 받는다.
 * 무제한(undefined)이면 조건 없음.
 */
export function farmScopeWhere(column: AnyColumn, scope: string | readonly string[] | undefined): SQL | undefined {
  if (scope === undefined) return undefined;
  if (typeof scope === 'string') return eq(column, scope);
  return inArray(column, [...scope]);
}

/** 원시 SQL 용 — `AND <컬럼> IN (...)` 조각 (무제한이면 빈 조각) */
export function farmScopeSqlFragment(columnSql: SQL, scope: string | readonly string[] | undefined): SQL {
  if (scope === undefined) return sql``;
  const ids = typeof scope === 'string' ? [scope] : [...scope];
  return sql`AND ${columnSql} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`;
}

/** 농장 단위 역할 — 배정된 목장 밖은 절대 볼 수 없다 */
const FARM_SCOPED_ROLES: readonly string[] = ['farmer', 'veterinarian'];

/**
 * "아무 목장도 볼 수 없음" 스코프용 센티널 UUID (nil UUID).
 * 미배정 farm-scoped 사용자의 스코프를 빈 배열로 주면 `inArray(col, [])`가
 * 드라이버에 따라 오류/전체 통과로 갈라지므로, 절대 매칭되지 않는 nil UUID
 * 1개짜리 배열로 "빈 결과"를 안전하게 강제한다.
 */
export const NO_FARM_SENTINEL = '00000000-0000-0000-0000-000000000000';

/** 자신의 농장 데이터만 접근 가능 (farm-scoped 역할용) */
export function requireFarmAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    throw new UnauthorizedError();
  }

  // 마스터 토큰(역할 전환 포함)은 전체 농장 접근 가능.
  // 관리 역할(행정·방역관)은 **배정이 없을 때만** 전체 — 배정된 관리 계정은
  // 배정 목장으로 제한된다 (배정 우선 규칙, 목록뿐 아니라 직접 조회도 동일).
  const adminRoles: readonly string[] = ['government_admin', 'quarantine_officer'];
  if (hasAllFarmScope(req.user) || (adminRoles.includes(req.user.role) && (req.user.farmIds ?? []).length === 0)) {
    next();
    return;
  }

  // farm-scoped 역할이 미배정이면: 특정 농장 요청은 전부 거부.
  // (전체 조회 요청은 통과시키되, 데이터는 scopedFarmIds 센티널로 빈 결과가 된다)
  const userFarmIds = req.user.farmIds ?? [];
  if (userFarmIds.length === 0) {
    const requestedAny =
      (req.query.farmId as string | undefined) ||
      (req.query.farmIds as string | undefined) ||
      (req.params.farmId as string | undefined);
    if (requestedAny) {
      throw new ForbiddenError('배정된 목장이 없습니다 — 관리자에게 목장 배정을 요청하세요');
    }
    next();
    return;
  }

  // 요청된 farmId가 사용자의 farmIds에 포함되는지 검증
  const requestedFarmId = req.query.farmId as string | undefined;
  const requestedFarmIds = (req.query.farmIds as string | undefined)?.split(',').filter(Boolean) ?? [];
  const paramFarmId = req.params.farmId as string | undefined;

  const allRequested = [
    ...(requestedFarmId ? [requestedFarmId] : []),
    ...requestedFarmIds,
    ...(paramFarmId ? [paramFarmId] : []),
  ];

  // 요청에 farmId가 없으면 (전체 조회) → 서버에서 자동으로 사용자 farmIds로 필터링
  if (allRequested.length === 0) {
    next();
    return;
  }

  // 요청된 farmId가 사용자에게 배정된 farmId인지 확인
  const unauthorized = allRequested.filter((fid) => !userFarmIds.includes(fid));
  if (unauthorized.length > 0) {
    throw new ForbiddenError('접근 권한이 없는 농장이 포함되어 있습니다');
  }

  next();
}

/**
 * 요청 사용자가 접근 가능한 farmId 목록을 반환한다 (데이터 격리용).
 * **배정 우선(assignment-first) 규칙**:
 * - `user_farm_access`로 농장이 **배정돼 있으면 역할 불문** 그 농장들로만 스코프(배열 반환).
 *   → 수의사·농장주뿐 아니라 "특정 농장만 담당"하는 행정관·방역관 계정도 격리된다.
 * - **배정이 없으면**:
 *   - 관리 역할(마스터·행정·방역관): 제한 없음(`null` = 전체 조회).
 *   - farm-scoped 역할(농장주·수의사): **아무 목장도 볼 수 없음** — NO_FARM_SENTINEL
 *     배열을 반환해 모든 farmId 필터가 빈 결과가 되게 한다.
 *     (과거의 "미배정 = 전체 접근"은 데이터 격리 위반이라 제거)
 *
 * 목록·집계 라우트(farms, animals, regional 등)에서
 * `WHERE inArray(farmId, scoped)` 필터로 사용한다.
 * enforceFarmScope(req.query 변형)와 달리 라우트가 직접 호출해 DB 쿼리에 강제 적용한다.
 */
export function scopedFarmIds(req: Request): readonly string[] | null {
  if (!req.user) {
    return null;
  }
  const farmIds = req.user.farmIds ?? [];
  if (farmIds.length > 0) {
    return farmIds;
  }
  // 마스터 토큰(역할 전환 시뮬레이션 포함)은 전체 유지
  if (FARM_SCOPED_ROLES.includes(req.user.role) && !hasAllFarmScope(req.user)) {
    return [NO_FARM_SENTINEL];
  }
  return null;
}

/**
 * 대시보드 라우터용 **유효 farmIds** 계산 — 클라이언트 요청과 배정 스코프(실링)를 합성한다.
 *
 * 배경: 대시보드 라우터들은 요청별 `AsyncLocalStorage`(farmIdsStorage)에 farmIds를 담아
 * 모든 하위 쿼리를 필터링한다. 과거엔 `enforceFarmScope`가 `req.query.farmIds`를 주입해
 * 기본 스코프를 넣었으나, **Express 5에서 `req.query`는 getter라 주입이 소실**된다.
 * → 미선택(기본) 요청이 전국으로 누수됐다. 이 헬퍼가 storage 시드 단계에서 실링을 강제한다.
 *
 * 규칙(배정 우선):
 * - `scope === null` (마스터·관리역할·미배정): 요청대로. 빈 배열이면 전체 조회.
 * - `scope = [...]` (배정된 사용자): 요청∩스코프. 단 교집합이 비면(스코프 밖 농장만 요청)
 *   **전체로 확대하지 않고** 배정 농장 전체로 폴백한다. → 제한 사용자는 절대 전국을 못 본다.
 *
 * @param requested 클라이언트가 보낸 farmIds (없으면 빈 배열)
 * @param scope     scopedFarmIds(req) 결과 (배정 농장 또는 null=무제한)
 */
export function resolveScopedFarmIds(
  requested: readonly string[],
  scope: readonly string[] | null,
): readonly string[] {
  if (scope === null) {
    return requested;
  }
  if (requested.length === 0) {
    return scope;
  }
  const intersection = requested.filter((id) => scope.includes(id));
  return intersection.length > 0 ? intersection : scope;
}

/** farmIds를 JWT 기준으로 강제 필터링하는 미들웨어 */
export function enforceFarmScope(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next();
    return;
  }

  const adminRoles: readonly string[] = ['government_admin', 'quarantine_officer'];
  if (hasAllFarmScope(req.user) || (adminRoles.includes(req.user.role) && (req.user.farmIds ?? []).length === 0)) {
    next();
    return;
  }

  const userFarmIds = req.user.farmIds ?? [];
  if (userFarmIds.length === 0) {
    // 미배정 farm-scoped 사용자 — 센티널로 빈 결과 강제 (best-effort, Express 5 getter 주의)
    if (FARM_SCOPED_ROLES.includes(req.user.role) && !req.query.farmId && !req.query.farmIds) {
      req.query.farmIds = NO_FARM_SENTINEL;
    }
    next();
    return;
  }

  // 요청에 farmId가 없으면 → 사용자 farmIds로 자동 설정
  if (!req.query.farmId && !req.query.farmIds) {
    req.query.farmIds = userFarmIds.join(',');
  }

  next();
}
