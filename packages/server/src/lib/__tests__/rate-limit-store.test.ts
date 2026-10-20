// OPS-12 회귀 — 속도 제한 카운터가 메모리에만 있어 재시작마다 초기화되고 레플리카 수만큼 한도가 늘던 문제
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

vi.mock('../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { RedisFallbackStore } = await import('../rate-limit-store.js');

/** 레플리카들이 공유하는 Redis 흉내 */
function fakeRedis() {
  const counts = new Map<string, number>();
  return {
    eval: async (_s: string, _n: number, key: string | number, ms: string | number) => {
      const c = (counts.get(String(key)) ?? 0) + 1;
      counts.set(String(key), c);
      return [c, Number(ms)];
    },
    del: async (key: string) => { counts.delete(key); },
    decr: async (key: string) => { counts.set(key, (counts.get(key) ?? 1) - 1); },
  };
}

function replica(redis: () => ReturnType<typeof fakeRedis> | null) {
  const a = express();
  a.use(rateLimit({ windowMs: 60_000, max: 3, standardHeaders: true, legacyHeaders: false, store: new RedisFallbackStore('t', redis) }));
  a.get('/', (_req, res) => { res.send('ok'); });
  return a;
}

describe('OPS-12 RedisFallbackStore', () => {
  it('두 레플리카가 한도를 공유한다 (합쳐서 3회)', async () => {
    const shared = fakeRedis();
    const r1 = replica(() => shared);
    const r2 = replica(() => shared);
    const codes = [];
    for (const app of [r1, r2, r1, r2]) codes.push((await request(app).get('/')).status);
    expect(codes).toEqual([200, 200, 200, 429]);
  });

  it('Redis 오류·지연이면 요청을 막지 않고 메모리 카운터로 제한', async () => {
    const broken = { eval: async () => { throw new Error('ECONNREFUSED'); }, del: async () => undefined, decr: async () => undefined };
    const app = replica(() => broken as never);
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await request(app).get('/')).status);
    expect(codes).toEqual([200, 200, 200, 429]);
  });

  it('Redis 비활성(null)이면 메모리', async () => {
    const app = replica(() => null);
    expect((await request(app).get('/')).status).toBe(200);
  });
});
