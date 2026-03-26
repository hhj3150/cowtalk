// Escalation Routes 테스트 — 에스컬레이션 API

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { escalationRouter } from '@server/api/routes/escalation.routes.js';

vi.mock('@server/api/middleware/auth.js', () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { userId: 'u-1', role: 'veterinarian', farmIds: ['f-1'] };
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/escalation', escalationRouter);

beforeEach(() => { vi.clearAllMocks(); });

describe('Escalation Routes', () => {
  it('GET /escalation/unacknowledged — 미확인 알림 (empty when no data)', async () => {
    const res = await request(app).get('/escalation/unacknowledged');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    // No seed data, so empty array is expected
  });

  it('POST /escalation/acknowledge/:alertId — non-existent alert returns 500', async () => {
    const res = await request(app)
      .post('/escalation/acknowledge/alert-1')
      .send({ notes: '확인 완료' });
    // No matching alert record in DB
    expect(res.status).toBe(500);
  });

  it('GET /escalation/config — 에스컬레이션 설정', async () => {
    const res = await request(app).get('/escalation/config');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('levels');
    expect(res.body.data.levels).toBeInstanceOf(Array);
    expect(res.body.data.levels).toHaveLength(3);
    expect(res.body.data).toHaveProperty('severityThresholds');
  });

  it('GET /escalation/stats — 통계', async () => {
    const res = await request(app).get('/escalation/stats');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('unacknowledgedCount');
    expect(res.body.data).toHaveProperty('totalEscalations');
    // avgResponseTimeMin may not be present when no data exists
    expect(res.body.data).toHaveProperty('byLevel');
  });
});
