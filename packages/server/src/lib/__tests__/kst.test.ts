// DI-11 회귀 — 한국 시각 00~09시가 UTC 날짜로 '어제'가 되던 문제
import { describe, it, expect } from 'vitest';
import { kstToday, kstDateString } from '../kst.js';

describe('DI-11 KST 날짜', () => {
  it('한국 08:59 (UTC 전날 23:59) 는 한국 날짜', () => {
    expect(kstToday(new Date('2026-10-19T23:59:00Z'))).toBe('2026-10-20');
  });
  it('한국 09:00 (UTC 00:00) 경계', () => {
    expect(kstDateString(new Date('2026-10-20T00:00:00Z'))).toBe('2026-10-20');
    expect(kstDateString(new Date('2026-10-19T14:59:59Z'))).toBe('2026-10-19');
    expect(kstDateString(new Date('2026-10-19T15:00:00Z'))).toBe('2026-10-20');
  });
});
