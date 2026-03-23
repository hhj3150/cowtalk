// 통합 대시보드 훅 — React Query 기반

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFarmStore } from '@web/stores/farm.store';
import { useAuthStore } from '@web/stores/auth.store';
import * as api from '@web/api/unified-dashboard.api';
import type { FarmProfitEntryInput } from '@cowtalk/shared';
import { getRegionalMapData } from '@web/api/regional.api';

const STALE_TIME = 5 * 60 * 1000;
const ALARM_STALE_TIME = 60 * 1000;
const CHART_STALE_TIME = 3 * 60 * 1000;

// 다중 농장 그룹 지원: farmIds가 있으면 farmIds 파라미터로 전달
function useEffectiveFarmId(): { farmId: string | undefined; farmIds: string | undefined; queryKey: unknown[] } {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const selectedFarmIds = useFarmStore((s) => s.selectedFarmIds);

  if (selectedFarmIds.length > 0) {
    const joined = selectedFarmIds.join(',');
    return { farmId: undefined, farmIds: joined, queryKey: ['group', joined] };
  }
  return { farmId: selectedFarmId ?? undefined, farmIds: undefined, queryKey: [selectedFarmId] };
}


export function useUnifiedDashboard() {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();
  const role = useAuthStore((s) => s.user?.role ?? 'government_admin');

  return useQuery({
    queryKey: ['unified-dashboard', ...queryKey, role],
    queryFn: () => api.getUnifiedDashboard({ farmId, farmIds, role }),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
    refetchIntervalInBackground: false,
  });
}

export function useLiveAlarms() {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();

  return useQuery({
    queryKey: ['live-alarms', ...queryKey],
    queryFn: async () => {
      const result = await api.getLiveAlarms(farmId, farmIds);
      // 프론트엔드 안전장치: 같은 농장+귀표번호+이벤트타입 중복 제거
      const seen = new Set<string>();
      const deduped = result.alarms.filter((a) => {
        const key = `${a.farmId}-${a.earTag}-${a.eventType}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { alarms: deduped };
    },
    staleTime: ALARM_STALE_TIME,
    // WebSocket 연결 시에도 fallback polling 유지 (60초)
    refetchInterval: ALARM_STALE_TIME,
  });
}

export function useFarmRanking() {
  const { farmIds, queryKey } = useEffectiveFarmId();
  return useQuery({
    queryKey: ['farm-ranking', ...queryKey],
    queryFn: () => api.getFarmRanking(farmIds),
    staleTime: ALARM_STALE_TIME,
    refetchInterval: ALARM_STALE_TIME,
  });
}

export function useHealthAlertsSummary() {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();
  return useQuery({
    queryKey: ['health-alerts-summary', ...queryKey],
    queryFn: () => api.fetchHealthAlertsSummary(farmId, farmIds),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}

export function useFertilityManagement() {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();
  return useQuery({
    queryKey: ['fertility-management', ...queryKey],
    queryFn: () => api.fetchFertilityManagement(farmId, farmIds),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}

export function useDashboardFarms() {
  return useQuery({
    queryKey: ['dashboard-farms'],
    queryFn: () => api.getDashboardFarms(),
    staleTime: 10 * 60 * 1000,
  });
}

// ── Phase 2: 강화 차트 훅 ──

export function useAiBriefing() {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();
  const role = useAuthStore((s) => s.user?.role ?? 'government_admin');

  return useQuery({
    queryKey: ['ai-briefing', ...queryKey, role],
    queryFn: () => api.fetchAiBriefing(farmId, role, farmIds),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}

export function useAlertTrend(days = 14) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();

  return useQuery({
    queryKey: ['alert-trend', ...queryKey, days],
    queryFn: () => api.fetchAlertTrend(farmId, days, farmIds),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
  });
}

export function useHerdComposition() {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();

  return useQuery({
    queryKey: ['herd-composition', ...queryKey],
    queryFn: () => api.fetchHerdComposition(farmId, farmIds),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
  });
}

export function useFarmComparison(farmIds?: string[]) {
  return useQuery({
    queryKey: ['farm-comparison', farmIds],
    queryFn: () => api.fetchFarmComparison(farmIds),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
  });
}

export function useTemperatureDistribution() {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();

  return useQuery({
    queryKey: ['temperature-distribution', ...queryKey],
    queryFn: () => api.fetchTemperatureDistribution(farmId, farmIds),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
  });
}

export function useEventTimeline(hours = 24) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();

  return useQuery({
    queryKey: ['event-timeline', ...queryKey, hours],
    queryFn: () => api.fetchEventTimeline(farmId, hours, farmIds),
    staleTime: ALARM_STALE_TIME,
    refetchInterval: ALARM_STALE_TIME,
  });
}

export function useVitalMonitor(days = 30) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();

  return useQuery({
    queryKey: ['vital-monitor', ...queryKey, days],
    queryFn: () => api.fetchVitalMonitor(farmId, days, farmIds),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
  });
}

export function useFarmMapMarkers() {
  const selectedFarmIds = useFarmStore((s) => s.selectedFarmIds);

  return useQuery({
    queryKey: ['farm-map-markers', selectedFarmIds],
    queryFn: async () => {
      const data = await getRegionalMapData({ mode: 'status' });
      // 농장 그룹 선택 시 해당 농장만 필터링
      if (selectedFarmIds.length > 0 && data.markers) {
        const idSet = new Set(selectedFarmIds);
        return {
          ...data,
          markers: data.markers.filter((m: { farmId?: string }) => m.farmId && idSet.has(m.farmId)),
        };
      }
      return data;
    },
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}

// ── 역학 감시 ──

export function useEpidemicIntelligence() {
  const { farmIds, queryKey } = useEffectiveFarmId();
  return useQuery({
    queryKey: ['epidemic-intelligence', ...queryKey],
    queryFn: () => api.fetchEpidemicIntelligence(farmIds),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useFarmHealthScores() {
  const { farmIds, queryKey } = useEffectiveFarmId();
  return useQuery({
    queryKey: ['farm-health-scores', ...queryKey],
    queryFn: () => api.fetchFarmHealthScores(farmIds),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}

// ── 수의사 진료경로 ──

export function useVetRoute(date?: string) {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  return useQuery({
    queryKey: ['vet-route', date, selectedFarmId],
    queryFn: () => api.fetchVetRoute(date, selectedFarmId ?? undefined),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}

// ── 농장 수익성 ──

export function useFarmProfit() {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  return useQuery({
    queryKey: ['farm-profit', selectedFarmId],
    queryFn: () => api.fetchFarmProfit(selectedFarmId ?? undefined),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}

export function useFarmProfitEntry(farmId: string | null, period?: string) {
  return useQuery({
    queryKey: ['farm-profit-entry', farmId, period],
    queryFn: () => farmId ? api.fetchFarmProfitEntry(farmId, period) : null,
    enabled: !!farmId,
    staleTime: STALE_TIME,
  });
}

export function useSaveFarmProfit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: FarmProfitEntryInput) => api.saveFarmProfitEntry(input),
    onSuccess: (_data, variables) => {
      // 수익성 데이터 캐시 무효화 → 즉시 새 데이터 반영
      void queryClient.invalidateQueries({ queryKey: ['farm-profit'] });
      void queryClient.invalidateQueries({ queryKey: ['farm-profit-entry', variables.farmId] });
    },
  });
}

// ── 번식성적 커맨드센터 ──

export function useBreedingPipeline() {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  return useQuery({
    queryKey: ['breeding-pipeline', selectedFarmId],
    queryFn: () => api.fetchBreedingPipeline(selectedFarmId ?? undefined),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
  });
}

// ── 인공수정 경로 ──

export function useInseminationRoute(date?: string) {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  return useQuery({
    queryKey: ['insemination-route', date, selectedFarmId],
    queryFn: () => api.fetchInseminationRoute(date, selectedFarmId ?? undefined),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}

// ── 소버린 AI 지식 강화 ──

import { getSovereignStats } from '@web/api/label-chat.api';

export function useSovereignAiStats() {
  return useQuery({
    queryKey: ['sovereign-ai-stats'],
    queryFn: () => getSovereignStats(),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}
