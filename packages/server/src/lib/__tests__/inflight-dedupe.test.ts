// VO-07 회귀 — 같은 음성 발화가 두 번 제출되면 같은 질문이 두 번 실행되던 문제 (서버 측 방어)
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { claimInFlight, releaseInFlight, clearInFlightForTest } = await import('../inflight-dedupe.js');

beforeEach(() => { clearInFlightForTest(); });

describe('VO-07 claimInFlight', () => {
  it('처리 중이면 두 번째는 거절, 해제 후 다시 가능 (메모리)', async () => {
    expect(await claimInFlight('u1:v-a-1', 60_000, null)).toBe(true);
    expect(await claimInFlight('u1:v-a-1', 60_000, null)).toBe(false);
    expect(await claimInFlight('u2:v-a-1', 60_000, null)).toBe(true); // 다른 사용자
    await releaseInFlight('u1:v-a-1', null);
    expect(await claimInFlight('u1:v-a-1', 60_000, null)).toBe(true);
  });
  it('Redis SET NX 결과를 따른다', async () => {
    const store = new Set<string>();
    const redis = {
      set: async (k: string) => (store.has(k) ? null : (store.add(k), 'OK')),
      del: async (k: string) => { store.delete(k); },
    };
    expect(await claimInFlight('k', 1000, redis as never)).toBe(true);
    expect(await claimInFlight('k', 1000, redis as never)).toBe(false);
  });
  it('Redis 오류면 메모리로 판정', async () => {
    const broken = { set: async () => { throw new Error('down'); }, del: async () => undefined };
    expect(await claimInFlight('k2', 1000, broken as never)).toBe(true);
    expect(await claimInFlight('k2', 1000, broken as never)).toBe(false);
  });
});
