// Zod 검증 미들웨어

import type { Request, Response, NextFunction } from 'express';
import { type ZodSchema, ZodError } from 'zod';
import { BadRequestError } from '../../lib/errors.js';

type ValidationTarget = 'body' | 'query' | 'params';

interface ValidateOptions {
  readonly body?: ZodSchema;
  readonly query?: ZodSchema;
  readonly params?: ZodSchema;
}

/**
 * Zod 스키마로 요청 검증.
 * 성공 시 파싱된 값으로 req[target] 교체.
 */
export function validate(schemas: ValidateOptions) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const targets: readonly ValidationTarget[] = ['body', 'query', 'params'];

    for (const target of targets) {
      const schema = schemas[target];
      if (!schema) continue;

      try {
        const parsed = schema.parse(req[target]);
        // 파싱된 결과 저장 (Express 5에서 query는 getter-only)
        if (target === 'body') {
          req.body = parsed;
        } else {
          // query/params는 읽기전용이므로 원본 데이터를 검증만 수행
          // (coerce 결과는 라우트 핸들러에서 직접 변환)
        }
      } catch (error) {
        if (error instanceof ZodError) {
          const details = error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          }));
          throw new BadRequestError(
            `Validation failed: ${details.map((d) => `${d.path}: ${d.message}`).join(', ')}`,
            'VALIDATION_ERROR',
          );
        }
        throw error;
      }
    }

    next();
  };
}
