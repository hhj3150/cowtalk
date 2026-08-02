// 사이드바 메뉴 단일 소스 — 역할별 노출/정렬 검증 (FLOW-02 Step1)
// canonical Role(@cowtalk/shared) + master 플래그 기준.
//
// 설계 노트 (2026-08 개편):
//   이 테스트는 원래 "master → 16개" 같은 매직 넘버를 들고 있었다.
//   그래서 메뉴가 하나 추가될 때마다 무관한 PR의 CI가 빨개졌고, 실제로
//   econ-params·milk-entry·feed-ration이 들어온 뒤 오래 방치돼 CI가 신호 역할을 잃었다.
//
//   이제 개수를 따로 적지 않는다. 역할별 기대 ID 목록 하나만 유지하고
//   개수는 거기서 파생시킨다 — 메뉴를 추가하면 이 목록만 고치면 되고,
//   "실수로 다른 역할에 노출됐는지"는 여전히 잡힌다.

import { describe, it, expect } from 'vitest';
import type { Role } from '@cowtalk/shared';
import { getMenuForRole, SIDEBAR_MENU, type MenuRole } from './sidebar-menu';

/** 역할별로 보여야 하는 메뉴 — order 오름차순. 메뉴 추가 시 여기만 갱신한다. */
const EXPECTED_MENU: Readonly<Record<MenuRole, readonly string[]>> = {
  master: [
    'dashboard', 'my-cows', 'breeding', 'milk-entry', 'feed-ration', 'breeding-cal',
    'vet-cases', 'vet-schedule', 'sensor-cmp', 'region-map', 'epi-dash',
    'automation', 'alerts', 'econ-params', 'subscription',
    'admin-farms', 'admin-users', 'admin-system', 'admin-ai',
  ],
  farmer: [
    'dashboard', 'my-cows', 'breeding', 'milk-entry', 'feed-ration', 'breeding-cal',
    'automation', 'alerts', 'econ-params', 'subscription',
  ],
  veterinarian: [
    'dashboard', 'breeding', 'breeding-cal', 'vet-cases', 'vet-schedule',
    'sensor-cmp', 'automation', 'alerts', 'econ-params',
  ],
  government_admin: [
    'dashboard', 'sensor-cmp', 'region-map', 'epi-dash',
    'automation', 'alerts', 'econ-params', 'admin-ai',
  ],
  quarantine_officer: [
    'dashboard', 'region-map', 'epi-dash', 'automation', 'alerts',
  ],
};

const ROLES = Object.keys(EXPECTED_MENU) as MenuRole[];

describe('getMenuForRole — 역할별 노출 메뉴', () => {
  for (const role of ROLES) {
    it(`${role} → ${String(EXPECTED_MENU[role].length)}개`, () => {
      expect(getMenuForRole(role).map((item) => item.id)).toEqual(EXPECTED_MENU[role]);
    });
  }

  it('canonical Role 타입으로도 동일하게 동작한다', () => {
    const role: Role = 'farmer';
    expect(getMenuForRole(role).map((item) => item.id)).toEqual(EXPECTED_MENU.farmer);
  });
});

describe('getMenuForRole — 구조 불변식', () => {
  // 개수를 적지 않는 불변식들 — 메뉴가 늘어도 깨지지 않고, 진짜 실수만 잡는다.

  it('master는 모든 메뉴를 본다 — 새 메뉴에 master를 빠뜨리면 여기서 잡힌다', () => {
    expect(getMenuForRole('master')).toHaveLength(SIDEBAR_MENU.length);
  });

  it('메뉴 id는 중복되지 않는다', () => {
    const ids = SIDEBAR_MENU.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('메뉴 order는 중복되지 않는다 — 정렬이 불안정해지는 것을 막는다', () => {
    const orders = SIDEBAR_MENU.map((item) => item.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('roles가 빈 메뉴는 없다 — 아무에게도 안 보이는 죽은 메뉴 방지', () => {
    const orphans = SIDEBAR_MENU.filter((item) => item.roles.length === 0).map((i) => i.id);
    expect(orphans).toEqual([]);
  });

  it('admin 그룹은 master 아니면 government_admin에게만 열린다', () => {
    const leaked = SIDEBAR_MENU
      .filter((item) => item.group === 'admin')
      .filter((item) => item.roles.some((r) => r !== 'master' && r !== 'government_admin'))
      .map((i) => i.id);
    expect(leaked).toEqual([]);
  });
});

describe('getMenuForRole — order 오름차순 정렬', () => {
  for (const role of ROLES) {
    it(`${role} 결과가 order 오름차순`, () => {
      const orders = getMenuForRole(role).map((item) => item.order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    });
  }
});
