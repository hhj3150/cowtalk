import { describe, it, expect } from 'vitest';
import {
  kstParts,
  kstDate,
  kstDateStr,
  kstWeekStart,
  isoWeek,
  resolvePeriod,
  isDue,
  cumulativeStart,
} from '../period.js';

describe('KST 변환', () => {
  it('UTC 인스턴트를 KST 달력으로 읽는다 (UTC+9)', () => {
    // 2026-08-27T00:00Z = KST 09:00
    expect(kstParts(new Date('2026-08-27T00:00:00Z'))).toEqual({
      year: 2026, month: 8, day: 27, hour: 9, weekday: 4, // 목요일
    });
    // UTC 자정 직전은 KST 로 이미 다음 날 아침
    expect(kstDateStr(new Date('2026-08-26T20:00:00Z'))).toBe('2026-08-27');
  });

  it('KST 자정은 전날 15:00Z 이다', () => {
    expect(kstDate(2026, 8, 24).toISOString()).toBe('2026-08-23T15:00:00.000Z');
  });

  it('주 시작은 KST 월요일 자정 (일요일도 그 주에 포함)', () => {
    expect(kstWeekStart(new Date('2026-08-27T00:00:00Z')).toISOString()).toBe('2026-08-23T15:00:00.000Z');
    // 일요일 KST 23시 → 여전히 같은 주(월 08-24)
    expect(kstWeekStart(new Date('2026-08-30T14:00:00Z')).toISOString()).toBe('2026-08-23T15:00:00.000Z');
    // 월요일 KST 00:30 → 새 주
    expect(kstWeekStart(new Date('2026-08-30T15:30:00Z')).toISOString()).toBe('2026-08-30T15:00:00.000Z');
  });

  it('ISO 주차를 센다', () => {
    expect(isoWeek(new Date('2026-08-17T03:00:00Z'))).toEqual({ year: 2026, week: 34 });
    // 2026-01-01(목)이 속한 주는 2026년 1주차
    expect(isoWeek(new Date('2026-01-01T03:00:00Z'))).toEqual({ year: 2026, week: 1 });
  });
});

describe('resolvePeriod — 직전 완결 기간만 보고한다', () => {
  const now = new Date('2026-08-27T00:00:00Z'); // KST 2026-08-27(목) 09:00

  it('weekly: 이번 주가 아니라 지난 월~일', () => {
    const p = resolvePeriod('weekly', now);
    expect(p.periodKey).toBe('weekly:2026-W34');
    expect(p.label).toBe('2026-08-17 ~ 2026-08-23');
    expect(p.start.toISOString()).toBe('2026-08-16T15:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-08-23T15:00:00.000Z');
    expect(p.previous.start.toISOString()).toBe('2026-08-09T15:00:00.000Z');
    expect(p.title).toBe('8월 3주차');
  });

  it('monthly: 진행 중인 8월이 아니라 7월', () => {
    const p = resolvePeriod('monthly', now);
    expect(p.periodKey).toBe('monthly:2026-07');
    expect(p.title).toBe('2026년 7월');
    expect(p.start.toISOString()).toBe('2026-06-30T15:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-07-31T15:00:00.000Z');
    expect(p.previous.title).toBe('2026년 6월');
  });

  it('quarterly: 진행 중인 3분기가 아니라 2분기', () => {
    const p = resolvePeriod('quarterly', now);
    expect(p.periodKey).toBe('quarterly:2026-Q2');
    expect(p.title).toBe('2026년 2분기');
    expect(p.start.toISOString()).toBe('2026-03-31T15:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-06-30T15:00:00.000Z');
    expect(p.previous.title).toBe('2026년 1분기');
  });

  it('performance: 월 주기지만 키가 분리된다 (월간과 중복 발송되지 않게)', () => {
    const p = resolvePeriod('performance', now);
    expect(p.periodKey).toBe('performance:2026-07');
    expect(p.start.toISOString()).toBe(resolvePeriod('monthly', now).start.toISOString());
  });

  it('연초 경계: 1월에는 작년 12월 / 작년 4분기를 본다', () => {
    const jan = new Date('2026-01-15T00:00:00Z');
    expect(resolvePeriod('monthly', jan).periodKey).toBe('monthly:2025-12');
    expect(resolvePeriod('monthly', jan).previous.title).toBe('2025년 11월');
    const q = resolvePeriod('quarterly', jan);
    expect(q.periodKey).toBe('quarterly:2025-Q4');
    expect(q.end.toISOString()).toBe('2025-12-31T15:00:00.000Z');
    expect(q.previous.title).toBe('2025년 3분기');
  });

  it('KST 1일 새벽(UTC 로는 전달 말일)에도 직전 달을 정확히 고른다', () => {
    // 2026-08-31T20:00Z = KST 09-01 05:00 → 보고 대상은 8월
    expect(resolvePeriod('monthly', new Date('2026-08-31T20:00:00Z')).periodKey).toBe('monthly:2026-08');
  });
});

describe('isDue — 멱등 + 밀린 보고서 회수', () => {
  const now7 = new Date('2026-08-24T00:00:00Z'); // KST 월요일 09:00
  const period = resolvePeriod('weekly', now7);

  it('이미 보낸 기간은 다시 보내지 않는다', () => {
    expect(isDue(period, now7, 7, period.periodKey)).toBe(false);
  });

  it('발송 시각 전이면 기다린다', () => {
    const early = new Date('2026-08-23T20:00:00Z'); // KST 월요일 05:00
    expect(isDue(resolvePeriod('weekly', early), early, 7, null)).toBe(false);
  });

  it('발송 시각이 지나면 보낸다', () => {
    expect(isDue(period, now7, 7, null)).toBe(true);
  });

  it('발송일이 지나버렸어도(서버 정지) 다음 깨어남에 보낸다', () => {
    const wed = new Date('2026-08-26T00:00:00Z'); // KST 수요일 09:00
    const p = resolvePeriod('weekly', wed);
    const dawn = new Date('2026-08-25T18:00:00Z'); // KST 화요일 03:00 — sendHour 미만
    expect(isDue(p, dawn, 7, null)).toBe(true);
  });
});

describe('cumulativeStart', () => {
  const period = resolvePeriod('monthly', new Date('2026-08-27T00:00:00Z'));

  it('파일럿 시작일이 있으면 그것부터 누적한다', () => {
    const pilot = new Date('2026-07-01T00:00:00Z');
    expect(cumulativeStart(period, pilot)).toBe(pilot);
  });

  it('없으면 12개월 전부터 (누적을 과장하지 않게 유한 구간)', () => {
    expect(cumulativeStart(period, null).toISOString()).toBe('2025-06-30T15:00:00.000Z');
  });

  it('파일럿 시작일이 기간 이후면 무시한다', () => {
    const future = new Date('2027-01-01T00:00:00Z');
    expect(cumulativeStart(period, future).toISOString()).toBe('2025-06-30T15:00:00.000Z');
  });
});
