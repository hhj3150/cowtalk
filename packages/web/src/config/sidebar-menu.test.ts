// 사이드바 메뉴 단일 소스 — 역할별 노출 계약 검증 (FLOW-02 Step1)
// canonical Role(@cowtalk/shared) + master 플래그 기준.
//
// 왜 개수가 아니라 권한 경계를 검증하는가:
// 이전 버전은 역할별 메뉴 개수와 정확한 id 배열을 하드코딩했다. 메뉴를 하나 추가할
// 때마다 무관한 테스트가 무더기로 깨졌고, 실제로 그 상태로 방치되어 CI가 상시
// 빨간색이 됐다 — 늘 깨져 있는 신호는 아무도 읽지 않는다.
//
// 이 화면의 계약은 "메뉴가 몇 개인가"가 아니라 "어느 역할이 무엇을 보고, 무엇을
// 못 보는가"다. 아래는 그 경계와 구조 불변식만 고정한다. 메뉴가 늘어도 깨지지
// 않고, 정작 위험한 것(농장주에게 관리자·방역 메뉴가 새는 것)은 잡는다.

import { describe, it, expect } from 'vitest';
import { getMenuForRole, SIDEBAR_MENU, type MenuRole } from './sidebar-menu';

const ROLES: readonly MenuRole[] = [
  'master', 'farmer', 'veterinarian', 'government_admin', 'quarantine_officer',
];

/** 마스터 전용 관리 도구 — 다른 역할에 새면 권한 문제다 */
const ADMIN_ONLY = ['admin-farms', 'admin-users', 'admin-system'] as const;
/** 전국 단위 방역·감시 — 개별 목장 이용자에게는 범위 밖이다 */
const SURVEILLANCE = ['epi-dash', 'region-map'] as const;
/** 목장 운영 전용 — 목장을 소유하지 않는 역할에는 의미가 없다 */
const FARM_OPERATIONS = ['my-cows', 'milk-entry', 'feed-ration', 'subscription'] as const;

interface RoleContract {
  readonly role: MenuRole;
  readonly mustHave: readonly string[];
  readonly mustNotHave: readonly string[];
}

const CONTRACTS: readonly RoleContract[] = [
  {
    role: 'farmer',
    mustHave: ['dashboard', 'my-cows', 'breeding', 'milk-entry', 'feed-ration', 'alerts'],
    mustNotHave: [...ADMIN_ONLY, ...SURVEILLANCE, 'vet-cases', 'vet-schedule', 'admin-ai'],
  },
  {
    role: 'veterinarian',
    mustHave: ['dashboard', 'vet-cases', 'vet-schedule', 'breeding', 'sensor-cmp'],
    mustNotHave: [...ADMIN_ONLY, ...SURVEILLANCE, ...FARM_OPERATIONS, 'admin-ai'],
  },
  {
    role: 'government_admin',
    mustHave: ['dashboard', ...SURVEILLANCE, 'sensor-cmp', 'admin-ai'],
    mustNotHave: [...ADMIN_ONLY, ...FARM_OPERATIONS, 'vet-cases', 'breeding'],
  },
  {
    role: 'quarantine_officer',
    mustHave: ['dashboard', ...SURVEILLANCE, 'alerts'],
    mustNotHave: [...ADMIN_ONLY, ...FARM_OPERATIONS, 'vet-cases', 'breeding', 'econ-params', 'admin-ai'],
  },
];

describe('getMenuForRole — 역할별 권한 경계', () => {
  for (const { role, mustHave, mustNotHave } of CONTRACTS) {
    it(`${role} — 업무에 필요한 메뉴를 본다`, () => {
      const ids = getMenuForRole(role).map((item) => item.id);
      for (const id of mustHave) {
        expect(ids, `${role}에 '${id}'가 없다`).toContain(id);
      }
    });

    it(`${role} — 권한 밖 메뉴는 보이지 않는다`, () => {
      const ids = getMenuForRole(role).map((item) => item.id);
      for (const id of mustNotHave) {
        expect(ids, `${role}에 '${id}'가 노출됐다`).not.toContain(id);
      }
    });
  }

  it('master 는 모든 메뉴를 본다 (상위집합)', () => {
    const masterIds = new Set(getMenuForRole('master').map((item) => item.id));
    for (const item of SIDEBAR_MENU) {
      expect(masterIds, `master 메뉴에 '${item.id}'가 빠졌다`).toContain(item.id);
    }
  });

  it('관리 도구는 master 외 어떤 역할에도 노출되지 않는다', () => {
    for (const role of ROLES) {
      if (role === 'master') continue;
      const ids = getMenuForRole(role).map((item) => item.id);
      for (const adminId of ADMIN_ONLY) {
        expect(ids, `${role}에 관리 도구 '${adminId}'가 노출됐다`).not.toContain(adminId);
      }
    }
  });
});

describe('getMenuForRole — 구조 불변식', () => {
  it('산출 결과는 항상 roles 정의와 일치한다', () => {
    for (const role of ROLES) {
      const expected = SIDEBAR_MENU.filter((item) => item.roles.includes(role)).map((i) => i.id);
      expect(new Set(getMenuForRole(role).map((i) => i.id))).toEqual(new Set(expected));
    }
  });

  for (const role of ROLES) {
    it(`${role} 결과가 order 오름차순`, () => {
      const orders = getMenuForRole(role).map((item) => item.order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
    });
  }

  it('메뉴 id 는 고유하다 — 중복 등록 시 활성 표시·라우팅이 어긋난다', () => {
    const ids = SIDEBAR_MENU.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 메뉴는 최소 한 역할에 노출된다 — 죽은 항목 방지', () => {
    for (const item of SIDEBAR_MENU) {
      expect(item.roles.length, `'${item.id}'가 어떤 역할에도 노출되지 않는다`).toBeGreaterThan(0);
    }
  });

  it('모든 메뉴의 href 는 절대 경로다', () => {
    for (const item of SIDEBAR_MENU) {
      expect(item.href.startsWith('/'), `'${item.id}'의 href 가 상대 경로다: ${item.href}`).toBe(true);
    }
  });
});
