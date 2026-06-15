// POST /auth/register 인가 게이트 테스트
//
// 보안: 공개 self-register 금지 — 관리자(government_admin, user:create 권한)만 계정 생성 가능.
// 컨트롤러는 모킹해 DB 접근을 차단하고, authenticate + requirePermission 게이트만 검증한다.

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import type { Role } from '@cowtalk/shared';
import { signAccessToken } from '../../../lib/auth.js';

// 컨트롤러 전체 모킹 — 실제 DB 호출 차단. 게이트를 통과하면 201 stub 반환.
vi.mock('../auth.controller.js', () => {
  const ok = (_req: Request, res: Response): void => {
    res.status(201).json({ success: true, data: { stub: true } });
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

const validBody = {
  name: '홍길동',
  email: 'new-account@cowtalk.kr',
  password: 'password123',
  role: 'veterinarian',
};

function tokenFor(role: Role): string {
  return signAccessToken({ userId: `user-${role}`, role, farmIds: [] });
}

describe('POST /auth/register 인가 게이트', () => {
  it('인증 토큰이 없으면 401', async () => {
    const res = await request(makeApp()).post('/auth/register').send(validBody);
    expect(res.status).toBe(401);
  });

  it('farmer 토큰은 403 (user:create 권한 없음)', async () => {
    const res = await request(makeApp())
      .post('/auth/register')
      .set('Authorization', `Bearer ${tokenFor('farmer')}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('veterinarian 토큰은 403', async () => {
    const res = await request(makeApp())
      .post('/auth/register')
      .set('Authorization', `Bearer ${tokenFor('veterinarian')}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('quarantine_officer 토큰은 403 (user:read만 보유)', async () => {
    const res = await request(makeApp())
      .post('/auth/register')
      .set('Authorization', `Bearer ${tokenFor('quarantine_officer')}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('government_admin 토큰은 게이트 통과 → 컨트롤러 도달(201)', async () => {
    const res = await request(makeApp())
      .post('/auth/register')
      .set('Authorization', `Bearer ${tokenFor('government_admin')}`)
      .send(validBody);
    expect(res.status).toBe(201);
  });

  it('government_admin이라도 잘못된 body는 검증 단계에서 400', async () => {
    const res = await request(makeApp())
      .post('/auth/register')
      .set('Authorization', `Bearer ${tokenFor('government_admin')}`)
      .send({ name: 'x', email: 'not-an-email', password: '123' });
    expect(res.status).toBe(400);
  });
});
