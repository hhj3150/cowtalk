// 프롬프트 빌더 유닛 테스트

import { describe, it, expect } from 'vitest';
import { buildAnimalPrompt } from '@server/ai-brain/prompts/animal-prompt';
import { buildFarmPrompt } from '@server/ai-brain/prompts/farm-prompt';
import { buildRegionalPrompt } from '@server/ai-brain/prompts/regional-prompt';
import { buildConversationPrompt } from '@server/ai-brain/prompts/conversation-prompt';
import { SYSTEM_PROMPT, ROLE_CONTEXT } from '@server/ai-brain/prompts/system-prompt';
import type { AnimalProfile, FarmProfile, RegionalProfile } from '@shared/types/profile';

const mockAnimalProfile: AnimalProfile = {
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
  sensorHistory24h: [],
  sensorHistory7d: [],
  sensorHistory30d: [],
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

describe('SYSTEM_PROMPT', () => {
  it('smaXtec 신뢰 원칙 포함', () => {
    expect(SYSTEM_PROMPT).toContain('smaXtec');
    expect(SYSTEM_PROMPT).toContain('재판단하지 말고');
  });

  it('JSON 응답 요구 포함', () => {
    expect(SYSTEM_PROMPT).toContain('지정된 JSON');
  });

  it('축종별 가이드 포함', () => {
    expect(SYSTEM_PROMPT).toContain('젖소');
    expect(SYSTEM_PROMPT).toContain('한우');
  });

  it('4개 역할 컨텍스트', () => {
    expect(Object.keys(ROLE_CONTEXT)).toHaveLength(4);
    expect(ROLE_CONTEXT.farmer).toContain('농장주');
    expect(ROLE_CONTEXT.veterinarian).toContain('수의사');
  });
});

describe('buildAnimalPrompt', () => {
  it('기본 정보 포함', () => {
    const prompt = buildAnimalPrompt(mockAnimalProfile, 'farmer', null);
    expect(prompt).toContain('312');
    expect(prompt).toContain('002-1234-5678');
    expect(prompt).toContain('젖소');
  });

  it('센서 데이터 포함', () => {
    const prompt = buildAnimalPrompt(mockAnimalProfile, 'farmer', null);
    expect(prompt).toContain('38.5');
    expect(prompt).toContain('450');
  });

  it('활성 이벤트 포함 (smaXtec 신뢰)', () => {
    const prompt = buildAnimalPrompt(mockAnimalProfile, 'farmer', null);
    expect(prompt).toContain('estrus');
    expect(prompt).toContain('신뢰');
    expect(prompt).toContain('95%');
  });

  it('유량 데이터 포함 (dairy)', () => {
    const prompt = buildAnimalPrompt(mockAnimalProfile, 'farmer', null);
    expect(prompt).toContain('28.5');
    expect(prompt).toContain('유량');
  });

  it('역할별 맥락 포함', () => {
    const farmerPrompt = buildAnimalPrompt(mockAnimalProfile, 'farmer', null);
    expect(farmerPrompt).toContain('농장주');

    const vetPrompt = buildAnimalPrompt(mockAnimalProfile, 'veterinarian', null);
    expect(vetPrompt).toContain('수의사');
  });

  it('v4 보조 분석 포함', () => {
    const v4 = {
      estrusScore: 0.85,
      diseaseRisks: [],
      pregnancyStability: null,
      dataQualityScore: 82,
      features: { activity_24h_delta_pct: 45.2 },
    };
    const prompt = buildAnimalPrompt(mockAnimalProfile, 'farmer', v4);
    expect(prompt).toContain('v4 룰 엔진');
    expect(prompt).toContain('85%');
  });

  it('JSON 응답 형식 요청 포함', () => {
    const prompt = buildAnimalPrompt(mockAnimalProfile, 'farmer', null);
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"interpretation"');
    expect(prompt).toContain('"actions"');
  });
});

describe('buildFarmPrompt', () => {
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
    farmHealthScore: 78,
    todayActions: [],
  };

  it('농장 정보 포함', () => {
    const prompt = buildFarmPrompt(mockFarmProfile, 'farmer');
    expect(prompt).toContain('테스트 농장');
    expect(prompt).toContain('50');
    expect(prompt).toContain('45');
  });

  it('개체 현황 포함', () => {
    const prompt = buildFarmPrompt(mockFarmProfile, 'farmer');
    expect(prompt).toContain('312');
  });
});

describe('buildRegionalPrompt', () => {
  const mockRegionalProfile: RegionalProfile = {
    regionId: 'r1',
    tenantId: null,
    farms: [{ farmId: 'f1', name: '농장A', totalAnimals: 30, activeAlerts: 2, healthScore: null }],
    totalAnimals: 30,
    activeAlerts: 2,
    clusterSignals: [],
    summary: '경기도 화성시: 1개 농장, 30두',
  };

  it('지역 정보 포함', () => {
    const prompt = buildRegionalPrompt(mockRegionalProfile, 'government_admin');
    expect(prompt).toContain('30두');
    expect(prompt).toContain('2건');
  });
});

describe('buildConversationPrompt', () => {
  it('질문 포함', () => {
    const prompt = buildConversationPrompt(
      '117번 체온 어때?',
      'farmer',
      { type: 'general' },
      [],
    );
    expect(prompt).toContain('117번 체온 어때?');
  });

  it('대화 이력 포함', () => {
    const prompt = buildConversationPrompt(
      '그 소 건강은?',
      'farmer',
      { type: 'general' },
      [
        { role: 'user', content: '312번 상태 알려줘' },
        { role: 'assistant', content: '312번은 현재 정상입니다.' },
      ],
    );
    expect(prompt).toContain('312번 상태 알려줘');
    expect(prompt).toContain('312번은 현재 정상입니다.');
  });

  it('동물 컨텍스트 포함', () => {
    const prompt = buildConversationPrompt(
      '이 소 어때?',
      'veterinarian',
      { type: 'animal', profile: mockAnimalProfile },
      [],
    );
    expect(prompt).toContain('312');
    expect(prompt).toContain('38.5');
  });
});
