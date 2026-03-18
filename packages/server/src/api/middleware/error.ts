// 전역 에러 핸들러

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    // 운영 에러 → 클라이언트에 안전하게 전달
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, 'Server error');
    } else {
      logger.warn({ code: err.code, path: req.path }, err.message);
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // 예상치 못한 에러 → 500 + 상세 숨김
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

/** 404 핸들러 */
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
    },
  });
}
