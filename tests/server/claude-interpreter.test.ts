// Claude Interpreter 유닛 테스트
// Claude API는 mock, v4 fallback 동작 검증

import { describe, it, expect, vi } from 'vitest';
import type { AnimalProfile, FarmProfile } from '@shared/types/profile';

// Claude API mock — 항상 null 반환 (fallback 테스트)
vi.mock('@server/ai-brain/claude-client', () => ({
  callClaudeForAnalysis: vi.fn().mockResolvedValue(null),
  isClaudeAvailable: vi.fn().mockReturnValue(false),
  callClaudeForChatJson: vi.fn().mockResolvedValue(null),
  callClaudeForChat: vi.fn(),
}));

// profile-builder mock — DB 없이 테스트
vi.mock('@server/pipeline/profile-builder', () => ({
  buildAnimalProfile: vi.fn(),
  buildFarmProfile: vi.fn(),
  buildRegionalProfile: vi.fn(),
  buildTenantProfile: vi.fn(),
}));

import { interpretAnimal, interpretFarm } from '@server/ai-brain/claude-interpreter';

const mockAnimalProfile: AnimalProfile = {
  animalId: 'uuid-1',
  earTag: '312',
  traceId: null,
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
    temperature: 39.8,
    rumination: 300,
    activity: 200,
    waterIntake: 80,
    ph: 6.3,
    measuredAt: new Date(),
  },
  sensorHistory24h: Array.from({ length: 12 }, (_, i) => ({
    timestamp: new Date(Date.now() - i * 2 * 60 * 60 * 1000),
    temperature: 38.3 + Math.random() * 0.4,
    rumination: 420 + Math.random() * 60,
    activity: 100 + Math.random() * 40,
    waterIntake: 70 + Math.random() * 20,
    ph: 6.2 + Math.random() * 0.3,
  })),
  sensorHistory7d: [],
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
  breedingHistory: [],
  pregnancyStatus: null,
  daysSinceInsemination: null,
  healthHistory: [],
  production: { milkYield: 28.5, fat: 3.8, protein: 3.2, scc: 150, testDate: new Date() },
  growth: null,
  environment: null,
  regionalContext: null,
};

describe('interpretAnimal (v4 fallback)', () => {
  it('Claude 불가 → v4 fallback 해석 반환', async () => {
    const result = await interpretAnimal(mockAnimalProfile, 'farmer');

    expect(result).toBeDefined();
    expect(result.source).toBe('v4_fallback');
    expect(result.animalId).toBe('uuid-1');
    expect(result.earTag).toBe('312');
    expect(result.summary).toBeTruthy();
    expect(result.modelVersion).toBe('v4-rule-engine');
  });

  it('v4 분석 포함', async () => {
    const result = await interpretAnimal(mockAnimalProfile, 'farmer');

    expect(result.v4Analysis).not.toBeNull();
    expect(result.v4Analysis?.dataQualityScore).toBeGreaterThan(0);
  });

  it('actions에 6역할 모두 포함', async () => {
    const result = await interpretAnimal(mockAnimalProfile, 'farmer');

    expect(result.actions.farmer).toBeTruthy();
    expect(result.actions.veterinarian).toBeTruthy();
    expect(result.actions.inseminator).toBeTruthy();
    expect(result.actions.government_admin).toBeTruthy();
    expect(result.actions.quarantine_officer).toBeTruthy();
    expect(result.actions.feed_company).toBeTruthy();
  });

  it('데이터 참조 포함', async () => {
    const result = await interpretAnimal(mockAnimalProfile, 'farmer');

    expect(result.dataReferences.length).toBeGreaterThan(0);
    // 체온, smaXtec 이벤트 등
    expect(result.dataReferences.some((r) => r.includes('체온'))).toBe(true);
  });

  it('severity 판정', async () => {
    const result = await interpretAnimal(mockAnimalProfile, 'farmer');

    expect(['low', 'medium', 'high', 'critical']).toContain(result.severity);
  });
});

describe('interpretFarm (v4 fallback)', () => {
  const mockFarmProfile: FarmProfile = {
    farmId: 'f1',
    name: '테스트 농장',
    address: '경기도 화성시',
    lat: 37.2,
    lng: 127.0,
    region: '경기도 화성시',
    tenantId: null,
    totalAnimals: 50,
    breedComposition: { dairy: 45, beef: 5 },
    activeSmaxtecEvents: [],
    animalProfiles: [mockAnimalProfile],
    farmHealthScore: null,
    todayActions: [],
  };

  it('Claude 불가 → v4 fallback 농장 해석', async () => {
    const result = await interpretFarm(mockFarmProfile, 'farmer');

    expect(result.source).toBe('v4_fallback');
    expect(result.farmId).toBe('f1');
    expect(result.summary).toContain('테스트 농장');
  });

  it('활성 이벤트 있는 개체 하이라이트', async () => {
    const result = await interpretFarm(mockFarmProfile, 'farmer');

    // mockAnimalProfile has active estrus event
    expect(result.animalHighlights.length).toBeGreaterThan(0);
    expect(result.animalHighlights[0]!.earTag).toBe('312');
  });
});
