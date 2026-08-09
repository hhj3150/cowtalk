// 기억 권한 경계 — "각 계정은 자기 권한 안의 기억만 기억한다".
//
// 채팅 라우트는 클라이언트가 보낸 farmId를 그대로 넘긴다. 회상이 그 값을 무비판적으로
// 믿으면 배정되지 않은 농장의 기억이 프롬프트에 실려 나간다. 그 경계를 여기서 고정한다.

import { describe, it, expect } from 'vitest';
import { canAccessFarm, scopeForCategory, type MemoryAccess } from '../memory.service.js';

const FARM_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const FARM_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const farmer: MemoryAccess = { userId: 'u-farmer', permittedFarmIds: [FARM_A] };
const vetTwoFarms: MemoryAccess = { userId: 'u-vet', permittedFarmIds: [FARM_A, FARM_B] };
const admin: MemoryAccess = { userId: 'u-admin', permittedFarmIds: null }; // 전체 농장
const unassigned: MemoryAccess = { userId: 'u-new', permittedFarmIds: [] };

describe('canAccessFarm', () => {
  it('배정된 농장은 접근할 수 있다', () => {
    expect(canAccessFarm(farmer, FARM_A)).toBe(true);
  });

  it('배정되지 않은 농장은 접근할 수 없다', () => {
    // 클라이언트가 남의 farmId를 보내도 여기서 막힌다
    expect(canAccessFarm(farmer, FARM_B)).toBe(false);
  });

  it('여러 농장을 담당하는 수의사는 담당 농장 전부에 접근한다', () => {
    expect(canAccessFarm(vetTwoFarms, FARM_A)).toBe(true);
    expect(canAccessFarm(vetTwoFarms, FARM_B)).toBe(true);
  });

  it('전체 권한(null)은 모든 농장에 접근한다', () => {
    expect(canAccessFarm(admin, FARM_A)).toBe(true);
    expect(canAccessFarm(admin, FARM_B)).toBe(true);
  });

  it('미배정 계정은 어떤 농장에도 접근하지 못한다', () => {
    expect(canAccessFarm(unassigned, FARM_A)).toBe(false);
  });

  it('농장 맥락이 없으면 농장 기억은 없다', () => {
    expect(canAccessFarm(admin, null)).toBe(false);
  });
});

describe('scopeForCategory — 권한 판정 가능한 스코프만 만든다', () => {
  it('선호는 개인 스코프 (농장이 있어도 개인에 붙는다)', () => {
    // 목장주의 "아침에 짧게 보고해줘"가 같은 농장 다른 계정에 새면 안 된다
    expect(scopeForCategory('preference', true, true)).toBe('user');
  });

  it('목장 사실은 농장 스코프 (같은 농장 계정끼리 공유가 목적)', () => {
    expect(scopeForCategory('farm_fact', true, false)).toBe('farm');
    expect(scopeForCategory('equipment', true, false)).toBe('farm');
  });

  it('개체 특성은 농장이 함께 있을 때만 개체 스코프가 된다', () => {
    // farmId 없는 개체 기억은 "누가 볼 수 있는가"에 답할 수 없다 → 만들지 않는다
    expect(scopeForCategory('animal_fact', true, true)).toBe('animal');
    expect(scopeForCategory('animal_fact', false, true)).toBe('user');
  });

  it('농장 맥락이 없으면 목장 사실도 개인 기억으로 남는다', () => {
    expect(scopeForCategory('farm_fact', false, false)).toBe('user');
  });
});
