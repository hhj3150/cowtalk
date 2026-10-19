// OPS-04 회귀 — Redis 없을 때 레플리카마다 잡이 중복 실행되던 문제
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/database.js', () => ({ getDb: () => ({ execute: async () => { throw new Error('relation "job_leases" does not exist'); } }) }));
vi.mock('../../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { runWithLease } = await import('../../../pipeline/job-scheduler.js');
const { leaseTtlFor, tryAcquireJobLease, claimBriefingDelivery } = await import('../job-lease.js');

const job = (handler = vi.fn(async () => undefined)) => ({ name: 'x', everyMs: 300_000, handler });

describe('OPS-04 runWithLease', () => {
  it('다른 인스턴스가 임대를 갖고 있으면 이번 주기를 건너뛴다', async () => {
    const j = job();
    expect(await runWithLease(j, async () => false)).toBe('skipped');
    expect(j.handler).not.toHaveBeenCalled();
  });
  it('임대를 잡으면 실행', async () => {
    const j = job();
    expect(await runWithLease(j, async () => true)).toBe('ran');
    expect(j.handler).toHaveBeenCalledTimes(1);
  });
  it('임대 판단 불가(테이블 없음)면 기존처럼 실행 — 기능 정지 방지', async () => {
    const j = job();
    expect(await runWithLease(j, async () => null)).toBe('ran');
  });
});

describe('OPS-04 실패 시 폴백', () => {
  it('테이블이 없으면 null (호출부가 기존 동작으로)', async () => {
    expect(await tryAcquireJobLease('x', 60_000)).toBeNull();
    expect(await claimBriefingDelivery('f', '2026-10-20')).toBeNull();
  });
  it('임대 TTL 은 주기의 90%, 최소 60초', () => {
    expect(leaseTtlFor(300_000)).toBe(270_000);
    expect(leaseTtlFor(10_000)).toBe(60_000);
  });
});
