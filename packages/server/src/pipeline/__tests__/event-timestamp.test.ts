// DI-03 (부분) 회귀 — 이벤트 시각 해석
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { resolveEventTimestamp } = await import('../normalization.js');

const NOW = new Date('2026-10-19T05:00:00Z');

describe('DI-03 resolveEventTimestamp', () => {
  it('정상 event_ts 는 그대로', () => {
    const r = resolveEventTimestamp('2026-10-19T04:00:00Z', undefined, NOW);
    expect(r).toEqual({ date: new Date('2026-10-19T04:00:00Z'), source: 'event_ts', future: false });
  });
  it('event_ts 가 깨졌으면 create_ts 로, 출처를 남긴다 (예전: 조용히 지금 시각)', () => {
    const r = resolveEventTimestamp('garbage', '2026-10-19T03:00:00Z', NOW);
    expect(r.source).toBe('create_ts');
    expect(r.date.toISOString()).toBe('2026-10-19T03:00:00.000Z');
  });
  it('둘 다 없으면 현재 시각이되 fallback_now 로 표시', () => {
    expect(resolveEventTimestamp(undefined, undefined, NOW).source).toBe('fallback_now');
  });
  it('10분 넘는 미래 시각은 표시 (시간대 해석 확인 근거)', () => {
    expect(resolveEventTimestamp('2026-10-19T13:40:00', undefined, NOW).future).toBe(true);
    expect(resolveEventTimestamp('2026-10-19T05:05:00Z', undefined, NOW).future).toBe(false);
  });
});
