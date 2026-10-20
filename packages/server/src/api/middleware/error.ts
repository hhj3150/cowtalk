// 전역 에러 핸들러

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { ZodError } from 'zod';

/**
 * Postgres 22P02(invalid_text_representation) — 형식이 잘못된 UUID·숫자가 쿼리에 들어간 경우.
 * 사용자 입력 오류이지 서버 장애가 아니다. 예전엔 500 '예상치 못한 오류'로 떨어져 장애 화면이 떴다.
 * drizzle 은 드라이버 오류를 cause 로 감싸므로 한 단계 안쪽도 본다.
 */
export function isInvalidInputSyntaxError(err: unknown): boolean {
  const codeOf = (e: unknown): unknown => (e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined);
  if (codeOf(err) === '22P02') return true;
  const cause = err && typeof err === 'object' ? (err as { cause?: unknown }).cause : undefined;
  return codeOf(cause) === '22P02';
}

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

  if (isInvalidInputSyntaxError(err)) {
    logger.warn({ path: req.path }, '[errorHandler] 잘못된 형식의 식별자 — 400');
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_IDENTIFIER', message: '요청한 식별자의 형식이 올바르지 않습니다' },
    });
    return;
  }

  // 핸들러 안에서 schema.parse() 가 던진 검증 오류 — 사용자 입력 문제다 (예전: 500 '예상치 못한 오류')
  if (err instanceof ZodError) {
    logger.warn({ path: req.path, issues: err.issues.length }, '[errorHandler] 입력 검증 실패 — 400');
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: '요청 값이 올바르지 않습니다',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
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
