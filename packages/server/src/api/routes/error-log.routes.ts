// 프론트엔드 에러 로그 수집 — /api/errors/log
// Sentry 연동 전 최소한의 에러 수집 인터페이스

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../../lib/logger.js';

export const errorLogRouter = Router();

errorLogRouter.use(authenticate);

interface ClientError {
  readonly message: string;
  readonly stack?: string;
  readonly source?: string;
  readonly lineno?: number;
  readonly colno?: number;
  readonly url?: string;
  readonly userAgent?: string;
  readonly timestamp?: string;
  readonly type?: 'error' | 'unhandledrejection' | 'react' | 'api';
  readonly componentStack?: string;
  readonly extra?: Record<string, unknown>;
}

// POST /api/errors/log — 프론트엔드 에러 수집
errorLogRouter.post('/log', (req: Request, res: Response, next: NextFunction) => {
  try {
    const error = req.body as ClientError;
    const userId = req.user?.userId ?? 'anonymous';
    const role = req.user?.role ?? 'unknown';

    // 메시지 길이 제한 (DoS 방지)
    const message = (error.message ?? '').slice(0, 2000);
    const stack = (error.stack ?? '').slice(0, 5000);

    logger.warn({
      clientError: {
        message,
        stack,
        source: error.source,
        lineno: error.lineno,
        colno: error.colno,
        url: error.url,
        type: error.type ?? 'error',
        componentStack: (error.componentStack ?? '').slice(0, 2000),
      },
      userId,
      role,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    }, `[ClientError] ${message.slice(0, 100)}`);

    res.json({ success: true, data: { received: true } });
  } catch (err) {
    next(err);
  }
});

// POST /api/errors/batch — 배치 에러 수집 (오프라인 복구 시)
errorLogRouter.post('/batch', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { errors } = req.body as { errors: readonly ClientError[] };
    const limited = (errors ?? []).slice(0, 50); // 최대 50건

    for (const error of limited) {
      logger.warn({
        clientError: {
          message: (error.message ?? '').slice(0, 2000),
          type: error.type ?? 'error',
          url: error.url,
          timestamp: error.timestamp,
        },
        userId: req.user?.userId,
      }, `[ClientError:Batch] ${(error.message ?? '').slice(0, 80)}`);
    }

    res.json({ success: true, data: { received: limited.length } });
  } catch (err) {
    next(err);
  }
});
