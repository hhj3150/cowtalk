// 동물 API

import { apiGet, apiPost, apiPatch } from './client';
import type { PaginatedResult } from '@cowtalk/shared';

export interface AnimalSummary {
  readonly animalId: string;
  readonly earTag: string;
  readonly traceId: string | null;
  readonly breedType: 'dairy' | 'beef';
  readonly breed: string;
  readonly sex: string;
  readonly parity: number;
  readonly farmId: string;
  readonly farmName: string;
  readonly status: string;
  readonly latestTemperature: number | null;
  readonly latestActivity: number | null;
  readonly latestRumination: number | null;
}

export interface AnimalDetailData {
  readonly animal: AnimalSummary;
  readonly interpretation: Record<string, unknown> | null;
  readonly sensorHistory: readonly Record<string, unknown>[];
  readonly breedingHistory: readonly Record<string, unknown>[];
  readonly healthHistory: readonly Record<string, unknown>[];
  readonly production: Record<string, unknown> | null;
  readonly growth: Record<string, unknown> | null;
  readonly events: readonly Record<string, unknown>[];
  readonly pedigree: Record<string, unknown> | null;
}

export function listAnimals(params?: {
  farmId?: string;
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResult<AnimalSummary>> {
  return apiGet<PaginatedResult<AnimalSummary>>('/animals', params);
}

export function getAnimalDetail(animalId: string, role?: string): Promise<AnimalDetailData> {
  return apiGet<AnimalDetailData>(`/animals/${animalId}`, role ? { role } : undefined);
}

export function createAnimal(data: Record<string, unknown>): Promise<AnimalSummary> {
  return apiPost<AnimalSummary>('/animals', data);
}

export function updateAnimal(animalId: string, data: Record<string, unknown>): Promise<AnimalSummary> {
  return apiPatch<AnimalSummary>(`/animals/${animalId}`, data);
}
