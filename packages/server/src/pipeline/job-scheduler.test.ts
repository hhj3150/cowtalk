// 잡 스케줄러 테스트
// - InProcessScheduler: 가짜 타이머로 interval/completion-based 의미론 검증
// - BullMqScheduler: 로컬 Redis 실검증 (REDIS_TEST=1 일 때만 — CI에서는 스킵)

import { describe, it, expect, vi, afterEach } from 'vitest';
import { InProcessScheduler, BullMqScheduler } from './job-scheduler.js';

describe('InProcessScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('interval 잡: 주기마다 실행되고 runOnStart면 즉시 1회', async () => {
    vi.useFakeTimers();
    const s = new InProcessScheduler();
    let runs = 0;
    await s.start([{ name: 'j', everyMs: 1000, runOnStart: true, handler: async () => { runs++; } }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toBe(1); // runOnStart
    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toBe(4); // +3회
    await s.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(runs).toBe(4); // stop 후 실행 없음
  });

  it('completion-based 잡: 완료 후 (주기-소요, 최소 minGap) 대기 뒤 재실행', async () => {
    vi.useFakeTimers();
    const s = new InProcessScheduler();
    const startedAt: number[] = [];
    // 핸들러 소요 400ms, 주기 1000ms → 실행 간격은 1000ms (완료 후 600ms 대기)
    await s.start([{
      name: 'c', everyMs: 1000, completionBased: true, minGapMs: 100, runOnStart: true,
      handler: async () => {
        startedAt.push(Date.now());
        await new Promise((r) => setTimeout(r, 400));
      },
    }]);
    await vi.advanceTimersByTimeAsync(0);    // 첫 실행 시작
    await vi.advanceTimersByTimeAsync(400);  // 첫 실행 완료
    await vi.advanceTimersByTimeAsync(600);  // 대기 후 두 번째 시작
    expect(startedAt).toHaveLength(2);
    expect(startedAt[1]! - startedAt[0]!).toBe(1000);
    await s.stop();
  });

  it('소요가 주기를 넘으면 minGap 뒤 즉시 이어진다 (스킵 없음)', async () => {
    vi.useFakeTimers();
    const s = new InProcessScheduler();
    const startedAt: number[] = [];
    // 소요 1500ms > 주기 1000ms → 다음 시작은 완료 후 minGap(200ms)
    await s.start([{
      name: 'slow', everyMs: 1000, completionBased: true, minGapMs: 200, runOnStart: true,
      handler: async () => {
        startedAt.push(Date.now());
        await new Promise((r) => setTimeout(r, 1500));
      },
    }]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1500); // 첫 실행 완료
    await vi.advanceTimersByTimeAsync(200);  // minGap 뒤 두 번째 시작
    expect(startedAt).toHaveLength(2);
    expect(startedAt[1]! - startedAt[0]!).toBe(1700); // 소요 1500 + minGap 200
    await s.stop();
  });

  it('핸들러가 던져도 루프가 죽지 않는다', async () => {
    vi.useFakeTimers();
    const s = new InProcessScheduler();
    let runs = 0;
    await s.start([{
      name: 'err', everyMs: 500, completionBased: true, minGapMs: 100, runOnStart: true,
      handler: async () => { runs++; throw new Error('boom'); },
    }]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1200);
    expect(runs).toBeGreaterThanOrEqual(2);
    await s.stop();
  });
});

// 로컬 Redis 실검증 — REDIS_TEST=1 로 명시 실행 (CI 기본 스킵)
describe.skipIf(process.env.REDIS_TEST !== '1')('BullMqScheduler (Redis 통합)', () => {
  it('반복 잡이 Redis 큐로 실행되고 runOnStart 즉시 실행된다', async () => {
    const conn = {
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: null,
    };
    const s = new BullMqScheduler(conn);
    let runs = 0;
    const jobName = `it-${process.pid}-${Date.now()}`;
    await s.start([{
      name: jobName, everyMs: 500, runOnStart: true,
      handler: async () => { runs++; },
    }]);
    // boot 잡 + 반복 2회 이상 기대
    await new Promise((r) => setTimeout(r, 2200));
    expect(runs).toBeGreaterThanOrEqual(3);
    await s.stop();
    const after = runs;
    await new Promise((r) => setTimeout(r, 1200));
    expect(runs).toBe(after); // stop 후 실행 없음
  }, 15_000);
});
