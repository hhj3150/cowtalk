// 헤더 — 아바타 + 이름 + MASTER 배지 + 농장 선택 + 검색바 + Live 시각

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@web/stores/auth.store';
import { useNotificationStore } from '@web/stores/notification.store';
import { useAutoRefresh } from '@web/hooks/useAutoRefresh';
import { useAuth } from '@web/hooks/useAuth';
import { SearchBar } from '@web/components/search/SearchBar';

interface Props {
  readonly onMenuClick: () => void;
  readonly onChatClick: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  farmer: '농가주',
  veterinarian: '수의사',
  inseminator: '수정사',
  government_admin: 'MASTER',
  quarantine_officer: '방역관',
  feed_company: '사료회사',
};

function LiveClock(): React.JSX.Element {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = time.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <div className="hidden items-center gap-1.5 sm:flex" style={{ color: 'var(--ct-text-secondary)' }}>
      <span className="live-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--ct-success)' }} />
      <span className="text-xs font-medium">Live</span>
      <span className="text-xs tabular-nums">{timeStr}</span>
    </div>
  );
}

export function Header({ onMenuClick, onChatClick }: Props): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const toggleNotificationDrawer = useNotificationStore((s) => s.toggleDrawer);
  const { lastUpdated: _lastUpdated, refresh: _refresh } = useAutoRefresh();
  const { logout } = useAuth();

  const roleLabel = ROLE_LABELS[user?.role ?? 'farmer'] ?? '사용자';
  const isMaster = user?.role === 'government_admin';
  const initials = (user?.name ?? 'U').slice(0, 1).toUpperCase();

  return (
    <header
      className="flex h-14 items-center justify-between border-b px-4 lg:px-5"
      style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
    >
      {/* 좌측: 햄버거 + 사용자 프로필 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md p-1.5 lg:hidden"
          style={{ color: 'var(--ct-text-secondary)' }}
          aria-label="메뉴 열기"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* 아바타 */}
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: 'var(--ct-primary)' }}
        >
          {initials}
        </div>

        {/* 이름 + 역할 배지 */}
        <div className="hidden sm:block">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
              {user?.name}
            </span>
            {isMaster ? (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                style={{ background: 'var(--ct-primary)' }}
              >
                MASTER
              </span>
            ) : (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: 'var(--ct-primary-light)', color: 'var(--ct-primary)' }}
              >
                {roleLabel}
              </span>
            )}
          </div>
          <p className="text-[11px]" style={{ color: 'var(--ct-text-secondary)' }}>
            {user?.tenantName ?? ''}
          </p>
        </div>
      </div>

      {/* 중앙: 검색 */}
      <div className="hidden flex-1 justify-center px-6 md:flex">
        <div className="w-full max-w-md">
          <SearchBar />
        </div>
      </div>

      {/* 우측: Live 시각 + 알림 + 채팅 + 로그아웃 */}
      <div className="flex items-center gap-2">
        <LiveClock />

        {/* AI 채팅 */}
        <button
          type="button"
          onClick={onChatClick}
          className="rounded-lg p-2 transition-colors hover:bg-[#F0F0EE]"
          style={{ color: 'var(--ct-text-secondary)' }}
          aria-label="AI 채팅"
        >
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
          </svg>
        </button>

        {/* 알림 벨 */}
        <button
          type="button"
          onClick={toggleNotificationDrawer}
          className="relative rounded-lg p-2 transition-colors hover:bg-[#F0F0EE]"
          style={{ color: 'var(--ct-text-secondary)' }}
          aria-label="알림"
        >
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
              style={{ background: 'var(--ct-danger)' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* 로그아웃 */}
        <button
          type="button"
          onClick={logout}
          className="rounded-lg p-2 transition-colors hover:bg-[#F0F0EE]"
          style={{ color: 'var(--ct-text-secondary)' }}
          aria-label="로그아웃"
        >
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
        </button>
      </div>
    </header>
  );
}
