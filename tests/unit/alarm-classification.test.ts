// 알림 분류 테스트 — smaXtec 이벤트 타입 → 카테고리 매핑
import { describe, it, expect } from 'vitest';

// 서버의 이벤트 분류 로직을 재현
const HEALTH_EVENT_TYPES = new Set([
  'temperature_high', 'temperature_low', 'temperature_warning',
  'clinical_condition', 'health_warning', 'health_general',
  'rumination_decrease', 'rumination_warning',
  'activity_decrease', 'activity_warning',
  'drinking_decrease', 'drinking_warning',
]);

const BREEDING_EVENT_TYPES = new Set([
  'estrus', 'estrus_dnb', 'heat',
  'insemination', 'pregnancy_check',
  'fertility_warning', 'no_insemination',
]);

const CALVING_EVENT_TYPES = new Set([
  'calving', 'calving_detection', 'calving_confirmation', 'calving_waiting',
]);

function classifyEvent(eventType: string): 'health' | 'breeding' | 'calving' | 'management' | 'unknown' {
  if (HEALTH_EVENT_TYPES.has(eventType)) return 'health';
  if (BREEDING_EVENT_TYPES.has(eventType)) return 'breeding';
  if (CALVING_EVENT_TYPES.has(eventType)) return 'calving';
  if (eventType === 'management' || eventType === 'dry_off' || eventType === 'abortion') return 'management';
  return 'unknown';
}

// 건강 점수 계산 (prediction.routes.ts 로직)
function calculateHealthRiskScore(params: {
  recentHealthCount: number;
  criticalCount: number;
  density: number;
  uniqueTypeCount: number;
}): number {
  let score = 0;
  if (params.recentHealthCount > 0) score += Math.min(30, params.recentHealthCount * 10);
  if (params.criticalCount > 0) score += Math.min(40, params.criticalCount * 20);
  if (params.density > 2) score += 20;
  if (params.uniqueTypeCount >= 2) score += 10;
  return Math.min(100, score);
}

function getRiskLevel(score: number): string {
  if (score >= 70) return 'critical';
  if (score >= 40) return 'warning';
  if (score >= 15) return 'caution';
  return 'normal';
}

describe('classifyEvent — 이벤트 타입 분류', () => {
  it('temperature_high → health', () => {
    expect(classifyEvent('temperature_high')).toBe('health');
  });

  it('rumination_decrease → health', () => {
    expect(classifyEvent('rumination_decrease')).toBe('health');
  });

  it('estrus → breeding', () => {
    expect(classifyEvent('estrus')).toBe('breeding');
  });

  it('insemination → breeding', () => {
    expect(classifyEvent('insemination')).toBe('breeding');
  });

  it('calving_detection → calving', () => {
    expect(classifyEvent('calving_detection')).toBe('calving');
  });

  it('dry_off → management', () => {
    expect(classifyEvent('dry_off')).toBe('management');
  });

  it('알 수 없는 이벤트 → unknown', () => {
    expect(classifyEvent('some_new_type')).toBe('unknown');
  });
});

describe('calculateHealthRiskScore — 건강 위험 점수', () => {
  it('이벤트 없음 → 0점 (정상)', () => {
    const score = calculateHealthRiskScore({
      recentHealthCount: 0, criticalCount: 0, density: 0, uniqueTypeCount: 0,
    });
    expect(score).toBe(0);
    expect(getRiskLevel(score)).toBe('normal');
  });

  it('건강 이벤트 1건 → 10점 (정상)', () => {
    const score = calculateHealthRiskScore({
      recentHealthCount: 1, criticalCount: 0, density: 0, uniqueTypeCount: 1,
    });
    expect(score).toBe(10);
    expect(getRiskLevel(score)).toBe('normal');
  });

  it('건강 이벤트 2건 + 복합 이상 → 30점 (주의)', () => {
    const score = calculateHealthRiskScore({
      recentHealthCount: 2, criticalCount: 0, density: 0, uniqueTypeCount: 2,
    });
    expect(score).toBe(30);
    expect(getRiskLevel(score)).toBe('caution');
  });

  it('긴급 1건 + 건강 3건 → 50점 (경고)', () => {
    const score = calculateHealthRiskScore({
      recentHealthCount: 3, criticalCount: 1, density: 0, uniqueTypeCount: 1,
    });
    expect(score).toBe(50);
    expect(getRiskLevel(score)).toBe('warning');
  });

  it('긴급 2건 + 건강 5건 + 밀도 3배 + 복합 → 100점 (위험, 상한)', () => {
    const score = calculateHealthRiskScore({
      recentHealthCount: 5, criticalCount: 2, density: 3, uniqueTypeCount: 3,
    });
    expect(score).toBe(100);
    expect(getRiskLevel(score)).toBe('critical');
  });

  it('최대값 100 초과 안 함', () => {
    const score = calculateHealthRiskScore({
      recentHealthCount: 10, criticalCount: 5, density: 5, uniqueTypeCount: 5,
    });
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('발정 주기 판정', () => {
  it('21일 간격 → 정상 주기', () => {
    const intervals = [21, 21, 22, 20, 21];
    const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    expect(avg).toBeGreaterThanOrEqual(18);
    expect(avg).toBeLessThanOrEqual(24);
  });

  it('15일 미만 간격 → 필터링 (짧은 이벤트)', () => {
    const rawIntervals = [21, 5, 22, 3, 20];
    const valid = rawIntervals.filter((d) => d >= 15 && d <= 30);
    expect(valid).toEqual([21, 22, 20]);
  });

  it('30일 초과 간격 → 필터링 (놓친 발정)', () => {
    const rawIntervals = [21, 42, 22, 63, 21];
    const valid = rawIntervals.filter((d) => d >= 15 && d <= 30);
    expect(valid).toEqual([21, 22, 21]);
  });

  it('유효 간격 2건 미만 → 예측 불가', () => {
    const rawIntervals = [5, 3, 45];
    const valid = rawIntervals.filter((d) => d >= 15 && d <= 30);
    expect(valid.length).toBeLessThan(2);
  });
});
