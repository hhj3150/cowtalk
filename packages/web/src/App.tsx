// CowTalk v5.0 — 통합 대시보드 + AI 채팅
// Simple is best: 대시보드 하나 + 관리자 페이지

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@web/stores/auth.store';
import { AppShell } from '@web/components/layout/AppShell';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { ErrorBoundary } from '@web/components/common/ErrorBoundary';
import { ServerWarmupGate } from '@web/components/common/ServerWarmupGate';
import type { Role } from '@cowtalk/shared';

// Lazy-loaded 페이지
const LoginPage = lazy(() => import('@web/pages/auth/LoginPage'));
const OnboardingPage = lazy(() => import('@web/pages/auth/OnboardingPage'));
const UnifiedDashboard = lazy(() => import('@web/pages/dashboard/UnifiedDashboard'));
const DemoModePage = lazy(() => import('@web/pages/demo/DemoModePage'));
const RegionalMapPage = lazy(() => import('@web/pages/regional/RegionalMapPage'));
const CowProfilePage = lazy(() => import('@web/pages/cow/CowProfilePage'));
const MonthlyReportPage = lazy(() => import('@web/pages/report/MonthlyReportPage'));
const NotificationSettingsPage = lazy(() => import('@web/pages/settings/NotificationSettingsPage'));
const RadiusAnalysisPage = lazy(() => import('@web/pages/epidemiology/RadiusAnalysisPage'));
const SpreadSimulationPage = lazy(() => import('@web/pages/epidemiology/SpreadSimulationPage'));
const ContactNetworkPage = lazy(() => import('@web/pages/epidemiology/ContactNetworkPage'));

const HerdGroupPage = lazy(() => import('@web/pages/farm/HerdGroupPage'));
const MyCattlePage = lazy(() => import('@web/pages/farm/MyCattlePage'));
const EarTagScanPage = lazy(() => import('@web/pages/ear-tag/EarTagScanPage'));

// 방역관 전용 페이지
const EpidemiologyDashboard = lazy(() => import('@web/pages/epidemiology/EpidemiologyDashboard'));
const InvestigationWorkflow = lazy(() => import('@web/pages/epidemiology/InvestigationWorkflow'));
const EarlyDetectionMetrics = lazy(() => import('@web/pages/epidemiology/EarlyDetectionMetrics'));
const NationalSituation = lazy(() => import('@web/pages/epidemiology/NationalSituation'));
const CaseDatabase = lazy(() => import('@web/pages/epidemiology/CaseDatabase'));

// 관리자 전용
const FarmManagementPage = lazy(() => import('@web/pages/admin/FarmManagementPage'));
const UserManagementPage = lazy(() => import('@web/pages/admin/UserManagementPage'));
const SystemStatusPage = lazy(() => import('@web/pages/admin/SystemStatusPage'));
const AiPerformancePage = lazy(() => import('@web/pages/intelligence/AiPerformancePage'));
const BreedingCommandPage = lazy(() => import('@web/pages/intelligence/BreedingCommandPage'));
const BreedingKpiPage = lazy(() => import('@web/pages/intelligence/BreedingKpiPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: (failureCount, error) => {
        // 네트워크 에러(ECONNREFUSED 등)는 재시도하지 않음
        if (error instanceof Error && (error.message.includes('fetch') || error.message.includes('network'))) return false;
        return failureCount < 2;
      },
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

// 방역관 역할이면 방역관 전용 대시보드로 리다이렉트
function RoleAwareHome(): React.JSX.Element {
  const role = useAuthStore((s) => s.user?.role);
  if (role === 'quarantine_officer') {
    return <Navigate to="/epidemiology/dashboard" replace />;
  }
  return <UnifiedDashboard />;
}

export function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
    <ServerWarmupGate>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<LoadingSkeleton />}>
          <Routes>
            {/* 공개 */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/demo" element={<DemoModePage />} />

            {/* 인증 필요 */}
            <Route element={<RequireAuth><AppShell /></RequireAuth>}>
              {/* 모든 역할 → 통합 대시보드 (smaXtec 위젯 + AI 채팅) */}
              <Route index element={<RoleAwareHome />} />
              <Route path="/dashboard" element={<UnifiedDashboard />} />
              <Route path="/regional-map" element={<RegionalMapPage />} />
              <Route path="/cow/:id" element={<CowProfilePage />} />
              <Route path="/animals/:id" element={<CowProfilePage />} />
              <Route path="/my-cattle" element={<MyCattlePage />} />
              <Route path="/farm/:farmId/groups" element={<HerdGroupPage />} />
              <Route path="/report/farm/:farmId/monthly" element={<MonthlyReportPage />} />
              <Route path="/scan" element={<EarTagScanPage />} />
              <Route path="/notifications" element={<NotificationSettingsPage />} />
              <Route path="/epidemiology/radius" element={<RadiusAnalysisPage />} />
              <Route path="/epidemiology/simulation" element={<SpreadSimulationPage />} />
              <Route path="/epidemiology/contact-network" element={<ContactNetworkPage />} />

              {/* 방역관 전용 */}
              <Route path="/epidemiology/dashboard" element={<EpidemiologyDashboard />} />
              <Route path="/epidemiology/investigation/:id" element={<InvestigationWorkflow />} />
              <Route path="/epidemiology/investigation/new" element={<InvestigationWorkflow />} />
              <Route path="/epidemiology/metrics" element={<EarlyDetectionMetrics />} />
              <Route path="/epidemiology/national" element={<NationalSituation />} />
              <Route path="/epidemiology/cases" element={<CaseDatabase />} />

              {/* 관리자 전용 */}
              <Route
                path="/farm-management"
                element={<RequireRole roles={['government_admin', 'quarantine_officer']}><FarmManagementPage /></RequireRole>}
              />
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
              <Route path="/breeding" element={<BreedingCommandPage />} />
              <Route path="/breeding/performance" element={<BreedingKpiPage />} />
            </Route>

            {/* 404 → 홈으로 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
    </ServerWarmupGate>
    </ErrorBoundary>
  );
}
