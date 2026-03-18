// HTTP 요청 로깅 미들웨어

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger.js';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userId: req.user?.userId,
    }, `${req.method} ${req.path} ${String(res.statusCode)} ${String(duration)}ms`);
  });

  next();
}
