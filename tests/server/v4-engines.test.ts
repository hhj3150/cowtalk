// v4 룰 엔진 유닛 테스트

import { describe, it, expect } from 'vitest';
import { extractFeatures } from '@server/ai-brain/v4-engines/v4-feature-extractor';
import { analyzeEstrus } from '@server/ai-brain/v4-engines/v4-estrus';
import { analyzeDisease } from '@server/ai-brain/v4-engines/v4-disease';
import { analyzePregnancy } from '@server/ai-brain/v4-engines/v4-pregnancy';
import { runV4Analysis } from '@server/ai-brain/v4-engines/v4-fusion';
import type { AnimalProfile, SensorSnapshot } from '@shared/types/profile';

// 테스트용 mock 프로파일 팩토리
function createMockProfile(overrides: Partial<AnimalProfile> = {}): AnimalProfile {
  return {
    animalId: 'uuid-1',
    earTag: '312',
    traceId: '002-1234-5678',
    breedType: 'dairy',
    breed: 'holstein',
    birthDate: new Date('2022-01-15'),
    sex: 'female',
    parity: 3,
    sire: null,
    dam: null,
    farmId: 'farm-1',
    farmName: '테스트 농장',
    region: '경기도 화성시',
    tenantId: null,
    latestSensor: {
      temperature: 38.5,
      rumination: 450,
      activity: 120,
      waterIntake: 80,
      ph: 6.3,
      measuredAt: new Date(),
    },
    sensorHistory24h: createMockHistory24h(),
    sensorHistory7d: [],
    activeEvents: [],
    breedingHistory: [],
    pregnancyStatus: null,
    daysSinceInsemination: null,
    healthHistory: [],
    production: { milkYield: 28.5, fat: 3.8, protein: 3.2, scc: 150, testDate: new Date() },
    growth: null,
    environment: null,
    regionalContext: null,
    ...overrides,
  };
}

function createMockHistory24h(): SensorSnapshot[] {
  return Array.from({ length: 12 }, (_, i) => ({
    timestamp: new Date(Date.now() - i * 2 * 60 * 60 * 1000),
    temperature: 38.3 + Math.random() * 0.4,
    rumination: 420 + Math.random() * 60,
    activity: 100 + Math.random() * 40,
    waterIntake: 70 + Math.random() * 20,
    ph: 6.2 + Math.random() * 0.3,
  }));
}

describe('extractFeatures', () => {
  it('정상 프로파일 → 특성 추출', () => {
    const profile = createMockProfile();
    const features = extractFeatures(profile);

    expect(features.temperature_current).toBe(38.5);
    expect(features.temperature_24h_avg).not.toBeNull();
    expect(features.data_quality_score).toBeGreaterThan(0);
  });

  it('센서 데이터 없음 → null 특성', () => {
    const profile = createMockProfile({
      latestSensor: {
        temperature: null,
        rumination: null,
        activity: null,
        waterIntake: null,
        ph: null,
        measuredAt: null,
      },
      sensorHistory24h: [],
    });
    const features = extractFeatures(profile);

    expect(features.temperature_current).toBeNull();
    expect(features.temperature_24h_avg).toBeNull();
    expect(features.estrus_evidence_score).toBe(0);
  });

  it('체온 트렌드 계산', () => {
    const profile = createMockProfile();
    const features = extractFeatures(profile);

    expect(['rising', 'falling', 'stable', 'unknown']).toContain(features.temperature_trend);
  });
});

describe('analyzeEstrus', () => {
  it('정상 상태 → 발정 점수 낮음', () => {
    const profile = createMockProfile();
    const features = extractFeatures(profile);
    const result = analyzeEstrus(profile, features);

    expect(result.score).toBeLessThan(0.45);
    expect(result.smaxtecEventDetected).toBe(false);
  });

  it('smaXtec 발정 이벤트 → 높은 점수', () => {
    const profile = createMockProfile({
      activeEvents: [{
        eventId: 'e1',
        type: 'estrus',
        animalId: 'uuid-1',
        detectedAt: new Date(),
        confidence: 0.95,
        severity: 'high',
        stage: 'estrus',
        details: {},
        rawData: {},
      }],
      latestSensor: {
        temperature: 38.8,
        rumination: 380,
        activity: 200,
        waterIntake: 80,
        ph: 6.3,
        measuredAt: new Date(),
      },
    });
    const features = extractFeatures(profile);
    const result = analyzeEstrus(profile, features);

    expect(result.score).toBeGreaterThan(0.3);
    expect(result.smaxtecEventDetected).toBe(true);
  });

  it('임신 확인 → 발정 가능성 낮음', () => {
    const profile = createMockProfile({
      pregnancyStatus: 'confirmed',
      breedingHistory: [{ date: new Date(), semenType: null, technician: null, result: 'success' }],
      daysSinceInsemination: 60,
    });
    const features = extractFeatures(profile);
    const result = analyzeEstrus(profile, features);

    expect(result.signals.some((s) => s.includes('임신 확인'))).toBe(true);
  });
});

describe('analyzeDisease', () => {
  it('정상 상태 → 낮은 위험', () => {
    const profile = createMockProfile();
    const features = extractFeatures(profile);
    const result = analyzeDisease(profile, features);

    expect(result.overallRisk).toBeLessThan(0.3);
  });

  it('발열 + 반추 감소 → 질병 위험', () => {
    const profile = createMockProfile({
      latestSensor: {
        temperature: 40.2,
        rumination: 200,
        activity: 60,
        waterIntake: 40,
        ph: 6.3,
        measuredAt: new Date(),
      },
    });
    const features = extractFeatures(profile);
    const result = analyzeDisease(profile, features);

    expect(result.overallRisk).toBeGreaterThan(0);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('낮은 pH → 산독증 의심', () => {
    const profile = createMockProfile({
      latestSensor: {
        temperature: 38.5,
        rumination: 300,
        activity: 100,
        waterIntake: 100,
        ph: 5.3,
        measuredAt: new Date(),
      },
    });
    const features = extractFeatures(profile);
    const result = analyzeDisease(profile, features);

    expect(result.risks.some((r) => r.diseaseType === 'acidosis')).toBe(true);
    expect(result.signals.some((s) => s.includes('산독증'))).toBe(true);
  });

  it('높은 SCC + 체온 상승 → 유방염 의심', () => {
    const profile = createMockProfile({
      latestSensor: {
        temperature: 39.6,
        rumination: 350,
        activity: 80,
        waterIntake: 70,
        ph: 6.3,
        measuredAt: new Date(),
      },
      production: { milkYield: 25, fat: 3.5, protein: 3.0, scc: 500, testDate: new Date() },
    });
    const features = extractFeatures(profile);
    const result = analyzeDisease(profile, features);

    expect(result.risks.some((r) => r.diseaseType === 'mastitis')).toBe(true);
  });
});

describe('analyzePregnancy', () => {
  it('수정 이력 없음 → not_applicable', () => {
    const profile = createMockProfile();
    const features = extractFeatures(profile);
    const result = analyzePregnancy(profile, features);

    expect(result.status).toBe('not_applicable');
  });

  it('임신 확인 → likely_pregnant', () => {
    const profile = createMockProfile({
      pregnancyStatus: 'confirmed',
      breedingHistory: [{ date: new Date(), semenType: null, technician: null, result: 'success' }],
      daysSinceInsemination: 60,
    });
    const features = extractFeatures(profile);
    const result = analyzePregnancy(profile, features);

    expect(result.status).toBe('likely_pregnant');
    expect(result.stabilityScore).toBeGreaterThan(0.7);
  });

  it('발정 재감지 → 안정성 감소', () => {
    const profile = createMockProfile({
      breedingHistory: [{ date: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000), semenType: null, technician: null, result: 'pending' }],
      daysSinceInsemination: 21,
      activeEvents: [{
        eventId: 'e1',
        type: 'estrus',
        animalId: 'uuid-1',
        detectedAt: new Date(),
        confidence: 0.9,
        severity: 'high',
        details: {},
        rawData: {},
      }],
    });
    const features = extractFeatures(profile);
    const result = analyzePregnancy(profile, features);

    expect(result.signals.some((s) => s.includes('수태 실패'))).toBe(true);
  });
});

describe('runV4Analysis (fusion)', () => {
  it('정상 프로파일 → 전체 분석 결과', () => {
    const profile = createMockProfile();
    const result = runV4Analysis(profile);

    expect(result.analysis).toBeDefined();
    expect(result.estrus).toBeDefined();
    expect(result.disease).toBeDefined();
    expect(result.pregnancy).toBeDefined();
    expect(result.fallbackSummary).toBeTruthy();
    expect(result.fallbackActions).toBeDefined();
    expect(result.severity).toBeDefined();
  });

  it('질병 위험 높을 때 → disease 우선', () => {
    const profile = createMockProfile({
      latestSensor: {
        temperature: 40.5,
        rumination: 150,
        activity: 30,
        waterIntake: 30,
        ph: 5.2,
        measuredAt: new Date(),
      },
    });
    const result = runV4Analysis(profile);

    expect(result.primaryConcern).toContain('disease');
    expect(['high', 'critical']).toContain(result.severity);
  });

  it('fallbackSummary에 귀표 포함', () => {
    const profile = createMockProfile({ earTag: '117' });
    const result = runV4Analysis(profile);

    expect(result.fallbackSummary).toContain('117');
  });

  it('fallbackActions에 4역할 모두 포함', () => {
    const profile = createMockProfile();
    const result = runV4Analysis(profile);

    expect(result.fallbackActions.farmer).toBeTruthy();
    expect(result.fallbackActions.veterinarian).toBeTruthy();
    expect(result.fallbackActions.government_admin).toBeTruthy();
    expect(result.fallbackActions.quarantine_officer).toBeTruthy();
  });
});
