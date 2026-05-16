// ai-performance-service 테스트 — BUG-008 / D4·D5
// metrics-contract.md §16

import { describe, it, expect } from 'vitest';
import {
  computeAccuracy,
  computeAccuracyFromFraction,
  computeChange,
  accuracyInsufficient,
  DEFAULT_MIN_SAMPLES,
} from './ai-performance-service.js';

describe('computeAccuracy (D5 minSamples 가드)', () => {
  it('n < minSamples → status="data_insufficient" + displayValue="—"', () => {
    const r = computeAccuracy(3, 5);
    expect(r.status).toBe('data_insufficient');
    expect(r.displayValue).toBe('—');
    expect(r.rate).toBeNull();
    expect(r.denominator).toBe(5);
  });

  it('n=0 → status="data_insufficient" (D5 빈 상태)', () => {
    const r = computeAccuracy(0, 0);
    expect(r.status).toBe('data_insufficient');
    expect(r.displayValue).toBe('—');
    expect(r.rate).toBeNull();
  });

  it('n >= minSamples → status="ok" + 정확한 비율', () => {
    const r = computeAccuracy(85, 100);
    expect(r.status).toBe('ok');
    expect(r.rate).toBe(85);
    expect(r.displayValue).toBe('85.0%');
    expect(r.numerator).toBe(85);
    expect(r.denominator).toBe(100);
  });

  it('minSamples 커스텀 (전체 평가 시 더 엄격한 임계값 사용 가능)', () => {
    const r1 = computeAccuracy(20, 30, { minSamples: 50 });
    expect(r1.status).toBe('data_insufficient');
    const r2 = computeAccuracy(40, 60, { minSamples: 50 });
    expect(r2.status).toBe('ok');
    expect(r2.rate).toBe(66.7);
  });

  it('분자 > 분모 인 비정상 입력은 분자를 분모로 clamp (시스템 버그 방어)', () => {
    const r = computeAccuracy(150, 100);
    expect(r.status).toBe('ok');
    expect(r.numerator).toBe(100);
    expect(r.rate).toBe(100);
  });

  it('NaN/Infinity 입력 → data_insufficient', () => {
    expect(computeAccuracy(NaN, 100).status).toBe('data_insufficient');
    expect(computeAccuracy(50, Infinity).status).toBe('data_insufficient');
    expect(computeAccuracy(50, -1).status).toBe('data_insufficient');
  });

  it('fractionDigits=0 → 정수 표시', () => {
    const r = computeAccuracy(85, 100, { fractionDigits: 0 });
    expect(r.displayValue).toBe('85%');
    expect(r.rate).toBe(85);
  });

  it('DEFAULT_MIN_SAMPLES = 10', () => {
    expect(DEFAULT_MIN_SAMPLES).toBe(10);
    const justEnough = computeAccuracy(8, 10);
    expect(justEnough.status).toBe('ok');
    const justBelow = computeAccuracy(8, 9);
    expect(justBelow.status).toBe('data_insufficient');
  });
});

describe('computeAccuracyFromFraction (0-1 입력 분기)', () => {
  it('fraction=0.85, n=100 → "85.0%"', () => {
    const r = computeAccuracyFromFraction(0.85, 100);
    expect(r.status).toBe('ok');
    expect(r.rate).toBe(85);
    expect(r.displayValue).toBe('85.0%');
  });

  it('n < minSamples → data_insufficient (fraction 값 무시)', () => {
    const r = computeAccuracyFromFraction(0.85, 5);
    expect(r.status).toBe('data_insufficient');
    expect(r.displayValue).toBe('—');
  });

  it('fraction > 1 또는 음수 → clamp 0-1', () => {
    const r1 = computeAccuracyFromFraction(1.5, 100);
    expect(r1.rate).toBe(100);
    const r2 = computeAccuracyFromFraction(-0.3, 100);
    expect(r2.rate).toBe(0);
  });

  it('NaN fraction → data_insufficient', () => {
    const r = computeAccuracyFromFraction(NaN, 100);
    expect(r.status).toBe('data_insufficient');
  });
});

describe('computeChange (정확도 변화율)', () => {
  it('current ok + previous ok → delta 계산', () => {
    const cur = computeAccuracy(85, 100);
    const prev = computeAccuracy(80, 100);
    const change = computeChange(cur, prev);
    expect(change.status).toBe('ok');
    expect(change.delta).toBe(5);
    expect(change.displayValue).toBe('+5.0%');
  });

  it('current 하락 → 음수 delta', () => {
    const cur = computeAccuracy(70, 100);
    const prev = computeAccuracy(85, 100);
    const change = computeChange(cur, prev);
    expect(change.delta).toBe(-15);
    expect(change.displayValue).toBe('-15.0%');
  });

  it('current data_insufficient → change data_insufficient', () => {
    const cur = computeAccuracy(2, 5);
    const prev = computeAccuracy(80, 100);
    const change = computeChange(cur, prev);
    expect(change.status).toBe('data_insufficient');
    expect(change.displayValue).toBe('—');
    expect(change.delta).toBeNull();
  });

  it('previous data_insufficient → change data_insufficient', () => {
    const cur = computeAccuracy(85, 100);
    const prev = computeAccuracy(2, 5);
    const change = computeChange(cur, prev);
    expect(change.status).toBe('data_insufficient');
    expect(change.delta).toBeNull();
  });
});

describe('accuracyInsufficient sentinel', () => {
  it('빈 sentinel → data_insufficient 결과 반환', () => {
    const r = accuracyInsufficient();
    expect(r.status).toBe('data_insufficient');
    expect(r.displayValue).toBe('—');
    expect(r.rate).toBeNull();
    expect(r.denominator).toBe(0);
  });

  it('sampleSize 제공 시 denominator 보존 (디버깅용)', () => {
    const r = accuracyInsufficient(7);
    expect(r.denominator).toBe(7);
    expect(r.status).toBe('data_insufficient');
  });
});

describe('clampPct 일관 강제 (D5 violation 방지)', () => {
  it('100% 초과 입력 결과는 100 clamp', () => {
    const r = computeAccuracyFromFraction(2.5, 100);
    expect(r.rate).toBe(100);
    expect(r.displayValue).toBe('100.0%');
  });

  it('음수 결과는 0 clamp', () => {
    const r = computeAccuracyFromFraction(-0.5, 100);
    expect(r.rate).toBe(0);
    expect(r.displayValue).toBe('0.0%');
  });

  it('rate는 항상 0-100 범위 (caller가 113.1% 같은 값 볼 수 없음)', () => {
    const samples = [
      computeAccuracy(0, 100),
      computeAccuracy(50, 100),
      computeAccuracy(100, 100),
      computeAccuracyFromFraction(0.5, 100),
      computeAccuracyFromFraction(1, 100),
    ];
    for (const s of samples) {
      if (s.rate !== null) {
        expect(s.rate).toBeGreaterThanOrEqual(0);
        expect(s.rate).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('D5 violation 방지 (긍정 라벨 금지)', () => {
  it('displayValue는 "정확도 우수" / "AI 신뢰도 높음" 등 라벨 미포함', () => {
    // displayValue는 항상 정확한 수치 또는 "—". 카테고리 라벨 X.
    const r1 = computeAccuracy(95, 100);
    expect(r1.displayValue).toMatch(/^\d+(\.\d+)?%$/);
    expect(r1.displayValue).not.toContain('우수');
    expect(r1.displayValue).not.toContain('양호');

    const r2 = computeAccuracy(0, 0);
    expect(r2.displayValue).toBe('—');
    expect(r2.displayValue).not.toContain('정확도');
  });
});
