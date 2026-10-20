// OPS-12 — 구독 심각도 필터 (DB 이관 후에도 동일 규칙)
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ getDb: () => ({}) }));
const { meetsMinSeverity } = await import('../push-service.js');

describe('meetsMinSeverity', () => {
  it('설정 이상만 보낸다', () => {
    expect(meetsMinSeverity('critical', 'high')).toBe(true);
    expect(meetsMinSeverity('high', 'high')).toBe(true);
    expect(meetsMinSeverity('medium', 'high')).toBe(false);
    expect(meetsMinSeverity('high', 'critical')).toBe(false);
  });
});
