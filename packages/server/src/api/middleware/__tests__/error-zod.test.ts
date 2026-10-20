// Phase 5 발견 — 핸들러 안 schema.parse() 검증 오류가 500 으로 떨어지던 문제 (epidemiology wind-risk 등)
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';

vi.mock('../../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { errorHandler } = await import('../error.js');

describe('errorHandler ZodError', () => {
  it('400 VALIDATION_ERROR 와 필드 경로', async () => {
    const app = express();
    app.get('/x', () => { z.object({ windDeg: z.number() }).parse({ windDeg: Number.NaN }); });
    app.use(errorHandler);
    const r = await request(app).get('/x');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(r.body.error.details[0].path).toBe('windDeg');
  });
});
