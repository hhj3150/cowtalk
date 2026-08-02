// Sidebar 역할 시뮬레이션 메뉴 산출 검증 (FLOW-02 Step2.6)
// resolveMenuRole(isMasterEssence, simulatedRole, userRole) → getMenuForRole 체인.

import { describe, it, expect } from 'vitest';
import { resolveMenuRole } from './Sidebar';
import { getMenuForRole } from '@web/config/sidebar-menu';

describe('resolveMenuRole — master 본질 + 시뮬레이션', () => {
  it('master 본질 + 시뮬레이션 없음(null) → "master"', () => {
    expect(resolveMenuRole(true, null, 'government_admin')).toBe('master');
  });

  it('master 본질 + farmer 시뮬레이션 → "farmer"', () => {
    expect(resolveMenuRole(true, 'farmer', 'government_admin')).toBe('farmer');
  });

  it('master 본질 + veterinarian 시뮬레이션 → "veterinarian"', () => {
    expect(resolveMenuRole(true, 'veterinarian', 'government_admin')).toBe('veterinarian');
  });

  it('master 본질 + government_admin 시뮬레이션 → "government_admin"', () => {
    expect(resolveMenuRole(true, 'government_admin', 'government_admin')).toBe('government_admin');
  });

  it('master 본질 + quarantine_officer 시뮬레이션 → "quarantine_officer"', () => {
    expect(resolveMenuRole(true, 'quarantine_officer', 'government_admin')).toBe('quarantine_officer');
  });

  it('비-master(farmer)는 본 계정 역할 사용', () => {
    expect(resolveMenuRole(false, null, 'farmer')).toBe('farmer');
  });

  it('비-master(실제 government_admin 행정관)는 "master" 아님 → government_admin 메뉴', () => {
    // 최경기행정 처럼 name 에 'Master Admin' 없는 government_admin → isMasterEssence=false
    expect(resolveMenuRole(false, null, 'government_admin')).toBe('government_admin');
  });

  it('user 미로딩(undefined) → "farmer" fallback', () => {
    expect(resolveMenuRole(false, null, undefined)).toBe('farmer');
  });
});

describe('Sidebar 메뉴 산출 — 6개 시뮬레이션 시나리오 (STEP 1.C)', () => {
  // 여기서 검증할 것은 "시뮬레이션 역할이 메뉴까지 제대로 이어지는가"이지
  // 메뉴가 몇 개인가가 아니다. 개수를 하드코딩하면 메뉴가 하나 늘 때마다
  // 무관한 PR의 CI가 빨개진다(실제로 그래서 오래 red였다).
  // → 해당 역할의 메뉴와 "같은지"만 본다. 개수 검증은 sidebar-menu.test.ts가 맡는다.
  function menuIds(
    isMasterEssence: boolean,
    sim: Parameters<typeof resolveMenuRole>[1],
    userRole: Parameters<typeof resolveMenuRole>[2],
  ): string[] {
    return getMenuForRole(resolveMenuRole(isMasterEssence, sim, userRole)).map((i) => i.id);
  }

  const idsFor = (role: Parameters<typeof getMenuForRole>[0]): string[] =>
    getMenuForRole(role).map((i) => i.id);

  it('isMasterEssence=true, sim=null → master 메뉴', () => {
    expect(menuIds(true, null, 'government_admin')).toEqual(idsFor('master'));
  });

  it('isMasterEssence=true, sim=farmer → farmer 메뉴', () => {
    expect(menuIds(true, 'farmer', 'government_admin')).toEqual(idsFor('farmer'));
  });

  it('isMasterEssence=true, sim=veterinarian → veterinarian 메뉴', () => {
    expect(menuIds(true, 'veterinarian', 'government_admin')).toEqual(idsFor('veterinarian'));
  });

  it('isMasterEssence=true, sim=government_admin → government_admin 메뉴', () => {
    expect(menuIds(true, 'government_admin', 'government_admin')).toEqual(idsFor('government_admin'));
  });

  it('isMasterEssence=true, sim=quarantine_officer → quarantine_officer 메뉴', () => {
    expect(menuIds(true, 'quarantine_officer', 'government_admin')).toEqual(idsFor('quarantine_officer'));
  });

  it('isMasterEssence=false, user.role=farmer → farmer 메뉴', () => {
    expect(menuIds(false, null, 'farmer')).toEqual(idsFor('farmer'));
  });

  it('시뮬레이션은 실제로 메뉴를 바꾼다 — 항등식이 아님을 확인', () => {
    // 위 단언들이 자기참조로 늘 통과하는 걸 막는 안전장치:
    // master와 farmer 메뉴가 실제로 달라야 시뮬레이션 검증이 의미를 갖는다.
    expect(menuIds(true, null, 'government_admin')).not.toEqual(menuIds(true, 'farmer', 'government_admin'));
  });
});
