// Event Routes 테스트 — 이벤트 타입/기록/벌크/음성 API

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { eventRouter } from '@server/api/routes/event.routes.js';

// Mock auth middleware
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
app.use('/events', eventRouter);

beforeEach(() => { vi.clearAllMocks(); });

describe('Event Routes', () => {
  it('GET /events/types — 이벤트 타입 반환', async () => {
    const res = await request(app).get('/events/types');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('type');
    expect(res.body.data[0]).toHaveProperty('label');
    expect(res.body.data[0]).toHaveProperty('subTypes');
  });

  it('POST /events — 단건 이벤트 생성', async () => {
    const res = await request(app)
      .post('/events')
      .send({
        farmId: 'f-1',
        animalId: 'a-1',
        eventType: 'health',
        subType: '질병',
        description: '유방염 의심',
        severity: 'high',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('eventId');
    expect(res.body.data.eventType).toBe('health');
    expect(res.body.data.recordedBy).toBe('u-1');
  });

  it('POST /events/bulk — 벌크 이벤트 생성', async () => {
    const res = await request(app)
      .post('/events/bulk')
      .send({
        events: [
          { farmId: 'f-1', animalId: 'a-1', eventType: 'observation', description: '이상 없음' },
          { farmId: 'f-1', animalId: 'a-2', eventType: 'feeding', description: '식욕 부진' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.events).toHaveLength(2);
  });

  it('GET /events/:animalId — 개체별 이벤트 조회', async () => {
    const res = await request(app).get('/events/a-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('events');
    expect(res.body.data).toHaveProperty('total');
  });

  it('POST /events/voice — 음성 이벤트 변환', async () => {
    const res = await request(app)
      .post('/events/voice')
      .send({ farmId: 'f-1', animalId: 'a-1' });
    expect(res.status).toBe(200);
    expect(res.body.data.parsed).toHaveProperty('eventType');
    expect(res.body.data.parsed).toHaveProperty('confidence');
  });
});
