// 사이드바 — 아이콘 전용 56px, hover 시 200px 확장 + 메뉴명 표시

import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@web/stores/auth.store';
import type { Role } from '@cowtalk/shared';

interface MenuItem {
  readonly label: string;
  readonly path: string;
  readonly icon: React.ReactNode;
}

function IconDashboard(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25a2.25 2.25 0 01-2.25-2.25v-2.25z" />
    </svg>
  );
}

function IconMap(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  );
}

function IconSettings(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconUsers(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function IconAi(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function IconServer(): React.JSX.Element {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  );
}

// 공통 메뉴 — 모든 역할 동일 (simple is best)
const COMMON_MENU: readonly MenuItem[] = [
  { label: '대시보드', path: '/', icon: <IconDashboard /> },
  { label: '지역 지도', path: '/regional-map', icon: <IconMap /> },
  { label: '알림 설정', path: '/notifications', icon: <IconSettings /> },
];

// 관리자 전용 추가 메뉴
const ADMIN_EXTRA: readonly MenuItem[] = [
  { label: '사용자 관리', path: '/admin/users', icon: <IconUsers /> },
  { label: '시스템 상태', path: '/admin/system', icon: <IconServer /> },
  { label: 'AI 성능', path: '/ai-performance', icon: <IconAi /> },
];

const MENU_BY_ROLE: Record<Role, readonly MenuItem[]> = {
  farmer: COMMON_MENU,
  veterinarian: COMMON_MENU,
  inseminator: COMMON_MENU,
  government_admin: [...COMMON_MENU, ...ADMIN_EXTRA],
  quarantine_officer: COMMON_MENU,
  feed_company: COMMON_MENU,
};

export function Sidebar(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'farmer';
  const items = MENU_BY_ROLE[role];

  return (
    <nav
      className="flex h-full flex-col border-r py-3"
      style={{
        width: 56,
        background: 'var(--ct-card)',
        borderColor: 'var(--ct-border)',
      }}
    >
      {/* 로고 */}
      <div className="group relative mb-4 flex items-center justify-center px-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
          style={{ background: 'var(--ct-primary)' }}
        >
          CT
        </div>
        <span
          className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold shadow-lg group-hover:block"
          style={{
            background: 'var(--ct-text)',
            color: 'var(--ct-bg)',
            zIndex: 100,
          }}
        >
          CowTalk
          <span
            className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent"
            style={{ borderRightColor: 'var(--ct-text)' }}
          />
        </span>
      </div>

      {/* 메뉴 */}
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-2">
        {items.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `group relative flex h-10 items-center justify-center rounded-lg transition-all ${
                isActive ? 'font-medium' : ''
              }`
            }
            style={({ isActive }) =>
              isActive
                ? { background: 'var(--ct-sidebar-highlight)', color: 'var(--ct-primary)' }
                : { color: 'var(--ct-text-secondary)' }
            }
          >
            {item.icon}
            <span
              className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium shadow-lg group-hover:block"
              style={{
                background: 'var(--ct-text)',
                color: 'var(--ct-bg)',
                zIndex: 100,
              }}
            >
              {item.label}
              <span
                className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent"
                style={{ borderRightColor: 'var(--ct-text)' }}
              />
            </span>
          </NavLink>
        ))}
      </div>

      {/* 하단 데모 링크 */}
      <NavLink
        to="/demo"
        className="group relative mt-2 mx-2 flex h-10 items-center justify-center rounded-lg transition-colors"
        style={{ color: 'var(--ct-text-secondary)' }}
      >
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
        </svg>
        <span
          className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium shadow-lg group-hover:block"
          style={{
            background: 'var(--ct-text)',
            color: 'var(--ct-bg)',
            zIndex: 100,
          }}
        >
          데모 모드
          <span
            className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent"
            style={{ borderRightColor: 'var(--ct-text)' }}
          />
        </span>
      </NavLink>
    </nav>
  );
}
