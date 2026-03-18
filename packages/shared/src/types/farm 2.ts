// 농장 + 지역 조직

import type { Coordinates, Timestamp, SoftDelete } from './common.js';

export type FarmStatus = 'active' | 'inactive' | 'quarantine' | 'suspended';

export interface Region {
  readonly regionId: string;
  readonly province: string;     // 시도
  readonly district: string;     // 시군구
  readonly code: string;         // 행정코드
}

export interface Farm extends Timestamp, SoftDelete {
  readonly farmId: string;
  readonly externalId: string | null; // smaXtec org ID
  readonly regionId: string;
  readonly name: string;
  readonly address: string;
  readonly coordinates: Coordinates;
  readonly capacity: number;
  readonly currentHeadCount: number;
  readonly status: FarmStatus;
  readonly ownerName: string | null;
  readonly phone: string | null;
}

export interface FarmGroup {
  readonly groupId: string;
  readonly name: string;
  readonly farmIds: readonly string[];
}

export interface FarmSummary {
  readonly farmId: string;
  readonly farmName: string;
  readonly regionName: string;
  readonly totalAnimals: number;
  readonly activeAlerts: number;
  readonly healthRiskCount: number;
  readonly estrusCount: number;
  readonly pregnancyCount: number;
  readonly lastDataAt: Date | null;
}

export interface FarmDailySummary {
  readonly farmId: string;
  readonly date: Date;
  readonly metrics: FarmDailyMetrics;
}

export interface FarmDailyMetrics {
  readonly totalAnimals: number;
  readonly healthRiskCount: number;
  readonly estrusDetectedCount: number;
  readonly inseminationCount: number;
  readonly calvingCount: number;
  readonly avgMilkYield: number | null;
  readonly alertCount: number;
  readonly resolvedAlertCount: number;
  readonly dataQualityScore: number;
}
