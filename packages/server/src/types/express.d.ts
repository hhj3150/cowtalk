// Express Request 확장 — req.user 타입 선언

import type { AuthTokenPayload } from '@cowtalk/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}
