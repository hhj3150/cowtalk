// 인증 미들웨어 — JWT 검증 + req.user 주입

import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../../lib/auth.js';
import { UnauthorizedError } from '../../lib/errors.js';

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

/** 선택적 인증 — 토큰이 있으면 파싱, 없어도 통과 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(header.slice(7));
    } catch {
      // 토큰 무효해도 통과 (optional)
    }
  }
  next();
}

/**
 * 역할 가드 — authenticate 뒤에 사용. req.user.role이 허용 목록에 없으면 403.
 *   router.post('/...', authenticate, requireRole('quarantine_officer', 'government_admin'), handler);
 */
export function requireRole(
  ...allowed: readonly string[]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: `이 작업은 ${allowed.join('/')} 역할만 수행할 수 있습니다` },
      });
      return;
    }
    next();
  };
}
