import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { parseSmaxtecTimestamp, isNaiveIsoTimestamp } = await import('../smaxtec-time.js');
const { normalizeSmaxtecEvent } = await import('../normalization.js');

describe('parseSmaxtecTimestamp — smaXtec 시각 파싱', () => {
  it('타임존 없는 문자열은 KST 벽시계로 읽는다 (2026-10-29 운영 +9h 장애 재현)', () => {
    // 장애 당시: "10:51:41" 이 UTC 로 저장되어 02:05Z 조회 시점에 미래로 보였다
    expect(parseSmaxtecTimestamp('2026-10-29T10:51:41')?.toISOString()).toBe('2026-10-29T01:51:41.000Z');
    expect(parseSmaxtecTimestamp('2026-10-29 09:40:00')?.toISOString()).toBe('2026-10-29T00:40:00.000Z');
    expect(parseSmaxtecTimestamp('2026-10-29T09:40:00.123456')?.toISOString()).toBe('2026-10-29T00:40:00.123Z');
    expect(parseSmaxtecTimestamp('2026-10-29T09:40')?.toISOString()).toBe('2026-10-29T00:40:00.000Z');
  });

  it('날짜만 오면 KST 자정', () => {
    expect(parseSmaxtecTimestamp('2026-10-29')?.toISOString()).toBe('2026-10-28T15:00:00.000Z');
  });

  it('타임존 표기가 있으면 그대로 신뢰한다', () => {
    expect(parseSmaxtecTimestamp('2026-10-29T01:51:41Z')?.toISOString()).toBe('2026-10-29T01:51:41.000Z');
    expect(parseSmaxtecTimestamp('2026-10-29T01:51:41.000Z')?.toISOString()).toBe('2026-10-29T01:51:41.000Z');
    expect(parseSmaxtecTimestamp('2026-10-29T10:51:41+09:00')?.toISOString()).toBe('2026-10-29T01:51:41.000Z');
    expect(parseSmaxtecTimestamp('2026-10-29T01:51:41+00:00')?.toISOString()).toBe('2026-10-29T01:51:41.000Z');
  });

  it('서버 프로세스 TZ 와 무관하다', () => {
    const prev = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      expect(parseSmaxtecTimestamp('2026-10-29T10:51:41')?.toISOString()).toBe('2026-10-29T01:51:41.000Z');
    } finally {
      process.env.TZ = prev;
    }
  });

  it('해석 불가·빈 값은 null', () => {
    expect(parseSmaxtecTimestamp(undefined)).toBeNull();
    expect(parseSmaxtecTimestamp(null)).toBeNull();
    expect(parseSmaxtecTimestamp('')).toBeNull();
    expect(parseSmaxtecTimestamp('not-a-date')).toBeNull();
    expect(parseSmaxtecTimestamp('2026-13-45T99:00:00')).toBeNull();
  });

  it('isNaiveIsoTimestamp — 보정 대상 판별', () => {
    expect(isNaiveIsoTimestamp('2026-10-29T10:51:41')).toBe(true);
    expect(isNaiveIsoTimestamp('2026-10-29')).toBe(true);
    expect(isNaiveIsoTimestamp('2026-10-29T10:51:41Z')).toBe(false);
    expect(isNaiveIsoTimestamp('2026-10-29T10:51:41+09:00')).toBe(false);
  });
});

describe('normalizeSmaxtecEvent — detectedAt', () => {
  const raw = {
    _id: 'evt-1', animal_id: 'a-1', official_id: null, event_type: 'heat',
    event_ts: '2026-10-29T10:51:41', create_ts: '2026-10-29T10:52:00',
  };

  it('타임존 없는 event_ts 를 미래로 저장하지 않는다', () => {
    const n = normalizeSmaxtecEvent(raw);
    expect(n.detectedAt.toISOString()).toBe('2026-10-29T01:51:41.000Z');
  });

  it('UTC 표기 event_ts 는 그대로', () => {
    const n = normalizeSmaxtecEvent({ ...raw, event_ts: '2026-10-29T01:51:41Z' });
    expect(n.detectedAt.toISOString()).toBe('2026-10-29T01:51:41.000Z');
  });
});
