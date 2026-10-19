// 전역 에러 핸들러

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
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

  // 스키마 검증 실패 → 400.
  // 라우트가 `schema.parse(req.body)` 를 인라인으로 쓰면 ZodError 가 그대로 next() 로 흘러
  // '예상치 못한 에러'로 분류돼 500 + "An unexpected error occurred" 가 나갔다.
  // 잘못 보낸 요청은 서버 장애가 아니므로 어디가 틀렸는지 알려준다 (값은 싣지 않는다).
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({
      field: i.path.join('.') || '(root)',
      message: i.message,
    }));
    logger.warn({ path: req.path, issues }, 'Validation failed');
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '요청 값이 올바르지 않습니다',
        details: issues,
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
