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

export function useUnifiedDashboard() {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const selectedFarmIds = useFarmStore((s) => s.selectedFarmIds);

  return useQuery({
    queryKey: ['unified-dashboard', selectedFarmId, selectedFarmIds],
    queryFn: () => api.getUnifiedDashboard({
      farmId: selectedFarmId ?? undefined,
      farmIds: selectedFarmIds.length > 0 ? selectedFarmIds : undefined,
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
    queryFn: async () => {
      const result = await api.getLiveAlarms(selectedFarmId ?? undefined);
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
    refetchInterval: ALARM_STALE_TIME,
  });
}

export function useFarmRanking() {
  return useQuery({
    queryKey: ['farm-ranking'],
    queryFn: () => api.getFarmRanking(),
    staleTime: ALARM_STALE_TIME,
    refetchInterval: ALARM_STALE_TIME,
  });
}

export function useHealthAlertsSummary() {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  return useQuery({
    queryKey: ['health-alerts-summary', selectedFarmId],
    queryFn: () => api.fetchHealthAlertsSummary(selectedFarmId ?? undefined),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}

export function useFertilityManagement() {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  return useQuery({
    queryKey: ['fertility-management', selectedFarmId],
    queryFn: () => api.fetchFertilityManagement(selectedFarmId ?? undefined),
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
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const role = useAuthStore((s) => s.user?.role ?? 'government_admin');

  return useQuery({
    queryKey: ['ai-briefing', selectedFarmId, role],
    queryFn: () => api.fetchAiBriefing(selectedFarmId ?? undefined, role),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}

export function useAlertTrend(days = 14) {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  return useQuery({
    queryKey: ['alert-trend', selectedFarmId, days],
    queryFn: () => api.fetchAlertTrend(selectedFarmId ?? undefined, days),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
  });
}

export function useHerdComposition() {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  return useQuery({
    queryKey: ['herd-composition', selectedFarmId],
    queryFn: () => api.fetchHerdComposition(selectedFarmId ?? undefined),
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
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  return useQuery({
    queryKey: ['temperature-distribution', selectedFarmId],
    queryFn: () => api.fetchTemperatureDistribution(selectedFarmId ?? undefined),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
  });
}

export function useEventTimeline(hours = 24) {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  return useQuery({
    queryKey: ['event-timeline', selectedFarmId, hours],
    queryFn: () => api.fetchEventTimeline(selectedFarmId ?? undefined, hours),
    staleTime: ALARM_STALE_TIME,
    refetchInterval: ALARM_STALE_TIME,
  });
}

export function useVitalMonitor(days = 30) {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  return useQuery({
    queryKey: ['vital-monitor', selectedFarmId, days],
    queryFn: () => api.fetchVitalMonitor(selectedFarmId ?? undefined, days),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
  });
}

export function useFarmMapMarkers() {
  return useQuery({
    queryKey: ['farm-map-markers'],
    queryFn: () => getRegionalMapData({ mode: 'status' }),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}

// ── 역학 감시 ──

export function useEpidemicIntelligence() {
  return useQuery({
    queryKey: ['epidemic-intelligence'],
    queryFn: () => api.fetchEpidemicIntelligence(),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useFarmHealthScores() {
  return useQuery({
    queryKey: ['farm-health-scores'],
    queryFn: () => api.fetchFarmHealthScores(),
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
