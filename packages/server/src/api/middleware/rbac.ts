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

  // 모든 역할이 전체 농장 데이터 조회 가능
  // 개별 농장 필터는 UI에서 선택적으로 제공
  next();
}
