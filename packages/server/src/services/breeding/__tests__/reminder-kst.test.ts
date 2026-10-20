// DI-16 회귀 — 장기공태 월 단위 중복 키가 UTC 달 기준이라 매월 1일 KST 0~9시에 전월로 묶이던 문제
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/database.js', () => ({ getDb: () => ({}) }));
const { longOpenDedupKey } = await import('../breeding-reminder.service.js');

describe('DI-16 longOpenDedupKey', () => {
  it('KST 11월 1일 03:00 (UTC 10월 31일 18:00) 은 11월 키', () => {
    expect(longOpenDedupKey('a1', new Date('2026-10-31T18:00:00Z'))).toBe('long-open-a1-2026-11');
  });
  it('KST 10월 31일 23:00 (UTC 14:00) 은 10월 키', () => {
    expect(longOpenDedupKey('a1', new Date('2026-10-31T14:00:00Z'))).toBe('long-open-a1-2026-10');
  });
});
