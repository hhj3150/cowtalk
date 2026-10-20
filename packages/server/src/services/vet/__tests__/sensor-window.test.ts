// DI-17 회귀 — 감별진단 이력에 판단 근거 센서 구간이 남지 않던 문제
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/database.js', () => ({ getDb: () => ({}) }));
const { sensorWindowFor } = await import('../differential-diagnosis.service.js');

describe('DI-17 sensorWindowFor', () => {
  it('KST 날짜 기준 7일 구간', () => {
    // UTC 2026-10-19 16:00 = KST 10-20 01:00
    expect(sensorWindowFor(new Date('2026-10-19T16:00:00Z'), 7)).toEqual({ from: '2026-10-13', to: '2026-10-20' });
  });
});
