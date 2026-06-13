import { describe, it, expect } from 'vitest';
import {
  buildRecommendationRows,
  computeRecommendationAccuracy,
  type AccuracyRecord,
} from '../recommendation-tracking.service.js';
import type { SemenRecommendation } from '../breeding-advisor.service.js';

// 추천 1건 팩토리 — 테스트마다 필요한 필드만 덮어쓴다.
function rec(overrides: Partial<SemenRecommendation> = {}): SemenRecommendation {
  return {
    rank: 1,
    semenId: 'KPN1234',
    bullName: '한우왕',
    bullRegistration: 'KOR000111',
    breed: '한우',
    score: 85,
    inbreedingRisk: 'low',
    estimatedInbreeding: 0.03,
    inbreedingReason: '혈통 정보 없음',
    milkYieldGain: null,
    reasoning: '근교 위험 낮음',
    availableStraws: 5,
    pricePerStraw: 20000,
    pastConceptionRate: null,
    pastSampleSize: 0,
    learningBonus: 0,
    ...overrides,
  };
}

describe('buildRecommendationRows', () => {
  const heatAt = new Date('2026-06-13T06:00:00.000Z');
  const recAt = new Date('2026-06-13T07:00:00.000Z');

  it('추천 N개를 N행으로 매핑하고 개체별 점수 인자를 보존한다', () => {
    const rows = buildRecommendationRows({
      animalId: 'a-1',
      farmId: 'f-1',
      heatDetectedAt: heatAt,
      recommendedAt: recAt,
      batchId: 'batch-1',
      recommendations: [
        rec({ rank: 1, semenId: 'KPN1', score: 90, estimatedInbreeding: 0.03, inbreedingRisk: 'low', learningBonus: 12, pastConceptionRate: 71.4, pastSampleSize: 7 }),
        rec({ rank: 2, semenId: 'KPN2', score: 60, estimatedInbreeding: 0.08, inbreedingRisk: 'medium', learningBonus: -5, pastConceptionRate: null, pastSampleSize: 0 }),
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      batchId: 'batch-1',
      animalId: 'a-1',
      farmId: 'f-1',
      semenId: 'KPN1',
      rank: 1,
      score: 90,
      estimatedInbreeding: 0.03,
      inbreedingRisk: 'low',
      learningBonus: 12,
      pastConceptionRate: 71.4,
      pastSampleSize: 7,
    });
    expect(rows[1]).toMatchObject({ semenId: 'KPN2', rank: 2, inbreedingRisk: 'medium', pastConceptionRate: null });
  });

  it('공유 컨텍스트(batchId/animalId/farmId/heat/recommendedAt)를 모든 행에 붙인다', () => {
    const rows = buildRecommendationRows({
      animalId: 'a-9',
      farmId: 'f-9',
      heatDetectedAt: heatAt,
      recommendedAt: recAt,
      batchId: 'b-9',
      recommendations: [rec({ semenId: 'X' }), rec({ semenId: 'Y' }), rec({ semenId: 'Z' })],
    });

    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.batchId).toBe('b-9');
      expect(r.animalId).toBe('a-9');
      expect(r.farmId).toBe('f-9');
      expect(r.heatDetectedAt).toEqual(heatAt);
      expect(r.recommendedAt).toEqual(recAt);
    }
  });

  it('추천이 없으면 빈 배열을 반환한다 (삽입 자체를 건너뛰게 함)', () => {
    const rows = buildRecommendationRows({
      animalId: 'a-1',
      farmId: 'f-1',
      heatDetectedAt: null,
      recommendedAt: recAt,
      batchId: 'b-1',
      recommendations: [],
    });
    expect(rows).toEqual([]);
  });

  it('heatDetectedAt이 null이어도 안전하게 매핑한다', () => {
    const rows = buildRecommendationRows({
      animalId: 'a-1',
      farmId: 'f-1',
      heatDetectedAt: null,
      recommendedAt: recAt,
      batchId: 'b-1',
      recommendations: [rec()],
    });
    expect(rows[0].heatDetectedAt).toBeNull();
  });
});

describe('computeRecommendationAccuracy', () => {
  const rec = (o: Partial<AccuracyRecord>): AccuracyRecord => ({
    actioned: true,
    usedRecommended: true,
    outcome: null,
    ...o,
  });

  it('빈 입력 → 모든 지표 0/null, status=data_insufficient', () => {
    const a = computeRecommendationAccuracy([]);
    expect(a.totalBatches).toBe(0);
    expect(a.actionedBatches).toBe(0);
    expect(a.adherenceRate).toBeNull();
    expect(a.adherenceStatus).toBe('data_insufficient');
    expect(a.lift).toBeNull();
  });

  it('채택률 = actioned 중 추천정액 사용 비율 (비-actioned는 분모 제외)', () => {
    const a = computeRecommendationAccuracy([
      rec({ actioned: true, usedRecommended: true }),
      rec({ actioned: true, usedRecommended: true }),
      rec({ actioned: true, usedRecommended: false }),
      rec({ actioned: false, usedRecommended: false }), // 수정 안 됨 → 채택률 분모 제외
    ]);
    expect(a.totalBatches).toBe(4);
    expect(a.actionedBatches).toBe(3);
    expect(a.adherenceRate).toBeCloseTo(66.7, 1); // 2/3
    expect(a.adherenceStatus).toBe('ok');
  });

  it('lift = 추천-사용 수태율 − 비추천-사용 수태율 (decided만 집계)', () => {
    const a = computeRecommendationAccuracy([
      // 추천 사용: 2/2 임신 = 100%
      rec({ usedRecommended: true, outcome: 'pregnant' }),
      rec({ usedRecommended: true, outcome: 'pregnant' }),
      // 비추천 사용: 1/2 임신 = 50%
      rec({ usedRecommended: false, outcome: 'pregnant' }),
      rec({ usedRecommended: false, outcome: 'open' }),
      // 미판정(outcome null)은 수태율 분모에서 제외
      rec({ usedRecommended: true, outcome: null }),
    ]);
    expect(a.recommendedConceptionRate).toBeCloseTo(100, 1);
    expect(a.recommendedDecided).toBe(2);
    expect(a.nonRecommendedConceptionRate).toBeCloseTo(50, 1);
    expect(a.nonRecommendedDecided).toBe(2);
    expect(a.lift).toBeCloseTo(50, 1); // 100 − 50
  });

  it('한쪽 그룹의 decided가 0이면 lift=null (대조 불가)', () => {
    const a = computeRecommendationAccuracy([
      rec({ usedRecommended: true, outcome: 'pregnant' }),
      rec({ usedRecommended: true, outcome: 'open' }),
      // 비추천-사용 decided 0건
    ]);
    expect(a.recommendedDecided).toBe(2);
    expect(a.nonRecommendedDecided).toBe(0);
    expect(a.nonRecommendedConceptionRate).toBeNull();
    expect(a.lift).toBeNull();
  });
});
