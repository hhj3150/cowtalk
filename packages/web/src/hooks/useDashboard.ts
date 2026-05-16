// 대시보드 훅 — 역할별 자동 분기

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@web/stores/auth.store';
import { useEffectiveRole } from '@web/hooks/useEffectiveRole';
import { useFarmStore } from '@web/stores/farm.store';
import * as dashboardApi from '@web/api/dashboard.api';

const STALE_TIME = 5 * 60 * 1000; // 5분

function useDashboardParams(): Record<string, string | undefined> {
  const user = useAuthStore((s) => s.user);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  // FLOW-02 Step2.5: 역할별 분기는 유효 역할(시뮬레이션 반영). farmIds/tenantId 는 본 계정 user 사용.
  const role = useEffectiveRole();

  switch (role) {
    case 'farmer':
      return { farmId: selectedFarmId ?? user?.farmIds[0] };
    case 'veterinarian':
      return { tenantId: user?.tenantId ?? undefined };
    case 'government_admin':
    case 'quarantine_officer':
      return { regionId: undefined }; // 서버에서 사용자 기반으로 결정
    default:
      return {};
  }
}

export function useDashboard() {
  const params = useDashboardParams();

  return useQuery({
    queryKey: ['dashboard', params],
    queryFn: () => dashboardApi.getDashboard(params),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
    refetchIntervalInBackground: false,
  });
}

export function useDashboardKpis() {
  const params = useDashboardParams();

  return useQuery({
    queryKey: ['dashboard', 'kpi', params],
    queryFn: () => dashboardApi.getDashboardKpis(params),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}
