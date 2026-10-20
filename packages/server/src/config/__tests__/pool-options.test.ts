// OPS-09 회귀 — DB 풀에 쿼리 타임아웃이 없어 느린 쿼리가 풀을 고갈시키던 문제
import { describe, it, expect } from 'vitest';
import { poolOptions } from '../database.js';

describe('OPS-09 poolOptions', () => {
  it('statement_timeout 을 연결 파라미터로 건다', () => {
    expect(poolOptions(60_000)).toMatchObject({ max: 20, connection: { statement_timeout: 60_000 } });
  });
  it('0 이면 끈다', () => {
    expect(poolOptions(0)).not.toHaveProperty('connection');
  });
});
