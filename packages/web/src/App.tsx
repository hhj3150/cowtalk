// CowTalk v5.0 — 통합 대시보드 + AI 채팅
// Simple is best: 대시보드 하나 + 관리자 페이지

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@web/stores/auth.store';
import { AppShell } from '@web/components/layout/AppShell';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import type { Role } from '@cowtalk/shared';

// Lazy-loaded 페이지
const LoginPage = lazy(() => import('@web/pages/auth/LoginPage'));
const UnifiedDashboard = lazy(() => import('@web/pages/dashboard/UnifiedDashboard'));
const DemoModePage = lazy(() => import('@web/pages/demo/DemoModePage'));
const RegionalMapPage = lazy(() => import('@web/pages/regional/RegionalMapPage'));
const NotificationSettingsPage = lazy(() => import('@web/pages/settings/NotificationSettingsPage'));

// 관리자 전용
const UserManagementPage = lazy(() => import('@web/pages/admin/UserManagementPage'));
const SystemStatusPage = lazy(() => import('@web/pages/admin/SystemStatusPage'));
const AiPerformancePage = lazy(() => import('@web/pages/intelligence/AiPerformancePage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }): React.JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: readonly Role[]; children: React.ReactNode }): React.JSX.Element {
  const role = useAuthStore((s) => s.user?.role);
  if (!role || !roles.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<LoadingSkeleton />}>
          <Routes>
            {/* 공개 */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/demo" element={<DemoModePage />} />

            {/* 인증 필요 */}
            <Route element={<RequireAuth><AppShell /></RequireAuth>}>
              {/* 모든 역할 → 통합 대시보드 (smaXtec 위젯 + AI 채팅) */}
              <Route index element={<UnifiedDashboard />} />
              <Route path="/regional-map" element={<RegionalMapPage />} />
              <Route path="/notifications" element={<NotificationSettingsPage />} />

              {/* 관리자 전용 */}
              <Route
                path="/admin/users"
                element={<RequireRole roles={['government_admin']}><UserManagementPage /></RequireRole>}
              />
              <Route
                path="/admin/system"
                element={<RequireRole roles={['government_admin']}><SystemStatusPage /></RequireRole>}
              />
              <Route
                path="/ai-performance"
                element={<RequireRole roles={['government_admin', 'veterinarian']}><AiPerformancePage /></RequireRole>}
              />
            </Route>

            {/* 404 → 홈으로 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
