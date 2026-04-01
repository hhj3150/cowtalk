// v4 질병 경고 엔진 테스트

import { describe, it, expect } from 'vitest';
import { analyzeDisease } from '../v4-engines/v4-disease.js';
import type { AnimalProfile } from '@cowtalk/shared';
import type { ExtractedFeatures } from '../v4-engines/v4-feature-extractor.js';

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function makeFeatures(overrides: Partial<ExtractedFeatures> = {}): ExtractedFeatures {
  return {
    temperature_current: 38.5,
    temperature_24h_avg: 38.5,
    temperature_24h_delta: 0,
    temperature_24h_max: 38.8,
    temperature_24h_min: 38.2,
    temperature_trend: 'stable',
    activity_current: 100,
    activity_24h_avg: 100,
    activity_24h_delta_pct: 0,
    rumination_current: 450,
    rumination_24h_avg: 450,
    rumination_24h_delta_pct: 0,
    water_intake_current: 60,
    water_intake_24h_delta_pct: 0,
    ph_current: 6.5,
    ph_24h_avg: 6.5,
    estrus_evidence_score: 0,
    disease_evidence_score: 0,
    data_quality_score: 90,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<AnimalProfile> = {}): AnimalProfile {
  return {
    animalId: 'test-animal-002',
    earTag: '100',
    traceId: '002000000001',
    farmId: 'test-farm-001',
    orgId: 'test-org-001',
    breed: 'Holstein',
    birthDate: new Date('2019-06-01'),
    parity: 3,
    dim: 60,
    pregnancyStatus: 'open',
    daysToExpectedCalving: null,
    daysSinceInsemination: null,
    lactationStatus: 'lactating',
    latestSensor: {
      temperature: 38.5,
      rumination: 450,
      activity: 100,
      waterIntake: 60,
      ph: 6.5,
      recordedAt: new Date(),
    },
    sensorHistory24h: [],
    activeEvents: [],
    breedingHistory: [],
    diseaseHistory: [],
    healthHistory: [],
    lastCalvingDate: new Date('2024-03-01'),
    weight: 600,
    bodyConditionScore: 3.0,
    publicData: null,
    ...overrides,
  };
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('v4 질병 경고 엔진 (analyzeDisease)', () => {

  describe('정상 상태', () => {
    it('모든 지표가 정상이면 overallRisk는 0이다', () => {
      const result = analyzeDisease(makeProfile(), makeFeatures());
      expect(result.overallRisk).toBe(0);
      expect(result.risks).toHaveLength(0);
      expect(result.urgencyHours).toBeNull();
    });

    it('정상 상태에서 signals 배열은 비어있다', () => {
      const result = analyzeDisease(makeProfile(), makeFeatures());
      expect(result.signals).toHaveLength(0);
    });
  });

  describe('유방염(Mastitis) 패턴', () => {
    it('체온 39.5°C 이상 + 반추 감소 + 활동 감소 시 유방염 위험 감지', () => {
      const features = makeFeatures({
        temperature_current: 40.2,
        temperature_24h_delta: 1.5,
        rumination_24h_delta_pct: -30,
        activity_24h_delta_pct: -30,
        water_intake_24h_delta_pct: -25,
      });

      const result = analyzeDisease(makeProfile({ parity: 3, dim: 30 }), features);
      expect(result.overallRisk).toBeGreaterThan(0);
      const mastitisRisk = result.risks.find((r) => r.diseaseType === 'mastitis');
      expect(mastitisRisk).toBeDefined();
    });

    it('고열(40.5°C 이상)은 유방염 점수를 높인다', () => {
      const normalFeatures = makeFeatures({ temperature_current: 39.6, rumination_24h_delta_pct: -22 });
      const highFeverFeatures = makeFeatures({ temperature_current: 40.6, rumination_24h_delta_pct: -22 });

      const normalResult = analyzeDisease(makeProfile(), normalFeatures);
      const highFeverResult = analyzeDisease(makeProfile(), highFeverFeatures);

      expect(highFeverResult.overallRisk).toBeGreaterThanOrEqual(normalResult.overallRisk);
    });
  });

  describe('케토시스(Ketosis) 패턴', () => {
    it('dairy 고산차 + 반추 급감 + 음수 감소 시 케토시스 위험 감지', () => {
      // breedType: 'dairy' + parity>=2 → +10, 반추 <-30% → +25, 음수 <-25% → +15 = 50 >= 35
      const freshDairyCow = makeProfile({
        parity: 3,
        breedType: 'dairy',
        dim: 15,
      });
      const features = makeFeatures({
        temperature_current: 37.8,
        rumination_24h_delta_pct: -35,
        water_intake_24h_delta_pct: -30,
        activity_24h_delta_pct: -15,
      });

      const result = analyzeDisease(freshDairyCow, features);
      expect(result.overallRisk).toBeGreaterThan(0);
      const ketosisRisk = result.risks.find((r) => r.diseaseType === 'ketosis');
      expect(ketosisRisk).toBeDefined();
    });
  });

  describe('smaXtec 건강 이벤트 보강', () => {
    it('smaXtec 건강 경고 이벤트가 있으면 signals에 포함된다', () => {
      const profile = makeProfile({
        activeEvents: [{
          eventId: 'e-health-1',
          type: 'health_warning',
          detectedAt: new Date(),
          severity: 'high',
          confidence: 0.85,
          details: {},
        }],
      });

      const result = analyzeDisease(profile, makeFeatures());
      expect(result.signals.some((s) => s.includes('smaXtec 건강 경고'))).toBe(true);
    });
  });

  describe('긴급도 계산', () => {
    it('overallRisk 0일 때 urgencyHours는 null이다', () => {
      const result = analyzeDisease(makeProfile(), makeFeatures());
      expect(result.urgencyHours).toBeNull();
    });

    it('반환값 타입이 올바르다', () => {
      const result = analyzeDisease(makeProfile(), makeFeatures());
      expect(typeof result.overallRisk).toBe('number');
      expect(Array.isArray(result.risks)).toBe(true);
      expect(Array.isArray(result.signals)).toBe(true);
    });
  });

  describe('overallRisk 범위', () => {
    it('overallRisk는 항상 0 이상 1 이하다', () => {
      const extremeFeatures = makeFeatures({
        temperature_current: 41.5,
        rumination_24h_delta_pct: -80,
        activity_24h_delta_pct: -80,
        ph_current: 4.5,
      });

      const result = analyzeDisease(makeProfile(), extremeFeatures);
      expect(result.overallRisk).toBeGreaterThanOrEqual(0);
      expect(result.overallRisk).toBeLessThanOrEqual(1);
    });
  });
});
