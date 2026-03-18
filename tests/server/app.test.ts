// Express App 통합 테스트 — 헬스체크 + 404 + 에러

import { describe, it, expect } from 'vitest';
import { createApp } from '@server/app';
import request from 'supertest';

const app = createApp();

describe('Health check', () => {
  it('GET /api/health → 200 + version', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.version).toBe('5.0.0');
  });
});

describe('404 handler', () => {
  it('존재하지 않는 라우트 → 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('Auth routes (no DB)', () => {
  it('POST /api/auth/login 검증 실패 → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-email', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/auth/me 인증 없음 → 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Protected routes', () => {
  it('인증 없이 /api/farms → 401', async () => {
    const res = await request(app).get('/api/farms');
    expect(res.status).toBe(401);
  });

  it('인증 없이 /api/animals → 401', async () => {
    const res = await request(app).get('/api/animals');
    expect(res.status).toBe(401);
  });

  it('인증 없이 /api/alerts → 401', async () => {
    const res = await request(app).get('/api/alerts');
    expect(res.status).toBe(401);
  });
});
