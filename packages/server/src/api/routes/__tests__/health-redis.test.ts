// /health/deep 의 Redis 판정 — 꺼짐·미설정은 skipped, 연결 실패는 degraded (DB 장애와 구분)
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/database.js', () => ({ getDb: () => ({}) }));

const { checkRedis, summarizeHealth } = await import('../health.routes.js');
const { resolveRedisSettings } = await import('../../../lib/redis-settings.js');

const neverPing = vi.fn(async () => 'PONG');

describe('checkRedis', () => {
  it('REDIS_ENABLED=false → skipped, 연결 시도 없음', async () => {
    const r = await checkRedis(resolveRedisSettings({ REDIS_ENABLED: 'false' }), neverPing);
    expect(r.status).toBe('skipped');
    expect(neverPing).not.toHaveBeenCalled();
  });

  it('접속 정보 없음 → skipped, 연결 시도 없음', async () => {
    const r = await checkRedis(resolveRedisSettings({ REDIS_ENABLED: 'true' }), neverPing);
    expect(r.status).toBe('skipped');
    expect(neverPing).not.toHaveBeenCalled();
  });

  it('설정 있음 + PONG → healthy', async () => {
    const r = await checkRedis(resolveRedisSettings({ REDIS_URL: 'redis://h:6379' }), async () => 'PONG');
    expect(r.status).toBe('healthy');
  });

  it('설정 있음 + 연결 실패 → degraded (down 아님)', async () => {
    const r = await checkRedis(resolveRedisSettings({ REDIS_URL: 'redis://h:6379' }), async () => { throw new Error('ECONNREFUSED'); });
    expect(r.status).toBe('degraded');
  });
});

describe('summarizeHealth', () => {
  const ok = { name: 'PostgreSQL', status: 'healthy' as const, latencyMs: 1 };
  it('Redis skipped 는 판정에서 빠진다 → healthy', () => {
    expect(summarizeHealth([ok, { name: 'Redis', status: 'skipped', latencyMs: 0 }])).toBe('healthy');
  });
  it('Redis 연결 실패는 degraded 까지만', () => {
    expect(summarizeHealth([ok, { name: 'Redis', status: 'degraded', latencyMs: 0 }])).toBe('degraded');
  });
  it('Postgres 장애는 down', () => {
    expect(summarizeHealth([{ ...ok, status: 'down' }, { name: 'Redis', status: 'skipped', latencyMs: 0 }])).toBe('down');
  });
});
