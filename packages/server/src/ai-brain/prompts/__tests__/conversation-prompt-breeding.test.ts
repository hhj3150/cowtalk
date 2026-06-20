// 대화 경로 목장 번식 설정 주입 테스트
// CLAUDE.md 요구: "목장마다 번식 파라미터가 다르므로 AI가 반드시 목장 설정을 참조해야 한다."
// animal 해석 경로(animal-prompt)에만 적용돼 있던 목장 설정 주입을 대화(팅커벨) 경로로 확장.

import { describe, it, expect } from 'vitest';
import type { AnimalProfile, FarmProfile } from '@cowtalk/shared';
import type { FarmBreedingSettings } from '../../../db/schema.js';
import { buildConversationPrompt, type ChatContext } from '../conversation-prompt.js';

function animalProfile(): AnimalProfile {
  return {
    earTag: '152',
    farmId: 'farm-1',
    farmName: '해돋이목장',
    breedType: 'dairy',
    breed: 'Holstein',
    birthDate: null,
    parity: 2,
    latestSensor: { temperature: null, rumination: null, activity: null, waterIntake: null, ph: null },
    activeEvents: [],
    sensorHistory7d: [],
    sensorHistory30d: [],
    breedingHistory: [],
    healthHistory: [],
  } as unknown as AnimalProfile;
}

function farmProfile(): FarmProfile {
  return {
    farmId: 'farm-1',
    name: '해돋이목장',
    region: '경기',
    totalAnimals: 10,
    breedComposition: { dairy: 8, beef: 2 },
    activeSmaxtecEvents: [],
    farmHealthScore: null,
  } as unknown as FarmProfile;
}

const SETTINGS: FarmBreedingSettings = {
  estrusRecurrenceDays: 21,
  inseminationWindowStartHours: 10,
  inseminationWindowEndHours: 18,
  pregnancyCheckDays: 28,
  gestationDays: 280,
  longOpenDaysDim: 200,
};

describe('buildConversationPrompt — 목장 번식 설정 주입', () => {
  it('animal 컨텍스트 + 설정 제공 시 목장 번식 설정 블록을 주입한다', () => {
    const ctx: ChatContext = { type: 'animal', profile: animalProfile() };
    const out = buildConversationPrompt('이 소 발정 적기 언제야?', 'farmer', ctx, [], {
      farmBreedingSettings: SETTINGS,
    });
    expect(out).toContain('목장 번식 설정');
    expect(out).toContain('21'); // 발정재귀일
    expect(out).toContain('28'); // 임신감정 시기
  });

  it('animal 컨텍스트 + 설정 미제공 시 목장 번식 설정 블록을 넣지 않는다', () => {
    const ctx: ChatContext = { type: 'animal', profile: animalProfile() };
    const out = buildConversationPrompt('이 소 상태 어때?', 'farmer', ctx, []);
    expect(out).not.toContain('목장 번식 설정');
  });

  it('farm 컨텍스트 + 설정 제공 시 목장 번식 설정 블록을 주입한다', () => {
    const ctx: ChatContext = { type: 'farm', profile: farmProfile() };
    const out = buildConversationPrompt('우리 목장 번식 성적 어때?', 'farmer', ctx, [], {
      farmBreedingSettings: SETTINGS,
    });
    expect(out).toContain('목장 번식 설정');
    expect(out).toContain('200'); // 장기공태우 기준 DIM
  });

  it('general 컨텍스트는 설정이 있어도 목장 번식 설정을 주입하지 않는다(특정 농장 부재)', () => {
    const ctx: ChatContext = { type: 'general' };
    const out = buildConversationPrompt('케토시스가 뭐야?', 'farmer', ctx, [], {
      farmBreedingSettings: SETTINGS,
    });
    expect(out).not.toContain('목장 번식 설정');
  });
});
