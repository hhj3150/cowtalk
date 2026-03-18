// Profile Builder 유닛 테스트
// DB 의존 함수는 통합 테스트에서 검증
// 여기서는 shared 타입/상수의 프로파일 관련 테스트

import { describe, it, expect } from 'vitest';
import type {
  AnimalProfile, FarmProfile, RegionalProfile,
  BreedType, SmaxtecEvent, LatestSensorReading,
} from '@shared/types/profile';
import { resolveBreedType } from '@shared/constants/breed-config';

describe('AnimalProfile type contract', () => {
  const mockProfile: AnimalProfile = {
    animalId: 'uuid-1',
    earTag: '001',
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
    activeEvents: [],
    breedingHistory: [],
    pregnancyStatus: null,
    daysSinceInsemination: null,
    healthHistory: [],
    production: { milkYield: 28.5, fat: 3.8, protein: 3.2, scc: 150, testDate: new Date() },
    growth: null,
    environment: null,
    regionalContext: null,
  };

  it('dairy 프로파일 — production 존재, growth null', () => {
    expect(mockProfile.breedType).toBe('dairy');
    expect(mockProfile.production).not.toBeNull();
    expect(mockProfile.growth).toBeNull();
  });

  it('센서 데이터 포함', () => {
    expect(mockProfile.latestSensor.temperature).toBe(38.5);
    expect(mockProfile.latestSensor.measuredAt).toBeInstanceOf(Date);
  });

  it('트레이스 ID 포함', () => {
    expect(mockProfile.traceId).toBe('002-1234-5678');
  });
});

describe('beef 프로파일', () => {
  it('beef 축종 → growth 존재, production null', () => {
    const beefProfile: Partial<AnimalProfile> = {
      breedType: 'beef' as BreedType,
      breed: 'hanwoo',
      production: null,
      growth: { weight: 450, dailyGain: 0.85, gradeEstimate: '1+', measureDate: new Date() },
    };
    expect(beefProfile.breedType).toBe('beef');
    expect(beefProfile.growth).not.toBeNull();
    expect(beefProfile.production).toBeNull();
  });
});

describe('FarmProfile type contract', () => {
  it('농장 프로파일 구조', () => {
    const farm: FarmProfile = {
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
      animalProfiles: [],
      farmHealthScore: null,
      todayActions: [],
    };
    expect(farm.totalAnimals).toBe(50);
    expect(farm.breedComposition.dairy).toBe(45);
  });
});

describe('축종 판별 통합', () => {
  const cases: readonly [string, BreedType][] = [
    ['holstein', 'dairy'],
    ['jersey', 'dairy'],
    ['brown_swiss', 'dairy'],
    ['hanwoo', 'beef'],
    ['angus', 'beef'],
    ['mixed', 'dairy'], // 기본값 dairy
    ['other', 'dairy'],
  ];

  cases.forEach(([breed, expected]) => {
    it(`${breed} → ${expected}`, () => {
      expect(resolveBreedType(breed)).toBe(expected);
    });
  });
});
