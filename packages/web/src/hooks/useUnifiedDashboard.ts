// 통합 대시보드 훅 — React Query 기반

import { useQuery } from '@tanstack/react-query';
import { useFarmStore } from '@web/stores/farm.store';
import * as unifiedDashboardApi from '@web/api/unified-dashboard.api';
import type { UnifiedDashboardParams } from '@web/api/unified-dashboard.api';

const STALE_TIME = 5 * 60 * 1000; // 5분
const ALARM_STALE_TIME = 60 * 1000; // 1분 (알람은 더 자주 갱신)

export function useUnifiedDashboard(period?: UnifiedDashboardParams['period']) {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  return useQuery({
    queryKey: ['unified-dashboard', selectedFarmId, period],
    queryFn: () =>
      unifiedDashboardApi.getUnifiedDashboard({
        farmId: selectedFarmId ?? undefined,
        period,
      }),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
    refetchIntervalInBackground: false,
  });
}

export function useLiveAlarms() {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  return useQuery({
    queryKey: ['live-alarms', selectedFarmId],
    queryFn: () =>
      unifiedDashboardApi.getLiveAlarms(selectedFarmId ?? undefined),
    staleTime: ALARM_STALE_TIME,
    refetchInterval: ALARM_STALE_TIME,
  });
}

export function useFarmRanking() {
  return useQuery({
    queryKey: ['farm-ranking'],
    queryFn: () => unifiedDashboardApi.getFarmRanking(),
    staleTime: ALARM_STALE_TIME,
    refetchInterval: ALARM_STALE_TIME,
  });
}
