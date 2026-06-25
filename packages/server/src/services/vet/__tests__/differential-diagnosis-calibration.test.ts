import { describe, it, expect } from 'vitest';
import { uncertaintyPrior } from '../differential-diagnosis.service.js';

describe('uncertaintyPrior — 근거 강도별 불확실성 질량', () => {
  it('데이터 품질이 낮을수록 prior가 커진다', () => {
    expect(uncertaintyPrior('good')).toBeLessThan(uncertaintyPrior('limited'));
    expect(uncertaintyPrior('limited')).toBeLessThan(uncertaintyPrior('insufficient'));
  });

  it('단일 약한 후보가 100%로 부풀지 않는다 (보정 효과)', () => {
    // 후보 1개, 점수 25, 데이터 빈약 → prior 60
    const score = 25;
    const totalScore = 25;
    const prior = uncertaintyPrior('insufficient');
    const probability = Math.round((score / (totalScore + prior)) * 100);
    expect(probability).toBeLessThan(50); // 보정 없으면 100% — 보정 후 30%대
  });

  it('근거가 강하면(품질 good + 높은 점수) 상대확률에 수렴한다', () => {
    // 두 후보 80/20, 품질 good → prior 10
    const prior = uncertaintyPrior('good');
    const denom = 100 + prior;
    expect(Math.round((80 / denom) * 100)).toBeGreaterThan(70); // ~73%
  });
});
