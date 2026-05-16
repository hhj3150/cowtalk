// confidence 단위 변환 테스트 — BUG-005 / D4
// metrics-contract.md §17

import { describe, it, expect } from 'vitest';
import { toConfidence01, clampConfidence01 } from './confidence.js';

describe('toConfidence01 (0-100 점수 → 0-1 canonical)', () => {
  it('85 → 0.85', () => {
    expect(toConfidence01(85)).toBeCloseTo(0.85, 10);
  });

  it('0 → 0, 100 → 1', () => {
    expect(toConfidence01(0)).toBe(0);
    expect(toConfidence01(100)).toBe(1);
  });

  it('100 초과 → 1 clamp', () => {
    expect(toConfidence01(150)).toBe(1);
    expect(toConfidence01(101)).toBe(1);
  });

  it('음수 → 0 clamp', () => {
    expect(toConfidence01(-20)).toBe(0);
  });

  it('NaN / Infinity → 0', () => {
    expect(toConfidence01(NaN)).toBe(0);
    expect(toConfidence01(Infinity)).toBe(0);
    expect(toConfidence01(-Infinity)).toBe(0);
  });

  it('결과는 항상 [0,1] 범위 (D4 canonical)', () => {
    for (const input of [-50, 0, 30, 62, 95, 100, 130, 999]) {
      const r = toConfidence01(input);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it('rule 점수식 출력 시뮬레이션: Math.round(60 + x*40) 패턴', () => {
    // temperature.rules.ts:34 — Math.round(60 + (tempAvg-39.5)*40)
    expect(toConfidence01(Math.round(60 + (40.5 - 39.5) * 40))).toBeCloseTo(1, 10); // 100 → 1
    expect(toConfidence01(Math.round(60 + (39.5 - 39.5) * 40))).toBeCloseTo(0.6, 10); // 60 → 0.6
  });
});

describe('clampConfidence01 (이미 0-1 값 보정 후 clamp)', () => {
  it('정상 범위 통과', () => {
    expect(clampConfidence01(0.85)).toBe(0.85);
    expect(clampConfidence01(0)).toBe(0);
    expect(clampConfidence01(1)).toBe(1);
  });

  it('multiplier 곱셈 후 1 초과 → 1 clamp', () => {
    // orchestrator: 0.95 * 1.1 = 1.045 → 1
    expect(clampConfidence01(0.95 * 1.1)).toBe(1);
  });

  it('multiplier 곱셈 후 음수 불가 — 0 floor', () => {
    expect(clampConfidence01(-0.1)).toBe(0);
  });

  it('NaN / Infinity → 0', () => {
    expect(clampConfidence01(NaN)).toBe(0);
    expect(clampConfidence01(Infinity)).toBe(0);
  });

  it('orchestrator 보정 시뮬레이션: 0.7 배수 → [0,1] 유지', () => {
    expect(clampConfidence01(0.85 * 0.7)).toBeCloseTo(0.595, 10);
    expect(clampConfidence01(0.85 * 0.85)).toBeCloseTo(0.7225, 10);
  });
});
