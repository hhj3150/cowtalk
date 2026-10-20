// OPS-10 회귀 — DIM·산차를 5분마다 분만 이벤트 전체로 재계산하던 문제
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ getDb: () => ({}) }));
const { shouldRecomputeDim, DIM_RECOMPUTE_INTERVAL_MS } = await import('../sync.service.js');

describe('OPS-10 shouldRecomputeDim', () => {
  it('처음(기록 없음)에는 실행', () => {
    expect(shouldRecomputeDim(Date.now(), 0)).toBe(true);
  });
  it('1시간 안에는 다시 실행하지 않음, 지나면 실행', () => {
    const t = 1_000_000_000_000;
    expect(shouldRecomputeDim(t + 5 * 60_000, t)).toBe(false);
    expect(shouldRecomputeDim(t + DIM_RECOMPUTE_INTERVAL_MS, t)).toBe(true);
  });
});
