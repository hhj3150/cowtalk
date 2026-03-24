// 알림 드로어 패널 — 헤더 벨 클릭 시 열림
// 최근 알림 목록 + 읽음/안읽음 + 알림 설정 링크

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '@web/stores/notification.store';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';

interface NotificationItem {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly severity: string;
  readonly createdAt: string;
  readonly read: boolean;
  readonly animalId?: string;
  readonly farmId?: string;
}

const SEVERITY_ICON: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🟢',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function NotificationDrawer(): React.JSX.Element | null {
  const isOpen = useNotificationStore((s) => s.isDrawerOpen);
  const setDrawerOpen = useNotificationStore((s) => s.setDrawerOpen);
  const navigate = useNavigate();

  const { data } = useQuery<readonly NotificationItem[]>({
    queryKey: ['notifications-recent'],
    queryFn: () => apiGet<readonly NotificationItem[]>('/notifications/recent').catch(() => []),
    staleTime: 30_000,
    enabled: isOpen,
  });

  if (!isOpen) return null;

  const notifications: readonly NotificationItem[] = data ?? [];

  return (
    <>
      {/* 오버레이 */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={() => setDrawerOpen(false)}
      />

      {/* 패널 */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col"
        style={{
          background: 'var(--ct-card)',
          borderLeft: '1px solid var(--ct-border)',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--ct-border)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>🔔 알림</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setDrawerOpen(false); navigate('/notifications'); }}
              className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--ct-primary)' }}
            >
              설정
            </button>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--ct-text-secondary)' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* 알림 목록 */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--ct-text-secondary)' }}>
              <span className="text-3xl mb-2">🔔</span>
              <p className="text-xs">새로운 알림이 없습니다</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--ct-border)' }}>
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    if (n.animalId) navigate(`/cow/${n.animalId}`);
                  }}
                  className="w-full text-left px-4 py-3 transition-colors hover:bg-black/5"
                  style={{ background: n.read ? 'transparent' : 'rgba(59,130,246,0.04)' }}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">{SEVERITY_ICON[n.severity] ?? '🔵'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--ct-text)' }}>
                        {n.title}
                      </p>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--ct-text-secondary)' }}>
                        {n.message}
                      </p>
                      <p className="text-[10px] mt-1" style={{ color: 'var(--ct-text-secondary)', opacity: 0.6 }}>
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: '#3b82f6' }} />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
