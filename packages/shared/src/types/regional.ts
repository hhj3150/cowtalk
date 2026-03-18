// 지역 인텔리전스 + 요약

import type { Coordinates, Severity } from './common.js';

export type RegionRiskLevel = 'normal' | 'watch' | 'warning' | 'critical';

export type VisualizationMode =
  | 'health_risk'
  | 'estrus_activity'
  | 'productivity'
  | 'disease_cluster';

export interface RegionalDailySummary {
  readonly regionId: string;
  readonly date: Date;
  readonly metrics: RegionalMetrics;
}

export interface RegionalMetrics {
  readonly totalFarms: number;
  readonly totalAnimals: number;
  readonly activeFarms: number;
  readonly healthRiskFarms: number;
  readonly estrusDetectedCount: number;
  readonly diseaseAlertCount: number;
  readonly avgDataQuality: number;
  readonly riskLevel: RegionRiskLevel;
}

export interface FarmCluster {
  readonly clusterId: string;
  readonly regionId: string;
  readonly farmIds: readonly string[];
  readonly center: Coordinates;
  readonly clusterType: 'disease' | 'productivity' | 'general';
  readonly severity: Severity;
  readonly description: string;
}

export interface RegionalAnalysis {
  readonly analysisId: string;
  readonly regionId: string;
  readonly timestamp: Date;
  readonly riskLevel: RegionRiskLevel;
  readonly farmRanking: readonly FarmRankEntry[];
  readonly patterns: readonly RegionalPattern[];
  readonly earlyWarningSignals: readonly EarlyWarningSignal[];
}

export interface FarmRankEntry {
  readonly farmId: string;
  readonly farmName: string;
  readonly riskScore: number;
  readonly alertCount: number;
  readonly coordinates: Coordinates;
}

export interface RegionalPattern {
  readonly patternType: string;
  readonly description: string;
  readonly affectedFarmIds: readonly string[];
  readonly severity: Severity;
}

export interface EarlyWarningSignal {
  readonly signalType: string;
  readonly description: string;
  readonly confidence: number;
  readonly affectedArea: string;
  readonly recommendedAction: string;
}

export interface MapMarkerData {
  readonly farmId: string;
  readonly farmName: string;
  readonly coordinates: Coordinates;
  readonly status: string;
  readonly alertCount: number;
  readonly healthRiskCount: number;
  readonly estrusCount: number;
  readonly topAlert: string | null;
}
