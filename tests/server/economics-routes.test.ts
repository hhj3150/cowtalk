// Economics Routes 테스트 — 경제성 분석 API

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { economicsRouter } from '@server/api/routes/economics.routes.js';

vi.mock('@server/api/middleware/auth.js', () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { userId: 'u-1', role: 'farmer', farmIds: ['f-1'] };
    next();
  },
}));

vi.mock('@server/api/middleware/rbac.js', () => ({
  requireFarmAccess: (_req: any, _res: any, next: any) => next(),
}));

const app = express();
app.use(express.json());
app.use('/economics', economicsRouter);

beforeEach(() => { vi.clearAllMocks(); });

describe('Economics Routes', () => {
  it('GET /economics/:farmId — 경제 데이터 조회', async () => {
    const res = await request(app).get('/economics/f-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data[0]).toHaveProperty('revenue');
    expect(res.body.data[0]).toHaveProperty('costs');
    expect(res.body.data[0]).toHaveProperty('profitMargin');
  });

  it('POST /economics — 경제 데이터 저장', async () => {
    const res = await request(app)
      .post('/economics')
      .send({
        farmId: 'f-1',
        period: '2026-03',
        revenue: { milk: 15000000 },
        costs: { feed: 8000000 },
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('economicsId');
    expect(res.body.data.farmId).toBe('f-1');
  });

  it('GET /economics/:farmId/productivity — 생산성 조회', async () => {
    const res = await request(app).get('/economics/f-1/productivity');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('avgMilkYield');
    expect(res.body.data).toHaveProperty('trend');
    expect(res.body.data.trend).toBeInstanceOf(Array);
  });

  it('GET /economics/benchmark/:tenantId — 벤치마크', async () => {
    const res = await request(app).get('/economics/benchmark/t-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('myFarm');
    expect(res.body.data).toHaveProperty('tenantAvg');
    expect(res.body.data).toHaveProperty('ranking');
  });

  it('GET /economics/:farmId/analysis — AI 분석', async () => {
    const res = await request(app).get('/economics/f-1/analysis');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('summary');
    expect(res.body.data).toHaveProperty('recommendations');
  });

  it('GET /economics/roi-calculator — ROI 계산', async () => {
    const res = await request(app).get('/economics/roi-calculator?headCount=50');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('initialCost');
    expect(res.body.data).toHaveProperty('paybackMonths');
    expect(res.body.data.headCount).toBe(50);
  });
});
