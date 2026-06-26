import { describe, it, expect } from 'vitest';
import { classifyHerdGroup, countHerdGroups } from '../herd-group.js';

describe('classifyHerdGroup — enum 변형 흡수', () => {
  it('착유우 변형 모두 milking', () => {
    for (const v of ['milking', 'lactating', 'Lactating_Cow', 'LACTATING']) {
      expect(classifyHerdGroup({ lactationStatus: v })).toBe('milking');
    }
  });
  it('건유우 변형 모두 dry', () => {
    for (const v of ['dry', 'dry_off', 'Dry_Cow']) {
      expect(classifyHerdGroup({ lactationStatus: v })).toBe('dry');
    }
  });
  it('육성우 변형 모두 heifer', () => {
    for (const v of ['heifer', 'Young_Cow']) {
      expect(classifyHerdGroup({ lactationStatus: v })).toBe('heifer');
    }
  });
});

describe('classifyHerdGroup — lactationStatus 누락 시 parity·DIM 추론', () => {
  it('분만경험(parity>=1) + 낮은 DIM → milking', () => {
    expect(classifyHerdGroup({ lactationStatus: null, parity: 3, daysInMilk: 120 })).toBe('milking');
    expect(classifyHerdGroup({ lactationStatus: 'unknown', parity: 1, daysInMilk: 0 })).toBe('milking');
  });
  it('분만경험 + 높은 DIM(>250) → dry', () => {
    expect(classifyHerdGroup({ lactationStatus: '', parity: 2, daysInMilk: 300 })).toBe('dry');
  });
  it('미경산(parity 0/누락) → heifer', () => {
    expect(classifyHerdGroup({ lactationStatus: null, parity: 0 })).toBe('heifer');
    expect(classifyHerdGroup({})).toBe('heifer');
  });
});

describe('countHerdGroups — 해돋이목장 불일치 회귀 방지', () => {
  it('동기화값 lactating 66 + dry 17 → 착유66/건유17/육성0 (smaXtec 일치)', () => {
    const herd = [
      ...Array(66).fill({ lactationStatus: 'lactating', parity: 3, daysInMilk: 100 }),
      ...Array(17).fill({ lactationStatus: 'dry', parity: 4, daysInMilk: 300 }),
    ];
    expect(countHerdGroups(herd)).toEqual({ milking: 66, dry: 17, heifer: 0 });
  });
});
