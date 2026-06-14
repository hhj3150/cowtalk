// profileHash — 해석 캐시 무효화 키 테스트
// 같은 프로필 → 같은 해시(키 순서 무관), 데이터 변경 → 해시 변경

import { describe, it, expect } from 'vitest';
import type { AnimalProfile } from '@cowtalk/shared';
import { hashAnimalProfile } from '../interpretation-hash.js';

function mockProfile(overrides: Record<string, unknown> = {}): AnimalProfile {
  return {
    animalId: 'a1',
    earTag: '001',
    latestSensor: { temperature: 38.5, activity: 100, rumination: 450 },
    activeEvents: [],
    pregnancyStatus: null,
    daysSinceInsemination: null,
    ...overrides,
  } as unknown as AnimalProfile;
}

describe('hashAnimalProfile', () => {
  it('같은 프로필은 같은 해시를 낸다 (결정성)', () => {
    const p = mockProfile();
    expect(hashAnimalProfile(p)).toBe(hashAnimalProfile(p));
  });

  it('키 삽입 순서가 달라도 같은 해시 (stable stringify)', () => {
    const a = mockProfile({ latestSensor: { temperature: 38.5, activity: 100 } });
    const b = mockProfile({ latestSensor: { activity: 100, temperature: 38.5 } });
    expect(hashAnimalProfile(a)).toBe(hashAnimalProfile(b));
  });

  it('센서 값이 바뀌면 해시가 바뀐다', () => {
    const base = mockProfile();
    const changed = mockProfile({ latestSensor: { temperature: 40.1, activity: 100, rumination: 450 } });
    expect(hashAnimalProfile(changed)).not.toBe(hashAnimalProfile(base));
  });

  it('활성 이벤트가 추가되면 해시가 바뀐다', () => {
    const base = mockProfile();
    const changed = mockProfile({ activeEvents: [{ type: 'heat', detectedAt: new Date('2026-06-14') }] });
    expect(hashAnimalProfile(changed)).not.toBe(hashAnimalProfile(base));
  });

  it('Date 필드를 안전하게 직렬화한다 (예외 없음)', () => {
    const p = mockProfile({ birthDate: new Date('2024-01-01T00:00:00Z') });
    expect(() => hashAnimalProfile(p)).not.toThrow();
    expect(hashAnimalProfile(p)).toMatch(/^[0-9a-f]{64}$/);
  });
});
