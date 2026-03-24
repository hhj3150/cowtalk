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
  readonly warnings: readonly string[];
  readonly recommendations: readonly SemenRecommendationItem[];
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
