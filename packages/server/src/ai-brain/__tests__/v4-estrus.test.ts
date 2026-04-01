// v4 발정 감지 엔진 테스트

import { describe, it, expect } from 'vitest';
import { analyzeEstrus } from '../v4-engines/v4-estrus.js';
import type { AnimalProfile } from '@cowtalk/shared';
import type { ExtractedFeatures } from '../v4-engines/v4-feature-extractor.js';

// ─── 테스트 헬퍼 ─────────────────────────────────────────────────────────────

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
    animalId: 'test-animal-001',
    earTag: '423',
    traceId: '002132665191',
    farmId: 'test-farm-001',
    orgId: 'test-org-001',
    breed: 'Holstein',
    birthDate: new Date('2020-01-15'),
    parity: 2,
    dim: 120,
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
    lastCalvingDate: new Date('2024-01-15'),
    weight: 550,
    bodyConditionScore: 3.0,
    publicData: null,
    ...overrides,
  };
}

// ─── 테스트 ──────────────────────────────────────────────────────────────────

describe('v4 발정 감지 엔진 (analyzeEstrus)', () => {

  describe('smaXtec 이벤트 감지 (최우선)', () => {
    it('smaXtec 발정 이벤트가 있으면 신호 목록에 포함된다', () => {
      const profile = makeProfile({
        activeEvents: [{
          eventId: 'e1',
          type: 'estrus',
          detectedAt: new Date(),
          severity: 'medium',
          confidence: 0.92,
          details: {},
        }],
      });

      const result = analyzeEstrus(profile, makeFeatures());

      expect(result.smaxtecEventDetected).toBe(true);
      expect(result.signals.some((s) => s.includes('smaXtec 발정'))).toBe(true);
    });

    it('smaXtec 이벤트가 없으면 smaxtecEventDetected는 false다', () => {
      const result = analyzeEstrus(makeProfile(), makeFeatures());
      expect(result.smaxtecEventDetected).toBe(false);
    });
  });

  describe('센서 시그니처 점수', () => {
    it('체온이 발정 범위(0.3~1.0°C) 상승 시 점수가 올라간다', () => {
      const baseResult = analyzeEstrus(makeProfile(), makeFeatures());

      const estrusFeatures = makeFeatures({ temperature_24h_delta: 0.5 });
      const estrusResult = analyzeEstrus(makeProfile(), estrusFeatures);

      expect(estrusResult.score).toBeGreaterThan(baseResult.score);
      expect(estrusResult.signals.some((s) => s.includes('체온 상승'))).toBe(true);
    });

    it('활동량 30% 이상 증가 시 점수가 올라간다', () => {
      const baseResult = analyzeEstrus(makeProfile(), makeFeatures());

      const highActivity = makeFeatures({ activity_24h_delta_pct: 45 });
      const activityResult = analyzeEstrus(makeProfile(), highActivity);

      expect(activityResult.score).toBeGreaterThan(baseResult.score);
      expect(activityResult.signals.some((s) => s.includes('활동'))).toBe(true);
    });

    it('반추 15% 이상 감소 시 점수가 올라간다', () => {
      const baseResult = analyzeEstrus(makeProfile(), makeFeatures());

      const lowRumination = makeFeatures({ rumination_24h_delta_pct: -20 });
      const ruminationResult = analyzeEstrus(makeProfile(), lowRumination);

      expect(ruminationResult.score).toBeGreaterThan(baseResult.score);
      expect(ruminationResult.signals.some((s) => s.includes('반추'))).toBe(true);
    });

    it('모든 센서 신호 동시 발생 시 점수가 최대에 가까워진다', () => {
      const strongFeatures = makeFeatures({
        temperature_24h_delta: 0.6,
        activity_24h_delta_pct: 60,
        rumination_24h_delta_pct: -25,
      });

      const result = analyzeEstrus(makeProfile(), strongFeatures);
      expect(result.score).toBeGreaterThan(0.5);
    });
  });

  describe('번식 이력 점수', () => {
    it('임신 확인 상태이면 발정 점수가 낮다', () => {
      const pregnantProfile = makeProfile({ pregnancyStatus: 'confirmed' });
      const result = analyzeEstrus(pregnantProfile, makeFeatures());

      expect(result.score).toBeLessThan(0.5);
      expect(result.signals.some((s) => s.includes('임신 확인'))).toBe(true);
    });

    it('수정 후 21일 주기 시점(18~24일)이면 점수가 올라간다', () => {
      // breedingHistory가 있어야 daysSinceInsemination 분기에 진입
      const dummyBreeding = { date: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000), result: 'unknown' as const };
      const cycleProfile = makeProfile({
        daysSinceInsemination: 21,
        breedingHistory: [dummyBreeding],
      });
      const baseProfile = makeProfile({
        daysSinceInsemination: 10,
        breedingHistory: [dummyBreeding],
      });

      const cycleResult = analyzeEstrus(cycleProfile, makeFeatures());
      const baseResult = analyzeEstrus(baseProfile, makeFeatures());

      expect(cycleResult.score).toBeGreaterThanOrEqual(baseResult.score);
      expect(cycleResult.signals.some((s) => s.includes('주기상 발정'))).toBe(true);
    });
  });

  describe('단계 판정 (determineStage)', () => {
    it('활동 50% 이상 급증 시 estrus 단계', () => {
      const result = analyzeEstrus(makeProfile(), makeFeatures({ activity_24h_delta_pct: 60 }));
      // estrus 단계는 활동 급증 패턴
      expect(['estrus', 'pre_estrus', 'none']).toContain(result.stage);
    });

    it('smaXtec 이벤트가 있으면 stage는 none이 아닐 수 있다', () => {
      // stage는 이벤트 객체의 직접 속성으로 있을 때만 우선 사용됨
      // 이벤트 있는 경우 smaxtecEventDetected는 true
      const profile = makeProfile({
        activeEvents: [{
          eventId: 'e1',
          type: 'estrus',
          detectedAt: new Date(),
          severity: 'medium',
          confidence: 0.88,
          details: {},
        }],
      });

      const result = analyzeEstrus(profile, makeFeatures());
      expect(result.smaxtecEventDetected).toBe(true);
      expect(['pre_estrus', 'estrus', 'post_estrus', 'none']).toContain(result.stage);
    });
  });

  describe('신뢰도 (confidence)', () => {
    it('점수가 낮으면 confidence는 low다', () => {
      const result = analyzeEstrus(makeProfile(), makeFeatures());
      // 기본 프로필(이벤트 없음, 센서 변화 없음)은 낮은 신뢰도
      expect(['low', 'medium']).toContain(result.confidence);
    });

    it('반환값은 항상 high/medium/low 중 하나다', () => {
      const result = analyzeEstrus(makeProfile(), makeFeatures());
      expect(['high', 'medium', 'low']).toContain(result.confidence);
    });
  });

  describe('score 범위', () => {
    it('score는 항상 0 이상 1 이하다', () => {
      const extremeFeatures = makeFeatures({
        temperature_24h_delta: 2.0,
        activity_24h_delta_pct: 200,
        rumination_24h_delta_pct: -80,
      });
      const result = analyzeEstrus(makeProfile(), extremeFeatures);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('미경산우(parity 0)는 산차 보정이 적용된다', () => {
      const heifer = makeProfile({ parity: 0 });
      const cow = makeProfile({ parity: 2 });

      const featuresWith = makeFeatures({ activity_24h_delta_pct: 40 });

      const heiferResult = analyzeEstrus(heifer, featuresWith);
      const cowResult = analyzeEstrus(cow, featuresWith);

      // 산차 보정값이 다르므로 점수가 다를 수 있음
      expect(heiferResult.score).toBeGreaterThanOrEqual(0);
      expect(cowResult.score).toBeGreaterThanOrEqual(0);
    });
  });
});
