// Express Request 확장 — req.user 타입 선언

import type { AuthTokenPayload } from '@cowtalk/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      /**
       * requireAnimalAccess가 검증하며 채운 개체의 소속 농장.
       * 값이 있다는 것은 "이 사용자가 이 개체에 접근해도 된다"가 이미 확인됐다는 뜻이다.
       * 핸들러는 같은 조회를 반복하지 말고 이 값을 쓴다.
       */
      animalFarmId?: string;
    }
  }
}
