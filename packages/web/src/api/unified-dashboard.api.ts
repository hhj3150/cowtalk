// 통합 대시보드 API 클라이언트

import { apiGet, apiPost } from './client';
import type {
  UnifiedDashboardData,
  LiveAlarm,
  DashboardFarmRanking,
  AiBriefing,
  AlertTrendPoint,
  HerdCompositionItem,
  FarmComparisonItem,
  TempTimelineData,
  EventTimelineItem,
  EventLabel,
  CreateEventLabelRequest,
  EventLabelStats,
  VitalMonitorData,
  FarmProfitData,
  FarmProfitEntryInput,
  FarmProfitEntry,
  BreedingPipelineData,
  InseminationRoutePlan,
} from '@cowtalk/shared';

export interface UnifiedDashboardParams {
  readonly farmId?: string;
}

export type { UnifiedDashboardData };

export interface DashboardFarm {
  readonly farmId: string;
  readonly name: string;
  readonly currentHeadCount: number;
}

// farmId/farmIds → 쿼리 문자열 빌더
function farmQuery(farmId?: string, farmIds?: string, extra?: Record<string, string>): string {
  const p = new URLSearchParams();
  if (farmIds) p.set('farmIds', farmIds);
  else if (farmId) p.set('farmId', farmId);
  if (extra) for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function getUnifiedDashboard(
  params?: { farmId?: string; farmIds?: string; role?: string },
): Promise<UnifiedDashboardData> {
  const extra = params?.role ? { role: params.role } : undefined;
  return apiGet<UnifiedDashboardData>(`/unified-dashboard${farmQuery(params?.farmId, params?.farmIds, extra)}`);
}

export function getLiveAlarms(farmId?: string, farmIds?: string): Promise<{ alarms: readonly LiveAlarm[] }> {
  return apiGet<{ alarms: readonly LiveAlarm[] }>(`/unified-dashboard/live-alarms${farmQuery(farmId, farmIds)}`);
}

export function getFarmRanking(farmIds?: string): Promise<{ rankings: readonly DashboardFarmRanking[] }> {
  return apiGet<{ rankings: readonly DashboardFarmRanking[] }>(`/unified-dashboard/farm-ranking${farmQuery(undefined, farmIds)}`);
}

export function getDashboardFarms(): Promise<{ farms: readonly DashboardFarm[]; total: number }> {
  return apiGet<{ farms: readonly DashboardFarm[]; total: number }>('/unified-dashboard/farms');
}

export function fetchAiBriefing(farmId?: string, role?: string, farmIds?: string): Promise<AiBriefing> {
  return apiGet<AiBriefing>(`/unified-dashboard/ai-briefing${farmQuery(farmId, farmIds, role ? { role } : undefined)}`);
}

export function fetchAlertTrend(
  farmId?: string,
  days?: number,
  farmIds?: string,
): Promise<readonly AlertTrendPoint[]> {
  return apiGet<readonly AlertTrendPoint[]>(`/unified-dashboard/alert-trend${farmQuery(farmId, farmIds, days ? { days: String(days) } : undefined)}`);
}

export function fetchHerdComposition(
  farmId?: string,
  farmIds?: string,
): Promise<readonly HerdCompositionItem[]> {
  return apiGet<readonly HerdCompositionItem[]>(`/unified-dashboard/herd-composition${farmQuery(farmId, farmIds)}`);
}

export function fetchFarmComparison(
  farmIds?: string[],
): Promise<readonly FarmComparisonItem[]> {
  const query = farmIds?.length ? `?farmIds=${farmIds.join(',')}` : '';
  return apiGet<readonly FarmComparisonItem[]>(`/unified-dashboard/farm-comparison${query}`);
}

export function fetchTemperatureDistribution(
  farmId?: string,
  farmIds?: string,
): Promise<TempTimelineData> {
  return apiGet<TempTimelineData>(`/unified-dashboard/temperature-distribution${farmQuery(farmId, farmIds)}`);
}

export function fetchEventTimeline(
  farmId?: string,
  hours?: number,
  farmIds?: string,
): Promise<readonly EventTimelineItem[]> {
  return apiGet<readonly EventTimelineItem[]>(`/unified-dashboard/event-timeline${farmQuery(farmId, farmIds, hours ? { hours: String(hours) } : undefined)}`);
}

export function createEventLabel(data: CreateEventLabelRequest): Promise<EventLabel> {
  return apiPost<EventLabel>('/unified-dashboard/event-label', data);
}

export function getEventLabels(eventId: string): Promise<{ labels: readonly EventLabel[] }> {
  return apiGet<{ labels: readonly EventLabel[] }>(`/unified-dashboard/event-label/${eventId}`);
}

export function getEventLabelStats(farmId?: string): Promise<EventLabelStats> {
  const query = farmId ? `?farmId=${farmId}` : '';
  return apiGet<EventLabelStats>(`/unified-dashboard/event-label-stats${query}`);
}

export function fetchVitalMonitor(
  farmId?: string,
  days?: number,
  farmIds?: string,
): Promise<VitalMonitorData> {
  return apiGet<VitalMonitorData>(`/vital-monitor${farmQuery(farmId, farmIds, days ? { days: String(days) } : undefined)}`);
}

// ── 역학 감시 ──

import type { EpidemicIntelligence } from '@web/components/unified-dashboard/EpidemicCommandCenter';
import type { FarmHealthScore } from '@web/components/unified-dashboard/FarmHealthScoreWidget';

export function fetchEpidemicIntelligence(farmIds?: string): Promise<EpidemicIntelligence> {
  return apiGet<EpidemicIntelligence>(`/epidemic-intelligence/intelligence${farmQuery(undefined, farmIds)}`);
}

export function fetchFarmHealthScores(farmIds?: string): Promise<readonly FarmHealthScore[]> {
  return apiGet<readonly FarmHealthScore[]>(`/epidemic-intelligence/farm-health-scores${farmQuery(undefined, farmIds)}`);
}

export interface EpidemicDrilldownAnimal {
  readonly animalId: string;
  readonly earTag: string;
  readonly animalName: string;
  readonly hasFever: boolean;
  readonly hasRuminationDrop: boolean;
  readonly latestDetectedAt: string;
  readonly severity: string;
  readonly eventCount: number;
}

export interface EpidemicDrilldownData {
  readonly farmId: string;
  readonly farmName: string;
  readonly headCount: number;
  readonly feverCount: number;
  readonly comorbidCount: number;
  readonly feverRate: number;
  readonly animals: readonly EpidemicDrilldownAnimal[];
}

export function fetchEpidemicDrilldown(farmId: string): Promise<EpidemicDrilldownData> {
  return apiGet<EpidemicDrilldownData>(`/epidemic-intelligence/drilldown/${farmId}`);
}

// ── 수의사 진료경로 ──

import type { VetRoutePlan } from '@cowtalk/shared';

export function fetchVetRoute(date?: string, farmId?: string): Promise<VetRoutePlan> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (farmId) params.set('farmId', farmId);
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiGet<VetRoutePlan>(`/unified-dashboard/vet-route${query}`);
}

// ── 농장 수익성 ──

export function fetchFarmProfit(farmId?: string, period?: string): Promise<FarmProfitData> {
  const params = new URLSearchParams();
  if (farmId) params.set('farmId', farmId);
  if (period) params.set('period', period);
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiGet<FarmProfitData>(`/unified-dashboard/farm-profit${query}`);
}

export function saveFarmProfitEntry(input: FarmProfitEntryInput): Promise<FarmProfitEntry> {
  return apiPost<FarmProfitEntry>('/unified-dashboard/farm-profit', input);
}

export function fetchFarmProfitEntry(farmId: string, period?: string): Promise<FarmProfitEntry | null> {
  const params = new URLSearchParams();
  params.set('farmId', farmId);
  if (period) params.set('period', period);
  return apiGet<FarmProfitEntry | null>(`/unified-dashboard/farm-profit-entry?${params.toString()}`);
}

// ── 번식성적 커맨드센터 ──

export function fetchBreedingPipeline(farmId?: string): Promise<BreedingPipelineData> {
  const query = farmId ? `?farmId=${farmId}` : '';
  return apiGet<BreedingPipelineData>(`/unified-dashboard/breeding-pipeline${query}`);
}

// ── 인공수정 경로 ──

export function fetchInseminationRoute(date?: string, farmId?: string): Promise<InseminationRoutePlan> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (farmId) params.set('farmId', farmId);
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiGet<InseminationRoutePlan>(`/unified-dashboard/insemination-route${query}`);
}

// ── 건강 알림 현황 ──

export interface HealthAlertItem {
  readonly category: string;
  readonly label: string;
  readonly icon: string;
  readonly count: number;
}

export function fetchHealthAlertsSummary(farmId?: string, farmIds?: string): Promise<readonly HealthAlertItem[]> {
  return apiGet<readonly HealthAlertItem[]>(`/unified-dashboard/health-alerts-summary${farmQuery(farmId, farmIds)}`);
}

// ── 번식 관리 현황 ──

export interface FertilityManagementData {
  readonly herdStatus: readonly { status: string; label: string; icon: string; count: number }[];
  readonly fertilityAlerts: readonly { type: string; label: string; count: number }[];
}

export function fetchFertilityManagement(farmId?: string, farmIds?: string): Promise<FertilityManagementData> {
  return apiGet<FertilityManagementData>(`/unified-dashboard/fertility-management${farmQuery(farmId, farmIds)}`);
}

// ── 동물 센서 차트 데이터 ──

export interface SensorChartPoint {
  readonly ts: number;
  readonly value: number;
}

export interface SensorEventMarker {
  readonly eventId: string;
  readonly eventType: string;
  readonly smaxtecType: string;
  readonly label: string;
  readonly detectedAt: string;
  readonly severity: string;
}

export interface AnimalProfileData {
  readonly breed: string;
  readonly breedType: string;
  readonly sex: string;
  readonly birthDate: string | null;
  readonly parity: number;
  readonly daysInMilk: number | null;
  readonly lactationStatus: string;
  readonly status: string;
  readonly lastCalving: {
    readonly calvingDate: string | null;
    readonly calfSex: string | null;
    readonly calfStatus: string | null;
    readonly complications: string | null;
  } | null;
  readonly calvingHistory: readonly {
    readonly calvingDate: string | null;
    readonly calfSex: string | null;
  }[];
  readonly pregnancy: {
    readonly checkDate: string | null;
    readonly result: string;
    readonly method: string;
    readonly daysPostInsemination: number | null;
  } | null;
  readonly lastBreeding: {
    readonly eventDate: string | null;
    readonly type: string;
    readonly semenInfo: string | null;
  } | null;
}

export interface AnimalSensorChartData {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmName: string;
  readonly period: { readonly from: string; readonly to: string; readonly days: number };
  readonly metrics: Record<string, readonly SensorChartPoint[]>;
  readonly eventMarkers: readonly SensorEventMarker[];
  readonly animalProfile?: AnimalProfileData;
}

export function fetchAnimalSensorChart(
  animalId: string,
  days: number = 7,
): Promise<AnimalSensorChartData> {
  return apiGet<AnimalSensorChartData>(
    `/unified-dashboard/animal/${animalId}/sensor-chart?days=${days}`,
  );
}
