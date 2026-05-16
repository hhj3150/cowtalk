// Sidebar 역할 시뮬레이션 메뉴 산출 검증 (FLOW-02 Step2.5)
// resolveMenuRole(본 계정 역할, 시뮬레이션 역할) → getMenuForRole 체인.

import { describe, it, expect } from 'vitest';
import { resolveMenuRole } from './Sidebar';
import { getMenuForRole } from '@web/config/sidebar-menu';

describe('resolveMenuRole — master 본질 + 시뮬레이션', () => {
  it('master + 시뮬레이션 안 함(null) → "master"', () => {
    expect(resolveMenuRole('government_admin', null)).toBe('master');
  });

  it('master + farmer 시뮬레이션 → "farmer"', () => {
    expect(resolveMenuRole('government_admin', 'farmer')).toBe('farmer');
  });

  it('master + veterinarian 시뮬레이션 → "veterinarian"', () => {
    expect(resolveMenuRole('government_admin', 'veterinarian')).toBe('veterinarian');
  });

  it('master + government_admin 시뮬레이션 → "government_admin"', () => {
    expect(resolveMenuRole('government_admin', 'government_admin')).toBe('government_admin');
  });

  it('master + quarantine_officer 시뮬레이션 → "quarantine_officer"', () => {
    expect(resolveMenuRole('government_admin', 'quarantine_officer')).toBe('quarantine_officer');
  });

  it('비-master(farmer)는 시뮬레이션 무관하게 본 계정 역할 사용', () => {
    expect(resolveMenuRole('farmer', null)).toBe('farmer');
    // 비-master 에는 시뮬레이션이 설정되지 않지만, 설정돼도 본 계정 역할 우선
    expect(resolveMenuRole('veterinarian', null)).toBe('veterinarian');
  });

  it('user 미로딩(undefined) → "farmer" fallback', () => {
    expect(resolveMenuRole(undefined, null)).toBe('farmer');
  });
});

describe('Sidebar 메뉴 개수 — 5개 시뮬레이션 시나리오', () => {
  function menuCount(userRole: Parameters<typeof resolveMenuRole>[0], sim: Parameters<typeof resolveMenuRole>[1]): number {
    return getMenuForRole(resolveMenuRole(userRole, sim)).length;
  }

  it('기본(master, 시뮬레이션 없음) → 15개', () => {
    expect(menuCount('government_admin', null)).toBe(15);
  });

  it('farmer 시뮬레이션 → 6개', () => {
    expect(menuCount('government_admin', 'farmer')).toBe(6);
  });

  it('veterinarian 시뮬레이션 → 7개', () => {
    expect(menuCount('government_admin', 'veterinarian')).toBe(7);
  });

  it('government_admin 시뮬레이션 → 6개', () => {
    expect(menuCount('government_admin', 'government_admin')).toBe(6);
  });

  it('quarantine_officer 시뮬레이션 → 4개', () => {
    expect(menuCount('government_admin', 'quarantine_officer')).toBe(4);
  });
});
