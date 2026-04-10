// 비식별화 유틸 테스트
// Claude API 전송 데이터에서 개체·농장 식별자가 해시 토큰으로 치환되는지 검증한다.

import { describe, it, expect } from 'vitest';
import {
  hashIdentifier,
  maskField,
  deidentifyAnimalProfile,
  deidentifyFarmProfile,
  deidentifyRecord,
  createAnimalDeidentifier,
  createFarmDeidentifier,
} from '../prompts/deidentify.js';
import type { AnimalProfile, FarmProfile } from '@cowtalk/shared';

// ─── 헬퍼 ─────────────────────────────────────────────────────────────

function makeAnimalProfile(overrides: Partial<AnimalProfile> = {}): AnimalProfile {
  return {
    animalId: 'animal-uuid-001',
    earTag: '423',
    traceId: '002132665191',
    breedType: 'dairy',
    breed: '홀스타인',
    birthDate: new Date('2023-03-15'),
    sex: 'female',
    parity: 2,
    sire: null,
    dam: null,
    farmId: 'farm-uuid-001',
    farmName: '해돋이목장',
    region: '경기도 포천시',
    tenantId: null,
    latestSensor: {
      temperature: 38.9,
      rumination: 450,
      activity: 100,
      waterIntake: 55,
      ph: 6.4,
      measuredAt: new Date('2026-04-10T06:00:00Z'),
    },
    sensorHistory24h: [],
    sensorHistory7d: [],
    sensorHistory30d: [],
    activeEvents: [],
    breedingHistory: [],
    pregnancyStatus: null,
    daysSinceInsemination: null,
    breedingFeedback: null,
    healthHistory: [],
    production: null,
    growth: null,
    environment: null,
    regionalContext: null,
    ...overrides,
  };
}

function makeFarmProfile(overrides: Partial<FarmProfile> = {}): FarmProfile {
  return {
    farmId: 'farm-uuid-001',
    name: '해돋이목장',
    address: '경기도 포천시 소흘읍 송라로 123',
    lat: 37.8945,
    lng: 127.2001,
    region: '경기도 포천시',
    tenantId: null,
    totalAnimals: 87,
    breedComposition: { dairy: 87, beef: 0 },
    activeSmaxtecEvents: [],
    animalProfiles: [makeAnimalProfile()],
    farmHealthScore: 85,
    todayActions: [],
    ...overrides,
  };
}

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe('hashIdentifier', () => {
  it('같은 입력에 대해 결정적으로 같은 토큰을 생성한다', () => {
    const t1 = hashIdentifier('002132665191', 'TR', 8);
    const t2 = hashIdentifier('002132665191', 'TR', 8);
    expect(t1).toBe(t2);
  });

  it('다른 입력에 대해 다른 토큰을 생성한다', () => {
    const t1 = hashIdentifier('001', 'COW');
    const t2 = hashIdentifier('002', 'COW');
    expect(t1).not.toBe(t2);
  });

  it('접두사와 길이 규칙을 따른다', () => {
    const token = hashIdentifier('animal-123', 'COW', 6);
    expect(token).toMatch(/^COW-[a-f0-9]{6}$/);
  });

  it('네임스페이스가 다르면 같은 값이라도 다른 토큰을 생성한다', () => {
    const asCow = hashIdentifier('001', 'COW');
    const asTr = hashIdentifier('001', 'TR');
    expect(asCow).not.toBe(asTr);
  });

  it('빈 문자열에 대해서는 UNKNOWN 토큰을 반환한다', () => {
    expect(hashIdentifier('', 'COW')).toBe('COW-UNKNOWN');
  });
});

describe('maskField', () => {
  it('값이 있으면 [MASKED]를 반환한다', () => {
    expect(maskField('경기도 포천시 소흘읍')).toBe('[MASKED]');
  });

  it('null/undefined/빈문자열은 [EMPTY]를 반환한다', () => {
    expect(maskField(null)).toBe('[EMPTY]');
    expect(maskField(undefined)).toBe('[EMPTY]');
    expect(maskField('')).toBe('[EMPTY]');
  });
});

describe('deidentifyAnimalProfile', () => {
  it('귀표번호·이력번호·농장명을 해시 토큰으로 치환한다', () => {
    const profile = makeAnimalProfile();
    const safe = deidentifyAnimalProfile(profile);

    expect(safe.earTag).not.toBe('423');
    expect(safe.earTag).toMatch(/^COW-/);
    expect(safe.traceId).not.toBe('002132665191');
    expect(safe.traceId).toMatch(/^TR-/);
    expect(safe.farmName).not.toBe('해돋이목장');
    expect(safe.farmName).toMatch(/^FARM-/);
  });

  it('traceId가 null이면 null을 유지한다', () => {
    const profile = makeAnimalProfile({ traceId: null });
    const safe = deidentifyAnimalProfile(profile);
    expect(safe.traceId).toBeNull();
  });

  it('지역은 시도 단위까지만 유지한다', () => {
    const profile = makeAnimalProfile({ region: '경기도 포천시' });
    const safe = deidentifyAnimalProfile(profile);
    expect(safe.region).toBe('경기도');
  });

  it('센서 수치·품종·산차는 그대로 유지한다', () => {
    const profile = makeAnimalProfile();
    const safe = deidentifyAnimalProfile(profile);
    expect(safe.latestSensor.temperature).toBe(38.9);
    expect(safe.breed).toBe('홀스타인');
    expect(safe.parity).toBe(2);
  });

  it('원본 객체를 수정하지 않는다 (불변성)', () => {
    const profile = makeAnimalProfile();
    const originalEarTag = profile.earTag;
    deidentifyAnimalProfile(profile);
    expect(profile.earTag).toBe(originalEarTag);
  });
});

describe('deidentifyFarmProfile', () => {
  it('농장명·주소·지역을 치환한다', () => {
    const profile = makeFarmProfile();
    const safe = deidentifyFarmProfile(profile);

    expect(safe.name).toMatch(/^FARM-/);
    expect(safe.address).toBe('[MASKED]');
    expect(safe.region).toBe('경기도');
  });

  it('포함된 개체 프로필도 비식별화한다', () => {
    const profile = makeFarmProfile();
    const safe = deidentifyFarmProfile(profile);

    expect(safe.animalProfiles[0]?.earTag).toMatch(/^COW-/);
    expect(safe.animalProfiles[0]?.traceId).toMatch(/^TR-/);
  });

  it('두수·건강점수는 그대로 유지한다', () => {
    const profile = makeFarmProfile();
    const safe = deidentifyFarmProfile(profile);
    expect(safe.totalAnimals).toBe(87);
    expect(safe.farmHealthScore).toBe(85);
  });
});

describe('deidentifyRecord', () => {
  it('재귀적으로 민감 키를 마스킹한다', () => {
    const record = {
      summary: 'test',
      animal: {
        earTag: '423',
        traceId: '002132665191',
        temperature: 38.9,
      },
      farm: {
        farmName: '해돋이목장',
        address: '경기도 포천시 123',
      },
    };

    const safe = deidentifyRecord(record) as Record<string, unknown>;
    const animal = safe.animal as Record<string, unknown>;
    const farm = safe.farm as Record<string, unknown>;

    expect(animal.earTag).toMatch(/^COW-/);
    expect(animal.traceId).toMatch(/^TR-/);
    expect(animal.temperature).toBe(38.9);
    expect(farm.farmName).toMatch(/^FARM-/);
    expect(farm.address).toBe('[MASKED]');
  });

  it('배열 안의 민감 키도 처리한다', () => {
    const record = { animals: [{ earTag: '423' }, { earTag: '424' }] };
    const safe = deidentifyRecord(record) as { animals: { earTag: string }[] };
    expect(safe.animals[0]?.earTag).toMatch(/^COW-/);
    expect(safe.animals[1]?.earTag).toMatch(/^COW-/);
    expect(safe.animals[0]?.earTag).not.toBe(safe.animals[1]?.earTag);
  });

  it('null/undefined/원시값을 그대로 통과시킨다', () => {
    expect(deidentifyRecord(null)).toBeNull();
    expect(deidentifyRecord(undefined)).toBeUndefined();
    expect(deidentifyRecord(42)).toBe(42);
    expect(deidentifyRecord('plain text')).toBe('plain text');
  });
});

describe('createAnimalDeidentifier (양방향 변환)', () => {
  it('비식별 프로필과 역변환 함수를 반환한다', () => {
    const profile = makeAnimalProfile();
    const { profile: safe, rehydrate } = createAnimalDeidentifier(profile);

    expect(safe.earTag).toMatch(/^COW-/);
    expect(rehydrate).toBeInstanceOf(Function);
  });

  it('응답 텍스트의 토큰을 원본 식별자로 복원한다', () => {
    const profile = makeAnimalProfile();
    const { profile: safe, rehydrate } = createAnimalDeidentifier(profile);

    // Claude가 응답에 safe.earTag 토큰을 쓴다고 가정
    const fakeResponse = `개체 ${safe.earTag}의 체온이 상승했습니다. 농장 ${safe.farmName} 확인 필요.`;
    const restored = rehydrate(fakeResponse);

    expect(restored).toContain('423');
    expect(restored).toContain('해돋이목장');
    expect(restored).not.toContain(safe.earTag);
  });

  it('rehydrateRecord는 중첩된 JSON도 복원한다', () => {
    const profile = makeAnimalProfile();
    const { profile: safe, rehydrateRecord } = createAnimalDeidentifier(profile);

    const fakeClaudeJson = {
      summary: `${safe.earTag} 상태 양호`,
      animal_highlights: [
        { ear_tag: safe.earTag, issue: 'none', severity: 'low' },
      ],
    };

    const restored = rehydrateRecord(fakeClaudeJson) as {
      summary: string;
      animal_highlights: { ear_tag: string }[];
    };

    expect(restored.summary).toContain('423');
    expect(restored.animal_highlights[0]?.ear_tag).toBe('423');
  });
});

describe('createFarmDeidentifier (양방향 변환)', () => {
  it('농장 + 포함 개체의 역매핑을 모두 관리한다', () => {
    const profile = makeFarmProfile({
      animalProfiles: [
        makeAnimalProfile({ animalId: 'a1', earTag: '423', traceId: null, farmId: 'farm-uuid-001' }),
        makeAnimalProfile({ animalId: 'a2', earTag: '424', traceId: null, farmId: 'farm-uuid-001' }),
      ],
    });
    const { profile: safe, rehydrateRecord } = createFarmDeidentifier(profile);

    // 두 개체가 서로 다른 토큰을 갖는지
    expect(safe.animalProfiles[0]?.earTag).not.toBe(safe.animalProfiles[1]?.earTag);

    // Claude 응답 시뮬레이션
    const fake = {
      summary: `${safe.name} 농장의 ${safe.animalProfiles[0]?.earTag} 확인 필요`,
      highlights: [{ ear_tag: safe.animalProfiles[1]?.earTag ?? '', issue: 'fever' }],
    };

    const restored = rehydrateRecord(fake) as {
      summary: string;
      highlights: { ear_tag: string }[];
    };

    expect(restored.summary).toContain('해돋이목장');
    expect(restored.summary).toContain('423');
    expect(restored.highlights[0]?.ear_tag).toBe('424');
  });
});

describe('데이터 주권 검증 (프롬프트에 원본 식별자 누출 방지)', () => {
  it('비식별 프로필을 JSON 직렬화했을 때 원본 식별자가 포함되지 않는다', () => {
    const profile = makeAnimalProfile();
    const { profile: safe } = createAnimalDeidentifier(profile);
    const serialized = JSON.stringify(safe);

    expect(serialized).not.toContain('423'); // 원본 귀표
    expect(serialized).not.toContain('002132665191'); // 원본 이력번호
    expect(serialized).not.toContain('해돋이목장'); // 원본 농장명
  });

  it('비식별 농장 프로필도 마찬가지', () => {
    const profile = makeFarmProfile();
    const { profile: safe } = createFarmDeidentifier(profile);
    const serialized = JSON.stringify(safe);

    expect(serialized).not.toContain('해돋이목장');
    expect(serialized).not.toContain('소흘읍');
    expect(serialized).not.toContain('송라로');
    expect(serialized).not.toContain('002132665191');
  });
});
