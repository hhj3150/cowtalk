// 체중 측정 API 클라이언트

import { apiGet, apiPost } from './client';
import type { WeightMeasurementInput, WeightMeasurementRecord } from '@cowtalk/shared';

export function submitWeightMeasurement(
  data: WeightMeasurementInput,
): Promise<{ success: boolean; data: { measurementId: string; measuredAt: string; actualWeightKg: number } }> {
  return apiPost('/weight', data);
}

export function getWeightHistory(
  animalId: string,
  limit = 20,
): Promise<{ data: readonly WeightMeasurementRecord[] }> {
  return apiGet(`/weight/${animalId}`, { limit });
}

export function getLatestWeight(
  animalId: string,
): Promise<{ data: WeightMeasurementRecord | null }> {
  return apiGet(`/weight/${animalId}/latest`);
}
