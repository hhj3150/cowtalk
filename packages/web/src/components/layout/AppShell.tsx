// 앱 쉘 — 56px 아이콘 사이드바 + 헤더 + 콘텐츠 + ChatDrawer
// 모바일: 하단 네비게이션 + 빠른 기록 FAB

import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { MobileBottomNav } from '@web/components/mobile/MobileBottomNav';
import { QuickRecordSheet } from '@web/components/mobile/QuickRecordSheet';
import { ChatDrawer } from '@web/components/chat/ChatDrawer';
import { DrilldownOverlay } from '@web/components/drilldown/DrilldownOverlay';
import { OfflineBanner } from '@web/components/common/OfflineBanner';
import { SkipNavLink } from '@web/components/common/SkipNavLink';
import { countPending } from '@web/lib/offline-queue';

export function AppShell(): React.JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [quickRecordOpen, setQuickRecordOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // 오프라인 대기 기록 수 동기화
  useEffect(() => {
    const refresh = async () => {
      const n = await countPending();
      setPendingCount(n);
    };
    void refresh();

    window.addEventListener('offline-queue-updated', refresh);
    return () => window.removeEventListener('offline-queue-updated', refresh);
  }, []);

  function handleQueued() {
    setPendingCount((n) => n + 1);
    window.dispatchEvent(new CustomEvent('offline-queue-updated'));
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: 'var(--ct-bg)' }}>
      <SkipNavLink />
      <OfflineBanner />
      <div className="flex flex-1 overflow-hidden">
        {/* 데스크톱 사이드바 (56px icon-only) */}
        <div className="hidden lg:flex lg:flex-shrink-0" style={{ width: 'var(--ct-sidebar-w)' }}>
          <Sidebar />
        </div>

        {/* 모바일 사이드바 오버레이 (더보기 탭 클릭 시) */}
        <MobileNav isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* 메인 콘텐츠 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header
            onMenuClick={() => setSidebarOpen(true)}
            onChatClick={() => setChatOpen(true)}
          />

          {/* 모바일에서 하단 네비 높이(60px) + safe area 만큼 패딩 */}
          <main
            id="main-content"
            role="main"
            className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6"
          >
            <Outlet />
          </main>
        </div>

        {/* 글로벌 ChatDrawer */}
        <ChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />

        {/* 드릴다운 오버레이 */}
        <DrilldownOverlay />
      </div>

      {/* 모바일 하단 네비게이션 */}
      <MobileBottomNav
        onQuickRecord={() => setQuickRecordOpen(true)}
        onMoreMenu={() => setSidebarOpen(true)}
        pendingCount={pendingCount}
      />

      {/* 빠른 기록 바텀시트 */}
      <QuickRecordSheet
        isOpen={quickRecordOpen}
        onClose={() => setQuickRecordOpen(false)}
        onQueued={handleQueued}
      />
    </div>
  );
}
