// 육종/번식 API

import { apiGet } from './client';

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
