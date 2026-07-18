// 경제성/생산성 분석 API

import { apiGet, apiPost, apiPut, apiDelete } from './client';
import type { EconomicParameterView, EconomicParameterKey } from '@cowtalk/shared';

export interface EconomicParametersResponse {
  readonly farmId: string | null;
  readonly parameters: readonly EconomicParameterView[];
}

/** 유효 경제 파라미터 목록 (기본값+오버라이드 병합, 출처 포함) */
export function getEconomicParameters(farmId?: string): Promise<EconomicParametersResponse> {
  return apiGet<EconomicParametersResponse>('/economics/parameters', farmId ? { farmId } : undefined);
}

/** 오버라이드 저장 — farmId 없으면 글로벌 (행정관리자 전용) */
export function saveEconomicParameter(input: {
  key: EconomicParameterKey;
  value: number;
  farmId?: string;
}): Promise<EconomicParametersResponse> {
  return apiPut<EconomicParametersResponse>('/economics/parameters', input);
}

/** 오버라이드 제거 — 상위(글로벌/기본값)로 복귀 */
export function resetEconomicParameter(
  key: EconomicParameterKey,
  farmId?: string,
): Promise<EconomicParametersResponse> {
  return apiDelete<EconomicParametersResponse>(
    `/economics/parameters/${key}${farmId ? `?farmId=${farmId}` : ''}`,
  );
}

export interface EconomicEntry {
  readonly month: string;
  readonly income: Record<string, number>;
  readonly expense: Record<string, number>;
  readonly totalIncome: number;
  readonly totalExpense: number;
  readonly netProfit: number;
  readonly perHeadProfit: number;
}

export interface EconomicInput {
  readonly farmId: string;
  readonly month: string;
  readonly income: Record<string, number>;
  readonly expense: Record<string, number>;
}

export interface ProductivitySnapshot {
  readonly month: string;
  readonly milkYieldAvg: number | null;
  readonly dailyGainAvg: number | null;
  readonly feedEfficiency: number | null;
  readonly conceptionRate: number | null;
  readonly openDaysAvg: number | null;
  readonly mortalityRate: number;
  readonly diseaseRate: number;
}

export interface FarmBenchmark {
  readonly farmId: string;
  readonly farmName: string;
  readonly rank: number;
  readonly totalFarms: number;
  readonly metrics: Record<string, { value: number; percentile: number }>;
}

export interface RoiResult {
  readonly estrusDetectionImprovement: number;
  readonly diseaseEarlyDetectionSavings: number;
  readonly mortalityReduction: number;
  readonly totalMonthlySavings: number;
  readonly roiMultiple: number;
}

export function getEconomics(farmId: string, year?: number): Promise<readonly EconomicEntry[]> {
  return apiGet<readonly EconomicEntry[]>(`/economics/${farmId}`, year ? { year } : undefined);
}

export function saveEconomicEntry(input: EconomicInput): Promise<EconomicEntry> {
  return apiPost<EconomicEntry>('/economics', input);
}

export function getProductivity(farmId: string, months?: number): Promise<readonly ProductivitySnapshot[]> {
  return apiGet<readonly ProductivitySnapshot[]>(`/economics/${farmId}/productivity`, months ? { months } : undefined);
}

export function getBenchmark(tenantId: string): Promise<readonly FarmBenchmark[]> {
  return apiGet<readonly FarmBenchmark[]>(`/economics/benchmark/${tenantId}`);
}

export function getEconomicAnalysis(farmId: string): Promise<{ summary: string; recommendations: readonly string[] }> {
  return apiGet<{ summary: string; recommendations: readonly string[] }>(`/economics/${farmId}/analysis`);
}

export function calculateRoi(farmId: string): Promise<RoiResult> {
  return apiGet<RoiResult>('/economics/roi-calculator', { farmId });
}
