// POST /auth/quick-login 환경 게이트 테스트
//
// 보안: quick-login은 비밀번호 없이 이메일만으로 토큰을 발급하는 데모 편의 기능이다.
// 프로덕션에 노출되면 누구나 임의 계정(예: government_admin)으로 로그인 가능한 인증 우회가 된다.
// → 개발 환경(NODE_ENV='development')에서만 동작하고, 그 외에는 404로 차단되어야 한다.
//
// 컨트롤러는 모킹해 DB 접근을 차단하고, devOnly 게이트만 검증한다.
// NODE_ENV는 config 싱글턴을 테스트별로 set/restore 하여 제어한다.

import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { config } from '../../../config/index.js';

// 컨트롤러 전체 모킹 — 실제 DB 호출 차단. 게이트를 통과하면 200 stub 반환.
vi.mock('../auth.controller.js', () => {
  const ok = (_req: Request, res: Response): void => {
    res.status(200).json({ success: true, data: { stub: true } });
  };
  return {
    register: vi.fn(ok),
    login: vi.fn(ok),
    refresh: vi.fn(ok),
    logout: vi.fn(ok),
    me: vi.fn(ok),
    quickLogin: vi.fn(ok),
    switchRole: vi.fn(ok),
    onboarding: vi.fn(ok),
  };
});

const { authRouter } = await import('../auth.routes.js');
const { errorHandler } = await import('../../middleware/error.js');

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use(errorHandler);
  return app;
}

// NODE_ENV는 테스트 환경에서 'test'이므로, 케이스별로 임시 변경 후 복원한다.
type MutableEnv = { NODE_ENV: 'development' | 'production' | 'test' };
const originalEnv = config.NODE_ENV;
afterEach(() => {
  (config as MutableEnv).NODE_ENV = originalEnv;
});

describe('POST /auth/quick-login 환경 게이트', () => {
  it('development 환경에서는 게이트 통과 → 컨트롤러 도달(200)', async () => {
    (config as MutableEnv).NODE_ENV = 'development';
    const res = await request(makeApp())
      .post('/auth/quick-login')
      .send({ email: 'demo@cowtalk.kr' });
    expect(res.status).toBe(200);
  });

  it('production 환경에서는 404로 차단(인증 우회 방지)', async () => {
    (config as MutableEnv).NODE_ENV = 'production';
    const res = await request(makeApp())
      .post('/auth/quick-login')
      .send({ email: 'demo@cowtalk.kr' });
    expect(res.status).toBe(404);
  });

  it('test 환경에서도 404로 차단(개발 외 전부 차단)', async () => {
    (config as MutableEnv).NODE_ENV = 'test';
    const res = await request(makeApp())
      .post('/auth/quick-login')
      .send({ email: 'demo@cowtalk.kr' });
    expect(res.status).toBe(404);
  });
});
