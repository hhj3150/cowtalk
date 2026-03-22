// 전염병 조기경보 시스템 타입

import type { Coordinates, Severity } from './common.js';

// ======================================================================
// 경보 레벨
// ======================================================================

export type EpidemicAlertLevel = 'normal' | 'watch' | 'warning' | 'outbreak';

export type ClusterStatus = 'active' | 'monitoring' | 'resolved' | 'merged';

export type QuarantineActionType =
  | 'isolate'
  | 'vaccinate'
  | 'monitor'
  | 'restrict_movement'
  | 'test'
  | 'cull';

export type EpidemicScope = 'farm' | 'district' | 'province' | 'brand' | 'national';

// ======================================================================
// 질병 클러스터
// ======================================================================

export interface DiseaseCluster {
  readonly clusterId: string;
  readonly diseaseType: string;
  readonly center: Coordinates;
  readonly radiusKm: number;
  readonly level: EpidemicAlertLevel;
  readonly status: ClusterStatus;
  readonly affectedFarms: readonly ClusterFarmEntry[];
  readonly firstDetectedAt: Date;
  readonly lastUpdatedAt: Date;
  readonly spreadRate: SpreadRate;
  readonly metadata: Record<string, unknown>;
}

export interface ClusterFarmEntry {
  readonly farmId: string;
  readonly farmName: string;
  readonly coordinates: Coordinates;
  readonly eventCount: number;
  readonly latestEventAt: Date;
  readonly distanceFromCenter: number;
}

export interface SpreadRate {
  readonly farmsPerDay: number;
  readonly eventsPerDay: number;
  readonly direction: string | null;
  readonly trend: 'accelerating' | 'stable' | 'decelerating';
}

// ======================================================================
// 전염병 경보
// ======================================================================

export interface EpidemicWarning {
  readonly warningId: string;
  readonly clusterId: string;
  readonly level: EpidemicAlertLevel;
  readonly scope: EpidemicScope;
  readonly regionId: string | null;
  readonly spreadRate: SpreadRate;
  readonly aiInterpretation: EpidemicInterpretation | null;
  readonly status: 'active' | 'acknowledged' | 'resolved';
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
}

export interface EpidemicInterpretation {
  readonly riskAssessment: string;
  readonly diseaseIdentification: {
    readonly likelyDisease: string;
    readonly confidence: number;
    readonly basis: readonly string[];
  };
  readonly spreadPrediction: SpreadPrediction;
  readonly quarantineActions: readonly QuarantineAction[];
  readonly roleActions: Record<string, string>;
  readonly dataReferences: readonly string[];
}

export interface SpreadPrediction {
  readonly predictedFarmIds: readonly string[];
  readonly timeframeHours: number;
  readonly probability: number;
  readonly direction: string;
  readonly basis: string;
}

export interface QuarantineAction {
  readonly actionType: QuarantineActionType;
  readonly targetFarmIds: readonly string[];
  readonly urgency: Severity;
  readonly description: string;
}

// ======================================================================
// 농장 근접 위험도
// ======================================================================

export interface FarmProximityRisk {
  readonly farmId: string;
  readonly farmName: string;
  readonly coordinates: Coordinates;
  readonly distanceKm: number;
  readonly riskScore: number;
  readonly nearbyClusterIds: readonly string[];
  readonly riskFactors: readonly string[];
}

// ======================================================================
// 대시보드 데이터
// ======================================================================

export interface EpidemicDashboardData {
  readonly currentLevel: EpidemicAlertLevel;
  readonly activeWarnings: readonly EpidemicWarning[];
  readonly activeClusters: readonly DiseaseCluster[];
  readonly riskMap: readonly FarmProximityRisk[];
  readonly trendSummary: EpidemicTrendSummary;
  readonly lastScanAt: Date | null;
}

export interface EpidemicTrendSummary {
  readonly totalClusters: number;
  readonly newClustersLast24h: number;
  readonly resolvedClustersLast7d: number;
  readonly averageSpreadRate: number;
  readonly highestRiskRegion: string | null;
  readonly dailyEventCounts: readonly DailyEventCount[];
}

export interface DailyEventCount {
  readonly date: string;
  readonly healthEvents: number;
  readonly temperatureEvents: number;
  readonly clusterEvents: number;
}

// ======================================================================
// 클러스터 추이 (시간축)
// ======================================================================

export interface ClusterTrend {
  readonly clusterId: string;
  readonly snapshots: readonly ClusterSnapshot[];
}

export interface ClusterSnapshot {
  readonly date: string;
  readonly farmCount: number;
  readonly eventCount: number;
  readonly radiusKm: number;
  readonly level: EpidemicAlertLevel;
}

// ======================================================================
// API 요청/응답
// ======================================================================

export interface EpidemicWarningsQuery {
  readonly scope?: EpidemicScope;
  readonly regionId?: string;
  readonly level?: EpidemicAlertLevel;
  readonly status?: 'active' | 'acknowledged' | 'resolved';
}

export interface EpidemicClustersQuery {
  readonly regionId?: string;
  readonly status?: ClusterStatus;
  readonly minLevel?: EpidemicAlertLevel;
}

export interface NearbyRiskQuery {
  readonly farmId: string;
  readonly radiusKm?: number;
}
