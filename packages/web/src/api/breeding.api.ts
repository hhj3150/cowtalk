// 육종/번식 API

import { apiGet, apiPost } from './client';

export interface SemenRecord {
  readonly semenId: string;
  readonly sireName: string;
  readonly breed: string;
  readonly registrationNumber: string;
  readonly a2Status: 'A2A2' | 'A1A2' | 'A1A1' | 'unknown';
  readonly milkYieldEbv: number | null;
  readonly fatEbv: number | null;
  readonly proteinEbv: number | null;
  readonly sccEbv: number | null;
  readonly stockCount: number;
}

export interface MatingRecommendation {
  readonly rank: number;
  readonly semenId: string;
  readonly sireName: string;
  readonly inbreedingCoefficient: number;
  readonly a2Status: string;
  readonly milkYieldGain: number | null;
  readonly reasoning: string;
}

export interface PedigreeNode {
  readonly id: string;
  readonly name: string | null;
  readonly registrationNumber: string | null;
  readonly breed: string | null;
  readonly sire: PedigreeNode | null;
  readonly dam: PedigreeNode | null;
}

export function getSemenCatalog(params?: {
  breed?: string;
  search?: string;
}): Promise<readonly SemenRecord[]> {
  return apiGet<readonly SemenRecord[]>('/breeding/semen', params);
}

export function getMatingRecommendations(animalId: string): Promise<readonly MatingRecommendation[]> {
  return apiGet<readonly MatingRecommendation[]>(`/breeding/recommend/${animalId}`);
}

export function getPedigree(animalId: string): Promise<PedigreeNode> {
  return apiGet<PedigreeNode>(`/breeding/pedigree/${animalId}`);
}

export function getBreedingStats(farmId: string): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>(`/breeding/stats/${farmId}`);
}

// ===========================
// 수정 추천 (breeding-advisor)
// ===========================

export interface SemenRecommendationItem {
  readonly rank: number;
  readonly semenId: string;
  readonly bullName: string;
  readonly bullRegistration: string | null;
  readonly breed: string;
  readonly score: number;
  readonly inbreedingRisk: 'low' | 'medium' | 'high';
  readonly estimatedInbreeding: number;
  readonly milkYieldGain: number | null;
  readonly reasoning: string;
  readonly availableStraws: number;
  readonly pricePerStraw: number | null;
}

export interface BreedingAdvice {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly heatDetectedAt: string;
  readonly optimalInseminationTime: string;
  readonly optimalTimeLabel: string;
  readonly windowStartHours: number;
  readonly windowEndHours: number;
  readonly windowStartTime: string;
  readonly windowEndTime: string;
  readonly warnings: readonly string[];
  readonly recommendations: readonly SemenRecommendationItem[];
  readonly farmSettings: {
    readonly pregnancyCheckDays: number;
    readonly estrusRecurrenceDays: number;
  };
}

export function getBreedingAdvice(animalId: string): Promise<BreedingAdvice> {
  return apiGet<BreedingAdvice>(`/breeding/recommend/${animalId}`);
}

export function recordInsemination(params: {
  animalId: string;
  farmId: string;
  semenId?: string;
  semenInfo?: string;
  technicianName?: string;
  notes?: string;
}): Promise<{ eventId: string }> {
  return apiPost<{ eventId: string }>('/breeding/inseminate', params);
}

// ===========================
// 목장 보유 정액 관리
// ===========================

export interface FarmSemenItem {
  readonly inventoryId: string;
  readonly semenId: string;
  readonly bullName: string;
  readonly bullRegistration: string | null;
  readonly breed: string;
  readonly supplier: string | null;
  readonly genomicTraits: Record<string, number>;
  readonly pricePerStraw: number | null;
  readonly quantity: number;
  readonly purchasedAt: string;
  readonly expiresAt: string | null;
  readonly notes: string | null;
}

export function getFarmInventory(farmId: string): Promise<readonly FarmSemenItem[]> {
  return apiGet<readonly FarmSemenItem[]>(`/breeding/farm/${farmId}/inventory`);
}

export function addFarmInventory(farmId: string, params: {
  semenId: string;
  quantity: number;
  notes?: string;
}): Promise<{ inventoryId: string; action: string }> {
  return apiPost<{ inventoryId: string; action: string }>(`/breeding/farm/${farmId}/inventory`, params);
}

// ===========================
// 임신감정 + 피드백
// ===========================

export interface PregnancyCheckParams {
  readonly animalId: string;
  readonly checkDate: string;
  readonly result: 'pregnant' | 'open';
  readonly method: 'ultrasound' | 'manual' | 'blood';
  readonly daysPostInsemination?: number;
  readonly notes?: string;
}

export function recordPregnancyCheck(params: PregnancyCheckParams): Promise<{ checkId: string }> {
  return apiPost<{ checkId: string }>('/breeding/pregnancy-check', params);
}

export interface BreedingFeedbackEntry {
  readonly inseminationDate: string;
  readonly semenId: string | null;
  readonly bullName: string | null;
  readonly pregnancyResult: 'pregnant' | 'open' | 'pending';
  readonly checkDate: string | null;
  readonly daysToCheck: number | null;
}

export interface BreedingFeedback {
  readonly animalId: string;
  readonly totalInseminations: number;
  readonly pregnantCount: number;
  readonly openCount: number;
  readonly pendingCount: number;
  readonly conceptionRate: number;
  readonly entries: readonly BreedingFeedbackEntry[];
}

export function getBreedingFeedback(animalId: string): Promise<BreedingFeedback> {
  return apiGet<BreedingFeedback>(`/breeding/feedback/${animalId}`);
}

// ===========================
// 성과 분석 (Performance Analysis)
// ===========================

export function getBreedingTrends(
  farmId?: string,
  months?: number,
): Promise<readonly import('@cowtalk/shared').MonthlyKpiTrend[]> {
  return apiGet<readonly import('@cowtalk/shared').MonthlyKpiTrend[]>(
    '/breeding/performance/trends',
    { farmId, months },
  );
}

export function getFarmComparisonData(
  limit?: number,
): Promise<readonly import('@cowtalk/shared').FarmKpiComparison[]> {
  return apiGet<readonly import('@cowtalk/shared').FarmKpiComparison[]>(
    '/breeding/performance/farm-comparison',
    { limit },
  );
}

export function getParityAnalysisData(
  farmId?: string,
): Promise<readonly import('@cowtalk/shared').ParityKpiGroup[]> {
  return apiGet<readonly import('@cowtalk/shared').ParityKpiGroup[]>(
    '/breeding/performance/by-parity',
    { farmId },
  );
}

// ===========================
// 번식 파이프라인 (칸반 뷰)
// ===========================

export function getBreedingPipeline(farmId?: string): Promise<import('@cowtalk/shared').BreedingPipelineData> {
  const url = farmId ? `/breeding/pipeline/${farmId}` : '/breeding/pipeline';
  return apiGet<import('@cowtalk/shared').BreedingPipelineData>(url);
}

// ===========================
// 번식 캘린더
// ===========================

export function getBreedingCalendar(
  startDate: string,
  endDate: string,
  farmId?: string,
): Promise<readonly import('@cowtalk/shared').CalendarEvent[]> {
  return apiGet<readonly import('@cowtalk/shared').CalendarEvent[]>(
    '/breeding/calendar',
    { startDate, endDate, farmId },
  );
}
