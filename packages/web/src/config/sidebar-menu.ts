import type { Role } from '@cowtalk/shared';

// 메뉴 가시성 분류 - canonical Role 4종 + master 플래그
export type MenuRole = Role | 'master';

export interface MenuItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  roles: MenuRole[];
  order: number;
  group?: 'core' | 'analytics' | 'admin';
}

export const SIDEBAR_MENU: MenuItem[] = [
  { id: 'dashboard',    label: '대시보드',      href: '/',                       icon: 'LayoutDashboard', roles: ['master','farmer','veterinarian','government_admin','quarantine_officer'], order: 10,  group: 'core' },
  { id: 'my-cows',      label: '내 소',         href: '/my-cattle',              icon: 'Cog',             roles: ['master','farmer'],                                                          order: 20,  group: 'core' },
  { id: 'breeding',     label: '번식 커맨드',   href: '/breeding',               icon: 'Heart',           roles: ['master','farmer','veterinarian'],                                          order: 30,  group: 'core' },
  { id: 'breeding-cal', label: '번식 캘린더',   href: '/breeding/calendar',      icon: 'Calendar',        roles: ['master','farmer','veterinarian'],                                          order: 35,  group: 'core' },
  { id: 'vet-cases',    label: '진료 큐',       href: '/vet/cases',              icon: 'Stethoscope',     roles: ['master','veterinarian'],                                                    order: 40,  group: 'core' },
  { id: 'vet-schedule', label: '왕진 일정',     href: '/vet/schedule',           icon: 'CalendarClock',   roles: ['master','veterinarian'],                                                    order: 45,  group: 'core' },
  { id: 'sensor-cmp',   label: '센서 비교',     href: '/sensor/compare',         icon: 'Activity',        roles: ['master','veterinarian','government_admin'],                                order: 50,  group: 'analytics' },
  { id: 'region-map',   label: '지역 지도',     href: '/regional-map',           icon: 'Map',             roles: ['master','government_admin','quarantine_officer'],                          order: 55,  group: 'analytics' },
  { id: 'epi-dash',     label: '방역 대시보드', href: '/epidemiology/dashboard', icon: 'ShieldAlert',     roles: ['master','government_admin','quarantine_officer'],                          order: 60,  group: 'analytics' },
  { id: 'alerts',       label: '알림 설정',     href: '/notifications',          icon: 'Bell',            roles: ['master','farmer','veterinarian','government_admin','quarantine_officer'], order: 80,  group: 'core' },
  { id: 'subscription', label: '구독 관리',     href: '/subscription',           icon: 'CreditCard',      roles: ['master','farmer'],                                                          order: 85,  group: 'core' },
  { id: 'admin-farms',  label: '목장 관리',     href: '/admin/farms',            icon: 'Building2',       roles: ['master'],                                                                    order: 90,  group: 'admin' },
  { id: 'admin-users',  label: '사용자 관리',   href: '/admin/users',            icon: 'Users',           roles: ['master'],                                                                    order: 95,  group: 'admin' },
  { id: 'admin-system', label: '시스템 상태',   href: '/admin/system',           icon: 'Server',          roles: ['master'],                                                                    order: 100, group: 'admin' },
  { id: 'admin-ai',     label: 'AI 성능',       href: '/ai-performance',         icon: 'Brain',           roles: ['master','government_admin'],                                                order: 105, group: 'admin' },
];

/**
 * 현재 활성 역할 기준 메뉴를 산출한다.
 * @param role - canonical Role(farmer/veterinarian/government_admin/quarantine_officer) 또는 'master'
 * @returns order 오름차순 정렬된 MenuItem 배열
 */
export function getMenuForRole(role: MenuRole): MenuItem[] {
  return SIDEBAR_MENU
    .filter(item => item.roles.includes(role))
    .sort((a, b) => a.order - b.order);
}
