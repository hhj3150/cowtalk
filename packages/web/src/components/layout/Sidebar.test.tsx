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

// resolveMenuRole → getMenuForRole 체인 검증.
//
// 역할별 '무엇이 보이는가'의 계약은 sidebar-menu.test.ts 가 소유한다. 여기서는
// 역할 해석이 실제 메뉴 산출로 이어지는지, 즉 시뮬레이션이 화면을 바꾸는지만 본다.
// (개수 하드코딩은 제거했다 — 메뉴가 늘 때마다 무관하게 깨지고, 그래서 방치됐다.)

describe('resolveMenuRole → 메뉴 산출 연결', () => {
  function menuIds(
    isMasterEssence: boolean,
    sim: Parameters<typeof resolveMenuRole>[1],
    userRole: Parameters<typeof resolveMenuRole>[2],
  ): string[] {
    return getMenuForRole(resolveMenuRole(isMasterEssence, sim, userRole)).map((m) => m.id);
  }

  it('master 가 farmer 를 시뮬레이션하면 목장주 메뉴가 나온다', () => {
    const ids = menuIds(true, 'farmer', 'government_admin');
    expect(ids).toContain('my-cows');
    expect(ids).not.toContain('admin-users'); // 시뮬레이션 중엔 마스터 도구가 사라져야 한다
  });

  it('시뮬레이션을 끄면 master 전체 메뉴로 돌아온다', () => {
    expect(menuIds(true, null, 'government_admin')).toContain('admin-users');
  });

  it('비-master 계정은 시뮬레이션과 무관하게 본 계정 메뉴만 본다', () => {
    const ids = menuIds(false, null, 'farmer');
    expect(ids).toContain('my-cows');
    expect(ids).not.toContain('admin-users');
  });

  it('user 미로딩 상태에서도 빈 메뉴가 아니라 farmer 기본 메뉴가 나온다', () => {
    expect(menuIds(false, null, undefined).length).toBeGreaterThan(0);
  });
});
