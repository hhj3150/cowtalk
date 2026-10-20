// AI-03 회귀 — 센서 결측을 합성 곡선으로 채워 실측처럼 보이던 문제
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/database.js', () => ({ getDb: () => ({}) }));
const { shouldSimulateSensorChart } = await import('../unified-dashboard.routes.js');

describe('AI-03 shouldSimulateSensorChart', () => {
  it('운영·테스트에서는 요청해도 합성하지 않는다', () => {
    expect(shouldSimulateSensorChart('1', 'production')).toBe(false);
    expect(shouldSimulateSensorChart('1', 'test')).toBe(false);
  });
  it('개발 환경에서도 명시 요청(?simulate=1)이 없으면 합성하지 않는다 (예전: 결측이면 항상 합성)', () => {
    expect(shouldSimulateSensorChart(undefined, 'development')).toBe(false);
    expect(shouldSimulateSensorChart('true', 'development')).toBe(false);
  });
  it('개발 환경 + 명시 요청일 때만', () => {
    expect(shouldSimulateSensorChart('1', 'development')).toBe(true);
  });
});
