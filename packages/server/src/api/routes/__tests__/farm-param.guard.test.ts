// SEC-13 회귀 — 경로 :farmId 를 범위 검사 없이 받던 라우트들
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../../../lib/auth.js';

const MY = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
vi.mock('../../../services/auth/approval.service.js', async (orig) => ({
  ...(await orig<typeof import('../../../services/auth/approval.service.js')>()),
  isUserApproved: vi.fn(async () => true),
}));
// 범위 검사를 통과하면 DB 를 부르게 되는데, 이 테스트는 통과 여부만 본다 — 통과 시 500(빈 DB 목) 허용
vi.mock('../../../config/database.js', () => ({ getDb: () => { throw new Error('db not available in test'); } }));

const { farmParamGuard } = await import('../../middleware/rbac.js');
const { farmRouter } = await import('../farm.routes.js');
const { sensorRouter } = await import('../sensor.routes.js');
const { weatherRouter } = await import('../weather.routes.js');
const { epidemicIntelligenceRouter } = await import('../epidemic-intelligence.routes.js');
const { errorHandler } = await import('../../middleware/error.js');

function app(): express.Express {
  const a = express();
  a.use('/farms', farmRouter);
  a.use('/sensors', sensorRouter);
  a.use('/weather', weatherRouter);
  a.use('/epi', epidemicIntelligenceRouter);
  a.use(errorHandler);
  return a;
}
const farmer = `Bearer ${signAccessToken({ userId: 'f', role: 'farmer', farmIds: [MY] })}`;

describe('SEC-13 경로 :farmId 범위 검사', () => {
  it.each([
    [`/farms/${OTHER}/profile`, 404], [`/farms/${OTHER}/learning`, 404], [`/farms/${OTHER}/report-card`, 404],
    [`/sensors/farm/${OTHER}/overview`, 403], [`/weather/farm/${OTHER}`, 403], [`/epi/drilldown/${OTHER}`, 403],
  ])('농장주가 남의 목장 %s → %i', async (path, status) => {
    expect((await request(app()).get(path).set('Authorization', farmer)).status).toBe(status);
  });

  it('형식이 잘못된 farmId 는 404', async () => {
    expect((await request(app()).get('/sensors/farm/not-a-uuid/overview').set('Authorization', farmer)).status).toBe(404);
  });

  it('자기 목장은 범위 검사를 통과한다 (403/404 아님)', async () => {
    const r = await request(app()).get(`/sensors/farm/${MY}/overview`).set('Authorization', farmer);
    expect([403, 404]).not.toContain(r.status);
  });

  it('farmParamGuard 단위 — 무제한 사용자는 통과', () => {
    const next = vi.fn();
    const req = { user: { userId: 'a', role: 'government_admin', farmIds: [] } } as never;
    farmParamGuard()(req, {} as never, next, OTHER);
    expect(next).toHaveBeenCalled();
  });
});
