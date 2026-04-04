// 전염병 조기경보 API 클라이언트

import { apiGet, apiPost } from './client';
import type { EpidemicAlertLevel } from '@cowtalk/shared';

// ======================================================================
// 타입
// ======================================================================

export interface EpidemicDashboardResponse {
  readonly currentLevel: EpidemicAlertLevel;
  readonly activeWarnings: number;
  readonly activeClusters: number;
  readonly newClustersLast24h: number;
  readonly resolvedLast7d: number;
  readonly dailySnapshots: readonly DailySnapshot[];
}

export interface DailySnapshot {
  readonly date: string;
  readonly clusterCount: number;
  readonly warningLevel: string;
  readonly totalHealthEvents: number;
  readonly totalAffectedFarms: number;
}

export interface ClusterResponse {
  readonly clusterId: string;
  readonly diseaseType: string;
  readonly center: { readonly lat: number; readonly lng: number };
  readonly radiusKm: number;
  readonly level: string;
  readonly status: string;
  readonly farmCount: number;
  readonly eventCount: number;
  readonly spreadRateFarmsPerDay: number;
  readonly spreadTrend: string;
  readonly firstDetectedAt: string;
  readonly lastUpdatedAt: string;
  readonly farms: readonly ClusterFarmResponse[];
}

export interface ClusterFarmResponse {
  readonly farmId: string;
  readonly farmName: string;
  readonly coordinates: { readonly lat: number | null; readonly lng: number | null };
  readonly eventCount: number;
  readonly latestEventAt: string;
}

export interface WarningResponse {
  readonly warningId: string;
  readonly clusterId: string;
  readonly level: string;
  readonly scope: string;
  readonly status: string;
  readonly aiInterpretation: unknown;
  readonly createdAt: string;
}

export interface RiskMapResponse {
  readonly currentLevel: EpidemicAlertLevel;
  readonly activeClusters: number;
  readonly riskMap: readonly FarmRiskResponse[];
  readonly farms: readonly FarmCoordResponse[];
}

export interface FarmRiskResponse {
  readonly farmId: string;
  readonly farmName: string;
  readonly coordinates: { readonly lat: number; readonly lng: number };
  readonly distanceKm: number;
  readonly riskScore: number;
  readonly riskFactors: readonly string[];
}

export interface FarmCoordResponse {
  readonly farmId: string;
  readonly farmName: string;
  readonly coordinates: { readonly lat: number; readonly lng: number };
}

// ======================================================================
// API 함수
// ======================================================================

export function getEpidemicDashboard(): Promise<EpidemicDashboardResponse> {
  return apiGet<EpidemicDashboardResponse>('/epidemic/dashboard').then((r) => (r as unknown as { data: EpidemicDashboardResponse }).data ?? r);
}

export function getEpidemicClusters(regionId?: string): Promise<readonly ClusterResponse[]> {
  const query = regionId ? `?regionId=${regionId}` : '';
  return apiGet<{ data: readonly ClusterResponse[] }>(`/epidemic/clusters${query}`).then((r) => r.data ?? []);
}

export function getClusterDetail(clusterId: string): Promise<ClusterResponse> {
  return apiGet<{ data: ClusterResponse }>(`/epidemic/clusters/${clusterId}`).then((r) => r.data);
}

export function getEpidemicWarnings(): Promise<readonly WarningResponse[]> {
  return apiGet<{ data: readonly WarningResponse[] }>('/epidemic/warnings').then((r) => r.data ?? []);
}

export function getEpidemicRiskMap(): Promise<RiskMapResponse> {
  return apiGet<RiskMapResponse>('/epidemic/risk-map');
}

export function acknowledgeWarning(warningId: string): Promise<void> {
  return apiPost(`/epidemic/acknowledge/${warningId}`, {});
}

export function triggerEpidemicScan(): Promise<unknown> {
  return apiPost('/epidemic/scan', {});
}

// ======================================================================
// 방역 사례 DB
// ======================================================================

export type CaseOutcome = 'true_positive' | 'false_positive' | 'pending';

export interface CaseRecord {
  readonly alertId: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly alertType: string;
  readonly priority: string;
  readonly title: string;
  readonly createdAt: string;
  readonly status: string;
  readonly outcome: CaseOutcome;
  readonly diseaseName: string | null;
  readonly dsiScore: number | null;
}

export interface AccuracyStats {
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  readonly totalCases: number;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly pending: number;
}

export interface CaseListResponse {
  readonly cases: readonly CaseRecord[];
  readonly accuracy: AccuracyStats;
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
  };
}

export function listCases(params?: {
  outcome?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<CaseListResponse> {
  return apiGet<{ data: CaseListResponse }>('/quarantine/cases', params).then((r) => r.data);
}

export function submitCaseFeedback(
  alertId: string,
  outcome: CaseOutcome,
  farmId: string,
): Promise<unknown> {
  const feedbackType = outcome === 'true_positive' ? 'disease_confirmed' : 'alert_false_positive';
  return apiPost('/feedback', {
    alertId,
    farmId,
    feedbackType,
    notes: null,
  });
}
