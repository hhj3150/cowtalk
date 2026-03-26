// 목장 관리 API 클라이언트

import { apiGet, apiPost, apiPatch } from './client';

// === 타입 ===

export interface FarmSummaryKpi {
  readonly totalFarms: number;
  readonly totalHeadCount: number;
  readonly activeFarms: number;
  readonly inactiveFarms: number;
  readonly tracedAnimalCount: number;
  readonly sensorAnimalCount: number;
}

export interface FarmRecord {
  readonly farmId: string;
  readonly externalId: string | null;
  readonly name: string;
  readonly address: string | null;
  readonly lat: string | null;
  readonly lng: string | null;
  readonly capacity: number | null;
  readonly currentHeadCount: number | null;
  readonly status: string;
  readonly ownerName: string | null;
  readonly phone: string | null;
  readonly regionProvince: string | null;
  readonly regionDistrict: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FarmListResponse {
  readonly data: readonly FarmRecord[];
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
  };
}

export interface RegionOption {
  readonly regionId: string;
  readonly province: string;
  readonly district: string;
}

export interface FarmFormData {
  readonly name: string;
  readonly address: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly capacity: number;
  readonly ownerName?: string;
  readonly phone?: string;
  readonly regionId?: string;
  readonly status?: string;
}

// === API 함수 ===

export function getFarmSummary(): Promise<{ data: FarmSummaryKpi }> {
  return apiGet<{ data: FarmSummaryKpi }>('/farms/summary');
}

export function getFarmList(params?: Record<string, unknown>): Promise<FarmListResponse> {
  return apiGet<FarmListResponse>('/farms', { ...params, limit: 200 });
}

export function getRegions(): Promise<{ data: readonly RegionOption[] }> {
  return apiGet<{ data: readonly RegionOption[] }>('/farms/regions');
}

export function createFarm(data: FarmFormData): Promise<{ data: FarmRecord }> {
  return apiPost<{ data: FarmRecord }>('/farms', data);
}

export function updateFarm(farmId: string, data: Partial<FarmFormData>): Promise<{ data: FarmRecord }> {
  return apiPatch<{ data: FarmRecord }>(`/farms/${farmId}`, data);
}
