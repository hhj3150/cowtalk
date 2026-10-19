// 운영 원칙(오류 화면 = 장애) 회귀 — 잘못된 형식의 ID 가 500 으로 떨어지던 문제
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { errorHandler, isInvalidInputSyntaxError } = await import('../error.js');

describe('isInvalidInputSyntaxError', () => {
  it('드라이버 오류와 drizzle 래핑(cause) 모두 인식', () => {
    expect(isInvalidInputSyntaxError({ code: '22P02' })).toBe(true);
    expect(isInvalidInputSyntaxError({ message: 'Failed query', cause: { code: '22P02' } })).toBe(true);
    expect(isInvalidInputSyntaxError({ code: '23505' })).toBe(false);
    expect(isInvalidInputSyntaxError(new Error('x'))).toBe(false);
  });
  it('22P02 는 400, 그 외 예상 못한 오류는 500 유지', async () => {
    const app = express();
    app.get('/bad-id', () => { throw Object.assign(new Error('Failed query'), { cause: { code: '22P02' } }); });
    app.get('/boom', () => { throw new Error('boom'); });
    app.use(errorHandler);
    expect((await request(app).get('/bad-id')).status).toBe(400);
    expect((await request(app).get('/boom')).status).toBe(500);
  });
});
