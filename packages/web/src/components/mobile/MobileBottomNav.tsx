// 모바일 하단 네비게이션 — 768px 이하 전용
// 5탭: 홈 | 내소 | 빠른기록(중앙 FAB) | 알림 | 더보기

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@web/stores/auth.store';

interface Props {
  readonly onQuickRecord: () => void;
  readonly onMoreMenu: () => void;
  readonly pendingCount: number;
  readonly onScan?: () => void;
}

export function MobileBottomNav({ onQuickRecord, onMoreMenu, pendingCount, onScan }: Props): React.JSX.Element {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const farmIds = useAuthStore((s) => s.user?.farmIds);
  const primaryFarmId = farmIds?.[0];

  function isActive(path: string) {
    return pathname === path || pathname.startsWith(path + '/');
  }

  const iconClass = (active: boolean) =>
    `flex flex-col items-center gap-0.5 py-2 px-4 rounded-xl transition-colors min-w-[48px] min-h-[44px] ${
      active ? 'text-emerald-400' : 'text-gray-400'
    }`;

  return (
    <nav
      aria-label="모바일 하단 네비게이션"
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden flex items-center justify-around border-t"
      style={{
        background: 'var(--ct-card)',
        borderColor: 'var(--ct-border)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        height: 60,
      }}
    >
      {/* 홈 */}
      <button type="button" aria-label="홈" aria-current={isActive('/') && !isActive('/cow') && !isActive('/farm') ? 'page' : undefined} className={iconClass(isActive('/') && !isActive('/cow') && !isActive('/farm'))} onClick={() => navigate('/')}>
        <IconHome />
        <span className="text-[11px] font-medium">홈</span>
      </button>

      {/* 내소 */}
      <button
        type="button"
        className={iconClass(isActive('/farm'))}
        onClick={() => primaryFarmId ? navigate(`/farm/${primaryFarmId}/groups`) : navigate('/farm')}
      >
        <IconCow />
        <span className="text-[11px] font-medium">내 소</span>
      </button>

      {/* 이표 스캔 (중앙 FAB) */}
      <button
        type="button"
        onClick={onScan ?? (() => navigate('/scan'))}
        className="relative flex flex-col items-center -mt-4"
        aria-label="이표 스캔"
      >
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full shadow-lg text-white"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          <IconScan />
        </span>
        <span className="text-[11px] font-medium mt-0.5 text-emerald-400">스캔</span>
      </button>

      {/* 알림 */}
      <button type="button" aria-label="알림" aria-current={isActive('/notifications') ? 'page' : undefined} className={iconClass(isActive('/notifications'))} onClick={() => navigate('/notifications')}>
        <IconBell />
        <span className="text-[11px] font-medium">알림</span>
      </button>

      {/* 더보기 */}
      <button type="button" aria-label="더보기 메뉴" className={iconClass(false)} onClick={onMoreMenu}>
        <IconMore />
        <span className="text-[11px] font-medium">더보기</span>
      </button>
    </nav>
  );
}

// ── 아이콘 ──

function IconHome() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

function IconCow() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="13" rx="7" ry="5" />
      <path d="M5 10c-1-2-2-4-1-6M19 10c1-2 2-4 1-6" />
      <path d="M9 18v2M15 18v2" />
      <circle cx="9.5" cy="12" r="0.5" fill="currentColor" />
      <circle cx="14.5" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function IconScan() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}
