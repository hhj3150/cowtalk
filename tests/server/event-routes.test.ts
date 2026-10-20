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

  it('POST /events — non-UUID farmId returns 500', async () => {
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
    // non-UUID IDs cause DB validation error
    expect(res.status).toBe(500);
  });

  it('POST /events/bulk — non-UUID farmId returns 500', async () => {
    const res = await request(app)
      .post('/events/bulk')
      .send({
        events: [
          { farmId: 'f-1', animalId: 'a-1', eventType: 'observation', description: '이상 없음' },
          { farmId: 'f-1', animalId: 'a-2', eventType: 'feeding', description: '식욕 부진' },
        ],
      });
    // non-UUID IDs cause DB validation error
    expect(res.status).toBe(500);
  });

  it('GET /events/:animalId — non-UUID animalId returns 404', async () => {
    const res = await request(app).get('/events/a-1');
    // 예전엔 DB 형식 오류가 500 으로 새어 나왔다. 개체 접근 검사가 형식 오류를 '찾을 수 없음'(404)으로 처리한다
    expect(res.status).toBe(404);
  });

  // NEW-04: 이 경로는 입력과 무관한 고정 결과(신뢰도 0.85)를 '변환 성공'으로 돌려주던 자리표시였다.
  // 지어낸 데이터를 내지 않도록 미구현(501)을 알린다 — 예전 기대값(200 + parsed)은 그 가짜 응답을 굳혀 두고 있었다.
  it('POST /events/voice — 미구현을 정직하게 알린다 (가짜 변환 결과 금지)', async () => {
    const res = await request(app)
      .post('/events/voice')
      .send({ farmId: 'f-1', animalId: 'a-1' });
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    expect(res.body.data).toBeUndefined();
  });
});
