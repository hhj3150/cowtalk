// 감사 로그 미들웨어 — 데이터 접근·변경 이력 기록 (공모사업 보안 요건)

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger.js';

const SENSITIVE_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/logout',
  '/users',
  '/animals',
  '/sensor',
  '/chat',
  '/report-generate',
  '/admin',
];

function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATHS.some((p) => path.startsWith(p));
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function auditLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isSensitivePath(req.path)) {
    next();
    return;
  }

  const start = Date.now();
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] ?? 'unknown';

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]({
      audit: true,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip,
      userAgent,
      userId: req.user?.userId,
      farmId: req.query['farmId'] ?? req.body?.farmId,
    }, `[AUDIT] ${req.method} ${req.path} → ${String(res.statusCode)}`);
  });

  next();
}
