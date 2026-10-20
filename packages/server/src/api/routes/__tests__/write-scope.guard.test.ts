// SEC-09 회귀 — 본문 farmId·animalId 로 남의 목장에 기록하던 경로들
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../../../lib/auth.js';

const MY_FARM = '11111111-1111-4111-8111-111111111111';
const OTHER_FARM = '99999999-9999-4999-8999-999999999999';
const MY_COW = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_COW = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER: Record<string, string> = { [MY_COW]: MY_FARM, [OTHER_COW]: OTHER_FARM };

vi.mock('../../../services/auth/approval.service.js', async (orig) => ({
  ...(await orig<typeof import('../../../services/auth/approval.service.js')>()),
  isUserApproved: vi.fn(async () => true),
}));
const inserts: unknown[] = [];
vi.mock('../../../config/database.js', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: (c: { __id?: string }) => ({ limit: async () => (OWNER[c.__id ?? ''] ? [{ farmId: OWNER[c.__id ?? ''] }] : []) }) }) }),
    insert: () => ({ values: (v: unknown) => { inserts.push(v); return { returning: async () => [{ id: 'x' }] }; } }),
  }),
}));
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('drizzle-orm');
  return { ...actual, eq: (_c: unknown, v: string) => ({ __id: v }) };
});

const { eventRouter, assertBulkEventsInScope } = await import('../event.routes.js');
const { calvingRouter } = await import('../calving.routes.js');
const { weightRouter } = await import('../weight.routes.js');
const { economicsRouter } = await import('../economics.routes.js');
const { toMilkInput } = await import('../milk.routes.js');
const { errorHandler } = await import('../../middleware/error.js');
const { __testing } = await import('../../middleware/animal-access.js');

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/events', eventRouter);
  a.use('/calving', calvingRouter);
  a.use('/weight', weightRouter);
  a.use('/economics', economicsRouter);
  a.use(errorHandler);
  return a;
}
const farmer = `Bearer ${signAccessToken({ userId: 'f', role: 'farmer', farmIds: [MY_FARM] })}`;

beforeEach(() => { inserts.length = 0; __testing.clearCache(); });

describe('SEC-09 남의 목장 기록 차단', () => {
  it('이벤트: 남의 farmId 403, 내 farmId + 남의 소 400/403', async () => {
    expect((await request(app()).post('/events').set('Authorization', farmer).send({ farmId: OTHER_FARM, eventType: 'x' })).status).toBe(403);
    const mixed = await request(app()).post('/events').set('Authorization', farmer).send({ farmId: MY_FARM, animalId: OTHER_COW });
    expect([400, 403]).toContain(mixed.status);
    expect(inserts).toHaveLength(0);
  });
  it('분만: 남의 소 403', async () => {
    expect((await request(app()).post('/calving/record').set('Authorization', farmer).send({ animalId: OTHER_COW })).status).toBe(403);
    expect(inserts).toHaveLength(0);
  });
  it('체중: 남의 소·남의 목장 403', async () => {
    expect((await request(app()).post('/weight').set('Authorization', farmer).send({ animalId: OTHER_COW, farmId: OTHER_FARM, actualWeightKg: 500 })).status).toBe(403);
  });
  it('손익: 남의 목장 403', async () => {
    expect((await request(app()).post('/economics').set('Authorization', farmer).send({ farmId: OTHER_FARM, period: '2026-10', revenue: {}, costs: {} })).status).toBe(403);
  });
});

describe('SEC-09 벌크 이벤트', () => {
  it('하나라도 남의 목장이면 전체 거부', async () => {
    await expect(assertBulkEventsInScope([{ farmId: MY_FARM }, { farmId: OTHER_FARM }], [MY_FARM])).rejects.toThrow(/다른 목장/);
  });
  it('개체가 해당 목장 소속이 아니면 거부', async () => {
    await expect(assertBulkEventsInScope([{ farmId: MY_FARM, animalId: OTHER_COW }], [MY_FARM])).rejects.toThrow(/소속/);
  });
  it('정상 건은 통과', async () => {
    await expect(assertBulkEventsInScope([{ farmId: MY_FARM, animalId: MY_COW }], [MY_FARM])).resolves.toBeUndefined();
  });
});

describe('SEC-09 유량 입력', () => {
  it('본문의 allowedFarmIds 는 무시하고 서버 스코프로 채운다', () => {
    const input = toMilkInput({ animalId: OTHER_COW, yieldL: 30, allowedFarmIds: [OTHER_FARM] }, [MY_FARM]);
    expect(input.allowedFarmIds).toEqual([MY_FARM]);
  });
  it('허용 필드만 담는다', () => {
    const input = toMilkInput({ earTag: '423', yieldL: 30, hacked: 1 }, null) as unknown as Record<string, unknown>;
    expect(input).not.toHaveProperty('hacked');
    expect(input.allowedFarmIds).toBeNull();
  });
});
