// 앱 쉘 — 56px 아이콘 사이드바 + 헤더 + 콘텐츠 + ChatDrawer

import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { ChatDrawer } from '@web/components/chat/ChatDrawer';
import { DrilldownOverlay } from '@web/components/drilldown/DrilldownOverlay';

export function AppShell(): React.JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="flex h-screen" style={{ background: 'var(--ct-bg)' }}>
      {/* 데스크톱 사이드바 (56px icon-only) */}
      <div className="hidden lg:flex lg:flex-shrink-0" style={{ width: 'var(--ct-sidebar-w)' }}>
        <Sidebar />
      </div>

      {/* 모바일 사이드바 */}
      <MobileNav isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* 메인 콘텐츠 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          onChatClick={() => setChatOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* 글로벌 ChatDrawer */}
      <ChatDrawer isOpen={chatOpen} onClose={() => setChatOpen(false)} />

      {/* 드릴다운 오버레이 */}
      <DrilldownOverlay />
    </div>
  );
}
