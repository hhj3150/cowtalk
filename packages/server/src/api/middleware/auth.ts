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
