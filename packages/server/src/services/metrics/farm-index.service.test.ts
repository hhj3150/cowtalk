// Farm Intelligence Index 점수화 테스트 — 정직성 원칙 (부족 축 null, 가용 축만 종합)

import { describe, it, expect } from 'vitest';
import {
  scoreHealth,
  scoreBreeding,
  scoreMonitoring,
  scoreProductivity,
  scoreEconomy,
  combineAxes,
} from './farm-index.service.js';

describe('scoreHealth', () => {
  it('알람 0두 → 100점', () => {
    expect(scoreHealth({ alertedAnimals7d: 0, headCount: 80 }).score).toBe(100);
  });
  it('두수의 25% 알람 → 0점', () => {
    expect(scoreHealth({ alertedAnimals7d: 20, headCount: 80 }).score).toBe(0);
  });
  it('두수 0 → null (데이터 부족)', () => {
    const a = scoreHealth({ alertedAnimals7d: 0, headCount: 0 });
    expect(a.score).toBeNull();
    expect(a.status).toBe('data_insufficient');
  });
});

describe('scoreBreeding', () => {
  it('CR null(표본 부족) → 축 null — 합성값 금지', () => {
    const a = scoreBreeding({ conceptionRate: null });
    expect(a.score).toBeNull();
    expect(a.status).toBe('data_insufficient');
  });
  it('CR 45%+ → 만점 포화', () => {
    expect(scoreBreeding({ conceptionRate: 45 }).score).toBe(100);
    expect(scoreBreeding({ conceptionRate: 60 }).score).toBe(100);
  });
  it('근거에 수태율 실값이 인용된다', () => {
    const a = scoreBreeding({ conceptionRate: 33.3, estrusDetectionRate: 72 });
    expect(a.reasons.join(' ')).toContain('33.3%');
    expect(a.reasons.join(' ')).toContain('72');
  });
});

describe('scoreProductivity', () => {
  it('유량 기록 없음 → null + 활성화 안내', () => {
    const a = scoreProductivity({ recordedAnimals7d: 0, headCount: 80, avgYieldL: null });
    expect(a.score).toBeNull();
    expect(a.reasons[0]).toContain('기록');
  });
  it('기록 커버리지 기반 점수', () => {
    const a = scoreProductivity({ recordedAnimals7d: 40, headCount: 80, avgYieldL: 28.5 });
    expect(a.score).toBe(50);
    expect(a.reasons.join(' ')).toContain('28.5');
  });
});

describe('scoreEconomy', () => {
  it('기록 없음 → null', () => {
    expect(scoreEconomy({ totalRevenue: 0, totalCost: 0, months: 0 }).score).toBeNull();
  });
  it('마진 0% → 50점, 30% → 100점', () => {
    expect(scoreEconomy({ totalRevenue: 1000, totalCost: 1000, months: 3 }).score).toBe(50);
    expect(scoreEconomy({ totalRevenue: 1000, totalCost: 700, months: 3 }).score).toBe(100);
  });
});

describe('combineAxes', () => {
  it('가용 축만으로 평균 + coverage 노출', () => {
    const axes = [
      scoreHealth({ alertedAnimals7d: 0, headCount: 80 }),          // 100
      scoreBreeding({ conceptionRate: null }),                       // null
      scoreMonitoring({ sensorAttached: 60, headCount: 80 }),        // 75
      scoreProductivity({ recordedAnimals7d: 0, headCount: 80, avgYieldL: null }), // null
      scoreEconomy({ totalRevenue: 0, totalCost: 0, months: 0 }),    // null
    ];
    const { overall, grade, coverage } = combineAxes(axes);
    expect(coverage).toEqual({ available: 2, total: 5 });
    expect(overall).toBe(Math.round((100 + 75) / 2)); // 88
    expect(grade).toBe('A');
  });
  it('가용 축 0개 → 종합 null', () => {
    const { overall, grade } = combineAxes([scoreBreeding({ conceptionRate: null })]);
    expect(overall).toBeNull();
    expect(grade).toBeNull();
  });
});
