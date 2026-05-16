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

describe('Sidebar 메뉴 개수 — 6개 시뮬레이션 시나리오 (STEP 1.C)', () => {
  function menuCount(
    isMasterEssence: boolean,
    sim: Parameters<typeof resolveMenuRole>[1],
    userRole: Parameters<typeof resolveMenuRole>[2],
  ): number {
    return getMenuForRole(resolveMenuRole(isMasterEssence, sim, userRole)).length;
  }

  it('isMasterEssence=true, sim=null → 15개', () => {
    expect(menuCount(true, null, 'government_admin')).toBe(15);
  });

  it('isMasterEssence=true, sim=farmer → 6개', () => {
    expect(menuCount(true, 'farmer', 'government_admin')).toBe(6);
  });

  it('isMasterEssence=true, sim=veterinarian → 7개', () => {
    expect(menuCount(true, 'veterinarian', 'government_admin')).toBe(7);
  });

  it('isMasterEssence=true, sim=government_admin → 6개', () => {
    expect(menuCount(true, 'government_admin', 'government_admin')).toBe(6);
  });

  it('isMasterEssence=true, sim=quarantine_officer → 4개', () => {
    expect(menuCount(true, 'quarantine_officer', 'government_admin')).toBe(4);
  });

  it('isMasterEssence=false, user.role=farmer → 6개', () => {
    expect(menuCount(false, null, 'farmer')).toBe(6);
  });
});
