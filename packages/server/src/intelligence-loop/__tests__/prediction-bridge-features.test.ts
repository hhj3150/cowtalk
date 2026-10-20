// AI-06 회귀 — 감별진단 근거의 결측값을 0 으로 저장하던 문제
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ getDb: () => ({}) }));
const { diagnosisFeatures } = await import('../prediction-bridge.service.js');

describe('AI-06 diagnosisFeatures', () => {
  it('결측은 null, 실측은 그대로 (예전: 결측 → 0)', () => {
    expect(diagnosisFeatures([
      { metric: 'temp', currentValue: 39.8 },
      { metric: 'rumination', currentValue: undefined },
      { metric: 'activity', currentValue: null },
      { metric: 'ph', currentValue: Number.NaN },
      { metric: 'zero', currentValue: 0 },
    ])).toEqual({ temp: 39.8, rumination: null, activity: null, ph: null, zero: 0 });
  });
});
