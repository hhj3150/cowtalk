// 농장 상세/프로필/비교 API

import { apiGet } from './client';

export interface FarmProfile {
  readonly farmId: string;
  readonly farmName: string;
  readonly ownerName: string;
  readonly address: string;
  readonly breedType: 'dairy' | 'beef' | 'mixed';
  readonly totalAnimals: number;
  readonly healthScore: number;
  readonly conceptionRate: number | null;
  readonly avgOpenDays: number | null;
  readonly mortalityRate: number;
}

export interface FarmLearning {
  readonly farmId: string;
  readonly patterns: readonly {
    readonly season: string;
    readonly pattern: string;
    readonly frequency: number;
    readonly lastOccurred: string;
    readonly severity: string;
  }[];
  readonly preemptiveAlerts: readonly string[];
}

export interface SimilarFarm {
  readonly anonymizedName: string;
  readonly breedType: string;
  readonly scale: number;
  readonly conceptionRate: number;
  readonly openDaysAvg: number;
  readonly mortalityRate: number;
  readonly milkYieldAvg: number | null;
  readonly dailyGainAvg: number | null;
  readonly rank: 'top10' | 'top30' | 'average' | 'bottom30' | 'bottom10';
}

export interface FarmReportCard {
  readonly farmId: string;
  readonly quarter: string;
  readonly metrics: readonly {
    readonly label: string;
    readonly value: number;
    readonly unit: string;
    readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
    readonly nationalAvg: number;
    readonly regionAvg: number;
    readonly trend: 'up' | 'down' | 'stable';
  }[];
  readonly aiComment: string;
}

export function getFarmProfile(farmId: string): Promise<FarmProfile> {
  return apiGet<FarmProfile>(`/farms/${farmId}/profile`);
}

export function getFarmLearning(farmId: string): Promise<FarmLearning> {
  return apiGet<FarmLearning>(`/farms/${farmId}/learning`);
}

export function getSimilarFarms(farmId: string): Promise<readonly SimilarFarm[]> {
  return apiGet<readonly SimilarFarm[]>(`/farms/${farmId}/similar`);
}

export function getFarmReportCard(farmId: string, quarter?: string): Promise<FarmReportCard> {
  return apiGet<FarmReportCard>(`/farms/${farmId}/report-card`, quarter ? { quarter } : undefined);
}
