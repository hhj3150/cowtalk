// SEC-17 회귀 — 공개 가입이 검증 없이 농장 행을 활성 상태로 무제한 만들던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const farmInserts: Array<Record<string, unknown>> = [];
vi.mock('../../../db/repositories/user.repo.js', async (orig) => ({
  ...(await orig<typeof import('../../../db/repositories/user.repo.js')>()),
  findUserByEmail: vi.fn(async () => null),
  createUser: vi.fn(async (u: { name: string; email: string }) => ({ userId: 'u1', name: u.name, email: u.email, role: 'farmer' })),
  addUserFarmAccess: vi.fn(async () => undefined),
  saveRefreshToken: vi.fn(async () => undefined),
}));
vi.mock('../../../config/database.js', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ limit: async () => [{ regionId: 'r1' }] }) }),
    insert: () => ({ values: (v: Record<string, unknown>) => { farmInserts.push(v); return { returning: async () => [{ farmId: 'farm-new' }] }; } }),
  }),
}));

const { authRouter } = await import('../auth.routes.js');
const { errorHandler } = await import('../../middleware/error.js');
function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/auth', authRouter);
  a.use(errorHandler);
  return a;
}

beforeEach(() => { farmInserts.length = 0; });

describe('SEC-17 /auth/onboarding', () => {
  it.each([
    [{ name: 'a', email: 'x@y.z', password: '12345678' }],
    [{ name: '김목장', email: 'not-an-email', password: '12345678' }],
    [{ name: '김목장', email: 'x@y.z', password: 'short' }],
    [{ name: '김목장', email: 'x@y.z', password: '12345678', farm: { name: 'x'.repeat(500) } }],
  ])('잘못된 입력은 400: %j', async (body) => {
    expect((await request(app()).post('/auth/onboarding').send(body)).status).toBe(400);
    expect(farmInserts).toHaveLength(0);
  });

  it('가입 농장은 승인 전까지 pending (전국 통계·목록 제외)', async () => {
    const r = await request(app()).post('/auth/onboarding').send({ name: '김목장', email: 'kim@farm.kr', password: '12345678', role: 'farmer', farm: { name: '김목장' } });
    expect(r.status).toBe(201);
    expect(farmInserts[0]).toMatchObject({ status: 'pending' });
  });
});
