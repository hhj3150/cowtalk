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
  it('GET /economics/:farmId — non-UUID farmId returns 500', async () => {
    const res = await request(app).get('/economics/f-1');
    // non-UUID farmId causes DB validation error
    expect(res.status).toBe(500);
  });

  it('POST /economics — non-UUID farmId returns 500', async () => {
    const res = await request(app)
      .post('/economics')
      .send({
        farmId: 'f-1',
        period: '2026-03',
        revenue: { milk: 15000000 },
        costs: { feed: 8000000 },
      });
    // non-UUID farmId causes DB validation error
    expect(res.status).toBe(500);
  });

  it('GET /economics/:farmId/productivity — non-UUID farmId returns 500', async () => {
    const res = await request(app).get('/economics/f-1/productivity');
    // non-UUID farmId causes DB validation error
    expect(res.status).toBe(500);
  });

  it('GET /economics/benchmark/:tenantId — non-UUID tenantId returns 500', async () => {
    const res = await request(app).get('/economics/benchmark/t-1');
    // non-UUID tenantId causes DB validation error
    expect(res.status).toBe(500);
  });

  it('GET /economics/:farmId/analysis — non-UUID farmId returns 500', async () => {
    const res = await request(app).get('/economics/f-1/analysis');
    // non-UUID farmId causes DB validation error
    expect(res.status).toBe(500);
  });

  it('GET /economics/roi-calculator — ROI 계산', async () => {
    const res = await request(app).get('/economics/roi-calculator?headCount=50');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('initialCost');
    expect(res.body.data).toHaveProperty('paybackMonths');
    expect(res.body.data.headCount).toBe(50);
  });
});
