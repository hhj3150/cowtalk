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

// apiGet은 res.data.data를 자동 반환
// 서버: { success, data: FarmSummaryKpi } → apiGet → FarmSummaryKpi

export function getFarmSummary(): Promise<FarmSummaryKpi> {
  return apiGet<FarmSummaryKpi>('/farms/summary');
}

export function getFarmList(params?: Record<string, unknown>): Promise<readonly FarmRecord[]> {
  return apiGet<readonly FarmRecord[]>('/farms', { ...params, limit: 300 });
}

export function getRegions(): Promise<readonly RegionOption[]> {
  return apiGet<readonly RegionOption[]>('/farms/regions');
}

export function createFarm(data: FarmFormData): Promise<FarmRecord> {
  return apiPost<FarmRecord>('/farms', data);
}

export function updateFarm(farmId: string, data: Partial<FarmFormData>): Promise<FarmRecord> {
  return apiPatch<FarmRecord>(`/farms/${farmId}`, data);
}
