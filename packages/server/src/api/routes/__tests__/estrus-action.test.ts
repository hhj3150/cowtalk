// DI-15 회귀 — /dashboard/estrus-action 이 type 'ai'·farmId 없이·중복 방지 없이 기록하던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../../../lib/auth.js';

const FARM = '11111111-1111-4111-8111-111111111111';
const COW = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const inserted: Array<Record<string, unknown>> = [];
const recordInsemination = vi.fn(async () => ({ eventId: 'be-1' }));

vi.mock('../../../services/auth/approval.service.js', async (orig) => ({
  ...(await orig<typeof import('../../../services/auth/approval.service.js')>()),
  isUserApproved: vi.fn(async () => true),
}));
vi.mock('../../../services/breeding/breeding-advisor.service.js', () => ({ recordInsemination }));
vi.mock('../../../config/database.js', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: (c: { __id?: string }) => ({ limit: async () => (c.__id === COW ? [{ farmId: FARM }] : []) }) }) }),
    insert: () => ({ values: async (v: Record<string, unknown>) => { inserted.push(v); } }),
  }),
}));
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('drizzle-orm');
  return { ...actual, eq: (_c: unknown, v: string) => ({ __id: v }) };
});

const { dashboardRouter } = await import('../dashboard.routes.js');
const { errorHandler } = await import('../../middleware/error.js');
const { __testing } = await import('../../middleware/animal-access.js');
function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/dashboard', dashboardRouter);
  a.use(errorHandler);
  return a;
}
const farmer = `Bearer ${signAccessToken({ userId: 'f', role: 'farmer', farmIds: [FARM] })}`;

beforeEach(() => { inserted.length = 0; recordInsemination.mockClear(); __testing.clearCache(); });

describe('DI-15 /dashboard/estrus-action', () => {
  it('수정 실시는 표준 경로(recordInsemination — 트랜잭션·중복 방지)로, 개체의 실제 목장으로 기록', async () => {
    const r = await request(app()).post('/dashboard/estrus-action').set('Authorization', farmer).send({ animalId: COW, action: 'inseminated', semenName: 'KPN1234' });
    expect(r.status).toBe(200);
    expect(recordInsemination).toHaveBeenCalledWith(expect.objectContaining({ animalId: COW, farmId: FARM, semenInfo: 'KPN1234' }));
  });
  it("수정 안 함은 'no_insemination' + farmId + 사유", async () => {
    await request(app()).post('/dashboard/estrus-action').set('Authorization', farmer).send({ animalId: COW, action: 'skipped', skipReason: '유량 높음' });
    expect(inserted[0]).toMatchObject({ type: 'no_insemination', farmId: FARM, noInseminationReason: '유량 높음' });
  });
  it('알 수 없는 action 은 400', async () => {
    expect((await request(app()).post('/dashboard/estrus-action').set('Authorization', farmer).send({ animalId: COW, action: 'x' })).status).toBe(400);
  });
});
