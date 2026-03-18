// Search Routes 테스트 — 검색 + 자동완성 API

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { searchRouter } from '@server/api/routes/search.routes.js';

vi.mock('@server/api/middleware/auth.js', () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { userId: 'u-1', role: 'farmer', farmIds: ['f-1'] };
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/search', searchRouter);

beforeEach(() => { vi.clearAllMocks(); });

describe('Search Routes', () => {
  it('GET /search — 통합 검색', async () => {
    const res = await request(app).get('/search?q=목장');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('total');
  });

  it('GET /search — 빈 쿼리 시 빈 결과', async () => {
    const res = await request(app).get('/search?q=');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });

  it('GET /search/autocomplete — 자동완성', async () => {
    const res = await request(app).get('/search/autocomplete?q=002');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it('GET /search/autocomplete — 2글자 미만 빈 배열', async () => {
    const res = await request(app).get('/search/autocomplete?q=a');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('GET /search — type 필터', async () => {
    const res = await request(app).get('/search?q=목장&type=farm');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
