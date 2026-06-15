// 개발 전용 라우트 게이트 — production/test 환경에서는 엔드포인트 자체를 숨긴다.
//
// 보안: quick-login 같은 "비밀번호 없이 토큰 발급" 데모 편의 기능은
// 개발/데모 환경에서만 동작해야 한다. 프로덕션에 노출되면 인증 우회가 된다.
// 404(NotFoundError)로 응답해 엔드포인트 존재 자체를 드러내지 않는다.

import type { Request, Response, NextFunction } from 'express';
import { config } from '../../config/index.js';
import { NotFoundError } from '../../lib/errors.js';

/** config.NODE_ENV가 'development'가 아니면 404로 차단한다. */
export function devOnly(_req: Request, _res: Response, next: NextFunction): void {
  if (config.NODE_ENV !== 'development') {
    throw new NotFoundError();
  }
  next();
}
