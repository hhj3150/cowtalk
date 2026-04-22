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
      const rawAlarms = result?.alarms ?? [];
      // 프론트엔드 안전장치: 같은 농장+귀표번호+이벤트타입 중복 제거
      const seen = new Set<string>();
      const deduped = rawAlarms.filter((a) => {
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

// 지연 로드 지원 — dashboard에서 enabled=deferredReady로 크리티컬 경로 후 순차화
interface DeferOpt { readonly enabled?: boolean }

export function useFarmRanking(opt?: DeferOpt) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();
  return useQuery({
    queryKey: ['farm-ranking', ...queryKey],
    queryFn: () => api.getFarmRanking(farmId, farmIds),
    staleTime: ALARM_STALE_TIME,
    refetchInterval: ALARM_STALE_TIME,
    enabled: opt?.enabled ?? true,
  });
}

export function useHealthAlertsSummary(opt?: DeferOpt) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();
  return useQuery({
    queryKey: ['health-alerts-summary', ...queryKey],
    queryFn: () => api.fetchHealthAlertsSummary(farmId, farmIds),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
    enabled: opt?.enabled ?? true,
  });
}

export function useFertilityManagement(opt?: DeferOpt) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();
  return useQuery({
    queryKey: ['fertility-management', ...queryKey],
    queryFn: () => api.fetchFertilityManagement(farmId, farmIds),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
    enabled: opt?.enabled ?? true,
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

export function useAiBriefing(opt?: DeferOpt) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();
  const role = useAuthStore((s) => s.user?.role ?? 'government_admin');

  return useQuery({
    queryKey: ['ai-briefing', ...queryKey, role],
    queryFn: () => api.fetchAiBriefing(farmId, role, farmIds),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
    enabled: opt?.enabled ?? true,
  });
}

export function useAlertTrend(days = 14, opt?: DeferOpt) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();

  return useQuery({
    queryKey: ['alert-trend', ...queryKey, days],
    queryFn: () => api.fetchAlertTrend(farmId, days, farmIds),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
    enabled: opt?.enabled ?? true,
  });
}

export function useHerdComposition(opt?: DeferOpt) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();

  return useQuery({
    queryKey: ['herd-composition', ...queryKey],
    queryFn: () => api.fetchHerdComposition(farmId, farmIds),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
    enabled: opt?.enabled ?? true,
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

export function useTemperatureDistribution(opt?: DeferOpt) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();

  return useQuery({
    queryKey: ['temperature-distribution', ...queryKey],
    queryFn: () => api.fetchTemperatureDistribution(farmId, farmIds),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
    enabled: opt?.enabled ?? true,
  });
}

export function useEventTimeline(hours = 24, opt?: DeferOpt) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();

  return useQuery({
    queryKey: ['event-timeline', ...queryKey, hours],
    queryFn: () => api.fetchEventTimeline(farmId, hours, farmIds),
    staleTime: ALARM_STALE_TIME,
    refetchInterval: ALARM_STALE_TIME,
    enabled: opt?.enabled ?? true,
  });
}

export function useVitalMonitor(days = 30, opt?: DeferOpt) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();

  return useQuery({
    queryKey: ['vital-monitor', ...queryKey, days],
    queryFn: () => api.fetchVitalMonitor(farmId, days, farmIds),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
    enabled: opt?.enabled ?? true,
  });
}

export function useFarmMapMarkers(opt?: DeferOpt) {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const selectedFarmIds = useFarmStore((s) => s.selectedFarmIds);

  return useQuery({
    queryKey: ['farm-map-markers', selectedFarmId, selectedFarmIds],
    queryFn: async () => {
      const data = await getRegionalMapData({ mode: 'status' });
      // 개별 농장 선택 시 해당 농장만 표시
      if (selectedFarmId && data.markers) {
        return {
          ...data,
          markers: data.markers.filter((m: { farmId?: string }) => m.farmId === selectedFarmId),
        };
      }
      // 그룹 선택 시 해당 농장들만 표시
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
    enabled: opt?.enabled ?? true,
  });
}

// ── 역학 감시 ──

export function useEpidemicIntelligence(opt?: DeferOpt) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();
  return useQuery({
    queryKey: ['epidemic-intelligence', ...queryKey],
    queryFn: () => api.fetchEpidemicIntelligence(farmId, farmIds),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    enabled: opt?.enabled ?? true,
  });
}

export function useFarmHealthScores(opt?: DeferOpt) {
  const { farmId, farmIds, queryKey } = useEffectiveFarmId();
  return useQuery({
    queryKey: ['farm-health-scores', ...queryKey],
    queryFn: () => api.fetchFarmHealthScores(farmId, farmIds),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    enabled: opt?.enabled ?? true,
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

export function useBreedingPipeline(opt?: DeferOpt) {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  return useQuery({
    queryKey: ['breeding-pipeline', selectedFarmId],
    queryFn: () => api.fetchBreedingPipeline(selectedFarmId ?? undefined),
    staleTime: CHART_STALE_TIME,
    refetchInterval: CHART_STALE_TIME,
    enabled: opt?.enabled ?? true,
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

// ── 소버린 AI 알람 ──

import { getSovereignAlarms } from '@web/api/unified-dashboard.api';

export function useSovereignAlarms(farmId: string | null, opt?: DeferOpt) {
  return useQuery({
    queryKey: ['sovereign-alarms', farmId],
    queryFn: () => getSovereignAlarms(farmId!, 30),
    enabled: !!farmId && (opt?.enabled ?? true),
    staleTime: 5 * 60_000, // 5분 캐시
    retry: 1,
  });
}

// ── 소버린 AI 지식 강화 ──

import { getSovereignStats } from '@web/api/label-chat.api';

export function useSovereignAiStats(opt?: DeferOpt) {
  return useQuery({
    queryKey: ['sovereign-ai-stats'],
    queryFn: () => getSovereignStats(),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    enabled: opt?.enabled ?? true,
  });
}
