// 사이드바 메뉴 단일 소스 — 역할별 노출/정렬 검증 (FLOW-02 Step1)
// canonical Role(@cowtalk/shared) + master 플래그 기준.

import { describe, it, expect } from 'vitest';
import type { Role } from '@cowtalk/shared';
import { getMenuForRole, type MenuRole } from './sidebar-menu';

describe('getMenuForRole — 역할별 메뉴 개수', () => {
  it('master → 16개 메뉴 반환', () => {
    expect(getMenuForRole('master')).toHaveLength(16);
  });

  it('farmer → 7개 (dashboard, my-cows, breeding, breeding-cal, automation, alerts, subscription)', () => {
    const role: Role = 'farmer';
    const ids = getMenuForRole(role).map((item) => item.id);
    expect(ids).toEqual(['dashboard', 'my-cows', 'breeding', 'breeding-cal', 'automation', 'alerts', 'subscription']);
  });

  it('veterinarian → 8개 (dashboard, breeding, breeding-cal, vet-cases, vet-schedule, sensor-cmp, automation, alerts)', () => {
    const role: Role = 'veterinarian';
    const ids = getMenuForRole(role).map((item) => item.id);
    expect(ids).toEqual(['dashboard', 'breeding', 'breeding-cal', 'vet-cases', 'vet-schedule', 'sensor-cmp', 'automation', 'alerts']);
  });

  it('government_admin → 7개 (dashboard, sensor-cmp, region-map, epi-dash, automation, alerts, admin-ai)', () => {
    const role: Role = 'government_admin';
    const ids = getMenuForRole(role).map((item) => item.id);
    expect(ids).toEqual(['dashboard', 'sensor-cmp', 'region-map', 'epi-dash', 'automation', 'alerts', 'admin-ai']);
  });

  it('quarantine_officer → 5개 (dashboard, region-map, epi-dash, automation, alerts)', () => {
    const role: Role = 'quarantine_officer';
    const ids = getMenuForRole(role).map((item) => item.id);
    expect(ids).toEqual(['dashboard', 'region-map', 'epi-dash', 'automation', 'alerts']);
  });
});

describe('getMenuForRole — order 오름차순 정렬', () => {
  const ROLES: MenuRole[] = ['master', 'farmer', 'veterinarian', 'government_admin', 'quarantine_officer'];

  for (const role of ROLES) {
    it(`${role} 결과가 order 오름차순`, () => {
      const orders = getMenuForRole(role).map((item) => item.order);
      const sorted = [...orders].sort((a, b) => a - b);
      expect(orders).toEqual(sorted);
    });
  }
});
