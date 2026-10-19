// SEC-08 회귀 — 번식 API 의 타 목장 조회·기록 차단
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
vi.mock('../../../config/database.js', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: (c: { __id?: string }) => ({ limit: async () => (OWNER[c.__id ?? ''] ? [{ farmId: OWNER[c.__id ?? ''] }] : []) }) }) }),
  }),
}));
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('drizzle-orm');
  return { ...actual, eq: (_c: unknown, v: string) => ({ __id: v }) };
});

const calls: Array<{ fn: string; args: unknown[] }> = [];
const spy = (fn: string) => (...args: unknown[]) => { calls.push({ fn, args }); return Promise.resolve({ ok: true }); };
vi.mock('../../../services/breeding/breeding-advisor.service.js', () => ({
  getBreedingAdvice: spy('advice'), recordInsemination: spy('recordInsemination'),
  recordPregnancyCheck: spy('recordPregnancyCheck'), getBreedingFeedback: spy('feedback'),
}));
vi.mock('../../../services/breeding/breeding-insights.service.js', () => ({ getBreedingInsights: spy('insights') }));
vi.mock('../../../services/breeding/transition-risk.service.js', () => ({ getTransitionRisk: spy('transition') }));
vi.mock('../../../services/breeding/breeding-performance.service.js', () => ({
  getMonthlyTrends: spy('trends'), getFarmComparison: spy('comparison'), getParityAnalysis: spy('parity'),
}));
vi.mock('../../../services/breeding/breeding-pipeline.service.js', () => ({
  getBreedingPipeline: spy('pipeline'), getBreedingCalendarEvents: spy('calendar'),
}));
vi.mock('../../../services/breeding/sync-protocol.service.js', () => ({
  createSyncSchedule: spy('syncSchedule'), getTodaySyncTasks: spy('syncToday'),
  completeSyncTask: spy('syncComplete'), getAvailableProtocols: () => [],
}));
vi.mock('../../../services/breeding/farm-settings-sync.service.js', () => ({ getFarmBreedingSettings: spy('settings') }));
vi.mock('../../../services/breeding/semen-seed.service.js', () => ({ seedSemenCatalog: spy('seed'), syncHanwooSemenFromPublicApi: spy('hanwoo') }));

const { breedingRouter } = await import('../breeding.routes.js');
const { errorHandler } = await import('../../middleware/error.js');
const { __testing } = await import('../../middleware/animal-access.js');

function app(): express.Express {
  const a = express();
  a.use(express.json());
  a.use('/breeding', breedingRouter);
  a.use(errorHandler);
  return a;
}
const farmer = `Bearer ${signAccessToken({ userId: 'f', role: 'farmer', farmIds: [MY_FARM] })}`;
const vet2 = `Bearer ${signAccessToken({ userId: 'v', role: 'veterinarian', farmIds: [MY_FARM, '22222222-2222-4222-8222-222222222222'] })}`;
const admin = `Bearer ${signAccessToken({ userId: 'a', role: 'government_admin', farmIds: [] })}`;

beforeEach(() => { calls.length = 0; __testing.clearCache(); });
const called = (fn: string): boolean => calls.some((c) => c.fn === fn);

describe('SEC-08 번식 기록 — 남의 목장 쓰기 차단', () => {
  it('남의 소 수정 기록 403', async () => {
    const r = await request(app()).post('/breeding/inseminate').set('Authorization', farmer).send({ animalId: OTHER_COW, farmId: OTHER_FARM });
    expect(r.status).toBe(403);
    expect(called('recordInsemination')).toBe(false);
  });
  it('내 farmId + 남의 소 조합도 403', async () => {
    const r = await request(app()).post('/breeding/inseminate').set('Authorization', farmer).send({ animalId: OTHER_COW, farmId: MY_FARM });
    expect(r.status).toBe(403);
  });
  it('내 소 수정 기록은 통과', async () => {
    const r = await request(app()).post('/breeding/inseminate').set('Authorization', farmer).send({ animalId: MY_COW, farmId: MY_FARM });
    expect(r.status).toBe(200);
    expect(called('recordInsemination')).toBe(true);
  });
  it('남의 소 임신감정·발정동기화 403', async () => {
    expect((await request(app()).post('/breeding/pregnancy-check').set('Authorization', farmer)
      .send({ animalId: OTHER_COW, checkDate: '2026-10-19', result: 'open', method: 'manual' })).status).toBe(403);
    expect((await request(app()).post('/breeding/sync/schedule').set('Authorization', farmer)
      .send({ animalId: OTHER_COW, farmId: OTHER_FARM, protocol: 'PG', startDate: '2026-10-20' })).status).toBe(403);
  });
  it('남의 목장 정액 재고 조회·등록 403', async () => {
    expect((await request(app()).get(`/breeding/farm/${OTHER_FARM}/inventory`).set('Authorization', farmer)).status).toBe(403);
    expect((await request(app()).post(`/breeding/farm/${OTHER_FARM}/inventory`).set('Authorization', farmer).send({ semenId: 'x', quantity: 1 })).status).toBe(403);
    expect((await request(app()).get(`/breeding/farm/${OTHER_FARM}/settings`).set('Authorization', farmer)).status).toBe(403);
  });
  it('정액 카탈로그 시딩은 플랫폼 관리자만', async () => {
    expect((await request(app()).post('/breeding/semen/seed').set('Authorization', farmer)).status).toBe(403);
  });
});

describe('SEC-08 번식 조회 — 범위', () => {
  it('남의 목장 인사이트 직접 지정 403', async () => {
    expect((await request(app()).get(`/breeding/insights/${OTHER_FARM}`).set('Authorization', farmer)).status).toBe(403);
    expect((await request(app()).get(`/breeding/insights?farmId=${OTHER_FARM}`).set('Authorization', farmer)).status).toBe(403);
  });
  it('farmId 없이 호출하면 전 농장이 아니라 배정 목록으로 조회 (예전: 전 농장)', async () => {
    await request(app()).get('/breeding/insights').set('Authorization', vet2);
    const c = calls.find((x) => x.fn === 'insights');
    expect(c?.args[0]).toEqual([MY_FARM, '22222222-2222-4222-8222-222222222222']);
  });
  it('캘린더·추이·비교도 배정 범위', async () => {
    await request(app()).get('/breeding/calendar?startDate=2026-10-01&endDate=2026-10-31').set('Authorization', farmer);
    await request(app()).get('/breeding/performance/farm-comparison').set('Authorization', farmer);
    expect(calls.find((x) => x.fn === 'calendar')?.args[2]).toEqual([MY_FARM]);
    expect(calls.find((x) => x.fn === 'comparison')?.args[1]).toEqual([MY_FARM]);
  });
  it('무제한 관리자는 전체(undefined) 유지', async () => {
    await request(app()).get('/breeding/insights').set('Authorization', admin);
    expect(calls.find((x) => x.fn === 'insights')?.args[0]).toBeUndefined();
  });
});
