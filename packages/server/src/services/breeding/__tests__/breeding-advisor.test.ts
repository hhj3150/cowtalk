// breeding-advisor 순수 함수 테스트 — 학습 가산점 + 근교 위험 평가
// DB 쿼리가 필요 없는 브랜치만 검증한다 (동일 종모우 재사용, 기본값, 스코어 매핑)

import { describe, it, expect } from 'vitest';
import {
  computeLearningBonus,
  estimateInbreedingRisk,
} from '../breeding-advisor.service.js';

describe('computeLearningBonus', () => {
  it('샘플이 2건 미만이면 가산점 0', () => {
    expect(computeLearningBonus({ conceptionRate: 100, decidedCount: 0 })).toBe(0);
    expect(computeLearningBonus({ conceptionRate: 100, decidedCount: 1 })).toBe(0);
  });

  it('baseline 60% 수태율은 가산점 0', () => {
    expect(computeLearningBonus({ conceptionRate: 60, decidedCount: 5 })).toBe(0);
  });

  it('고수태율은 양의 가산점', () => {
    // decidedCount=5 → confidence=8, (80-60)/40 * 8 = 4
    expect(computeLearningBonus({ conceptionRate: 80, decidedCount: 5 })).toBe(4);
    // decidedCount=10 → confidence=13, (100-60)/40 * 13 = 13
    expect(computeLearningBonus({ conceptionRate: 100, decidedCount: 10 })).toBe(13);
  });

  it('저수태율은 음의 가산점', () => {
    // decidedCount=5 → confidence=8, (20-60)/40 * 8 = -8
    expect(computeLearningBonus({ conceptionRate: 20, decidedCount: 5 })).toBe(-8);
  });

  it('신뢰도는 15점에서 상한', () => {
    // 매우 큰 샘플도 confidence가 15를 넘지 않음
    // 100건 × (100-60)/40 × 15 = +15
    expect(computeLearningBonus({ conceptionRate: 100, decidedCount: 100 })).toBe(15);
    // 100건 × (0-60)/40 × 15 = -22.5 → Math.round(-22.5) = -22 (JS half toward +∞)
    expect(computeLearningBonus({ conceptionRate: 0, decidedCount: 100 })).toBe(-22);
  });
});

describe('estimateInbreedingRisk', () => {
  it('이력 없음 → 기본값 low/0.03', async () => {
    const result = await estimateInbreedingRisk({
      animalTraceId: null,
      bullRegistration: null,
      semenId: 'semen-new',
      previousBreedings: [],
    });
    expect(result.risk).toBe('low');
    expect(result.coefficient).toBe(0.03);
    expect(result.reason).toContain('혈통');
  });

  it('동일 종모우 1회 재사용 → medium/0.08', async () => {
    const result = await estimateInbreedingRisk({
      animalTraceId: null,
      bullRegistration: null,
      semenId: 'semen-A',
      previousBreedings: [
        { semenId: 'semen-A' },
        { semenId: 'semen-B' },
      ],
    });
    expect(result.risk).toBe('medium');
    expect(result.coefficient).toBe(0.08);
    expect(result.reason).toContain('동일 종모우');
  });

  it('동일 종모우 2회+ 재사용 → high/0.12', async () => {
    const result = await estimateInbreedingRisk({
      animalTraceId: null,
      bullRegistration: null,
      semenId: 'semen-A',
      previousBreedings: [
        { semenId: 'semen-A' },
        { semenId: 'semen-A' },
        { semenId: 'semen-C' },
      ],
    });
    expect(result.risk).toBe('high');
    expect(result.coefficient).toBe(0.12);
  });

  it('다른 종모우만 사용한 이력 → low/0.03', async () => {
    const result = await estimateInbreedingRisk({
      animalTraceId: null,
      bullRegistration: null,
      semenId: 'semen-new',
      previousBreedings: [
        { semenId: 'semen-X' },
        { semenId: 'semen-Y' },
      ],
    });
    expect(result.risk).toBe('low');
    expect(result.coefficient).toBe(0.03);
  });
});
