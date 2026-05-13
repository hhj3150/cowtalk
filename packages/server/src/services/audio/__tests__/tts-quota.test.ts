// TTS 쿼터 — Redis mock 기반 단위 테스트.
//
// 검증:
// 1) Redis 미사용 환경 → 우회 (allowed: true)
// 2) government_admin/quarantine_officer 역할 → 우회
// 3) 한도 미달 시 INCRBY + 누적
// 4) 일일 한도 초과 → 429 + dailyLimit 타입
// 5) 월 한도 초과 → 429 + monthlyLimit 타입
// 6) Redis 일시 장애 → 우회(가용성 우선)

import { describe, it, expect, beforeEach, vi } from 'vitest';

// 테스트마다 별도 mock 환경을 위해 동적 import
vi.mock('../../../config/index.js', () => ({
  config: {
    TTS_DAILY_CHAR_LIMIT: 1000,
    TTS_MONTHLY_CHAR_LIMIT: 5000,
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
  },
}));

// logger의 pino 초기화 회피 — 단위 테스트에서는 stub
vi.mock('../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

interface MockRedis {
  store: Map<string, number>;
  mget: (...keys: string[]) => Promise<(string | null)[]>;
  multi: () => MockPipeline;
}

interface MockPipeline {
  incrby: (key: string, value: number) => MockPipeline;
  incr: (key: string) => MockPipeline;
  expire: (key: string, seconds: number) => MockPipeline;
  exec: () => Promise<unknown[]>;
}

function makeMockRedis(): MockRedis {
  const store = new Map<string, number>();
  const ops: Array<() => void> = [];

  const pipeline: MockPipeline = {
    incrby(key: string, value: number) {
      ops.push(() => store.set(key, (store.get(key) ?? 0) + value));
      return pipeline;
    },
    incr(key: string) {
      ops.push(() => store.set(key, (store.get(key) ?? 0) + 1));
      return pipeline;
    },
    expire() { return pipeline; },
    async exec() {
      ops.forEach((op) => op());
      ops.length = 0;
      return [];
    },
  };

  return {
    store,
    async mget(...keys: string[]) {
      return keys.map((k) => (store.has(k) ? String(store.get(k)!) : null));
    },
    multi: () => pipeline,
  };
}

let mockRedisInstance: MockRedis | null = null;

vi.mock('../../../serving/cache.service.js', () => ({
  getRedis: () => mockRedisInstance,
}));

import { checkAndIncrementTtsUsage, getUserTtsUsage, estimateTtsCostUsd } from '../tts-quota.service.js';

describe('tts-quota.service', () => {
  beforeEach(() => {
    mockRedisInstance = makeMockRedis();
  });

  it('Redis 미사용 환경 → 우회', async () => {
    mockRedisInstance = null;
    const result = await checkAndIncrementTtsUsage('user-1', 500);
    expect(result.allowed).toBe(true);
  });

  it('government_admin 역할 → 쿼터 우회', async () => {
    const result = await checkAndIncrementTtsUsage('user-1', 999999, 'government_admin');
    expect(result.allowed).toBe(true);
  });

  it('quarantine_officer 역할 → 쿼터 우회', async () => {
    const result = await checkAndIncrementTtsUsage('user-1', 999999, 'quarantine_officer');
    expect(result.allowed).toBe(true);
  });

  it('한도 미달 시 INCRBY 누적', async () => {
    const r1 = await checkAndIncrementTtsUsage('user-1', 300, 'farmer');
    expect(r1.allowed).toBe(true);
    expect(r1.dailyUsed).toBe(300);

    const r2 = await checkAndIncrementTtsUsage('user-1', 200, 'farmer');
    expect(r2.allowed).toBe(true);
    expect(r2.dailyUsed).toBe(500);
  });

  it('일일 한도 초과 → 429', async () => {
    await checkAndIncrementTtsUsage('user-1', 800, 'farmer');
    const r = await checkAndIncrementTtsUsage('user-1', 300, 'farmer'); // 800+300=1100 > 1000
    expect(r.allowed).toBe(false);
    expect(r.limitType).toBe('daily');
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.dailyUsed).toBe(800); // 증가 안 됨
  });

  it('월 한도 초과 → 429 monthly', async () => {
    // 일 한도(1000) 내에서 여러 사용자로 분산 — 같은 사용자로 월 5000 채우려면 일 한도에 먼저 걸림
    // 대신: 일 한도를 임시로 매우 크게 인식되도록... 그냥 일=1000, 월=5000 환경에서
    // 한 번에 6000 시도 → 일에서 먼저 막힘. 월만 막히는 케이스는 일 한도 비활성 시.
    // 여기서는 일 한도가 큰 쪽이라 가정하고 동작 검증 단순화:
    // user-1이 5번에 걸쳐 1000자씩 5일 누적했다 가정 → store 직접 조작
    const monthKey = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
    mockRedisInstance!.store.set(`cowtalk:tts:usage:user-1:m:${monthKey}:chars`, 4900);
    const r = await checkAndIncrementTtsUsage('user-1', 200, 'farmer'); // 4900+200=5100 > 5000
    expect(r.allowed).toBe(false);
    expect(r.limitType).toBe('monthly');
  });

  it('userId 없으면 우회 (시스템 호출)', async () => {
    const r = await checkAndIncrementTtsUsage('', 999999, 'farmer');
    expect(r.allowed).toBe(true);
  });

  it('Redis 일시 장애 시 우회', async () => {
    mockRedisInstance = {
      ...makeMockRedis(),
      mget: async () => { throw new Error('Connection refused'); },
    };
    const r = await checkAndIncrementTtsUsage('user-1', 300, 'farmer');
    expect(r.allowed).toBe(true);
  });

  it('getUserTtsUsage — 현재 사용량 조회', async () => {
    await checkAndIncrementTtsUsage('user-1', 250, 'farmer');
    const usage = await getUserTtsUsage('user-1');
    expect(usage.dailyChars).toBe(250);
    expect(usage.monthlyChars).toBe(250);
    expect(usage.dailyRequests).toBe(1);
  });

  it('estimateTtsCostUsd — tts-1-hd $30/1M', () => {
    expect(estimateTtsCostUsd(1_000_000, 'tts-1-hd')).toBeCloseTo(30, 5);
    expect(estimateTtsCostUsd(500_000, 'tts-1')).toBeCloseTo(7.5, 5);
    expect(estimateTtsCostUsd(0)).toBe(0);
  });
});
