// 지오코딩 라우트 — 주소→좌표 (Kakao 키 없으면 Nominatim 폴백)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('@server/api/middleware/auth.js', () => ({
  authenticate: (_req: any, _res: any, next: any) => {
    _req.user = { userId: '44444444-aaaa-4bbb-8ccc-000000000001', role: 'farmer' };
    next();
  },
}));

import { geoRouter } from '@server/api/routes/geo.routes.js';

const app = express();
app.use('/geo', geoRouter);

const realFetch = global.fetch;

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { global.fetch = realFetch; });

describe('GET /geo/geocode', () => {
  it('3자 미만 쿼리 — 400', async () => {
    const res = await request(app).get('/geo/geocode?query=ab');
    expect(res.status).toBe(400);
  });

  it('Kakao 키 없음 → Nominatim 폴백 결과 반환', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { display_name: '갈전리, 미양면, 안성시, 경기도', lat: '36.9689', lon: '127.2439' },
      ]),
    } as unknown as Response);

    const res = await request(app).get('/geo/geocode?query=' + encodeURIComponent('경기도 안성시 미양면 갈전리 286-8'));
    expect(res.status).toBe(200);
    expect(res.body.data.results).toHaveLength(1);
    expect(res.body.data.results[0].provider).toBe('nominatim');
    expect(res.body.data.results[0].lat).toBeCloseTo(36.9689);
    expect(res.body.data.results[0].lng).toBeCloseTo(127.2439);
  });

  it('지오코더 전부 실패 — 200 + 빈 결과 (UI가 지도 클릭 안내)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const res = await request(app).get('/geo/geocode?query=' + encodeURIComponent('어딘가의 목장'));
    expect(res.status).toBe(200);
    expect(res.body.data.results).toEqual([]);
  });
});
