// RBAC 미들웨어 — 역할 + 권한 검사

import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../lib/errors.js';
import { hasPermission } from '@cowtalk/shared';
import type { Role, ResourceType, ActionType } from '@cowtalk/shared';

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

/** 자신의 농장 데이터만 접근 가능 (farm-scoped 역할용) */
export function requireFarmAccess(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    throw new UnauthorizedError();
  }

  // 관리 역할은 전체 농장 접근 가능
  const adminRoles: readonly string[] = ['government_admin', 'quarantine_officer'];
  if (adminRoles.includes(req.user.role)) {
    next();
    return;
  }

  // 일반 역할: JWT의 farmIds가 비어 있으면 전체 접근 (미배정 사용자)
  const userFarmIds = req.user.farmIds ?? [];
  if (userFarmIds.length === 0) {
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
  if (adminRoles.includes(req.user.role)) {
    next();
    return;
  }

  const userFarmIds = req.user.farmIds ?? [];
  if (userFarmIds.length === 0) {
    next();
    return;
  }

  // 요청에 farmId가 없으면 → 사용자 farmIds로 자동 설정
  if (!req.query.farmId && !req.query.farmIds) {
    req.query.farmIds = userFarmIds.join(',');
  }

  next();
}
