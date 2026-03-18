// 지역 API

import { apiGet } from './client';

export interface RegionalSummary {
  readonly regionId: string;
  readonly name: string;
  readonly totalFarms: number;
  readonly totalAnimals: number;
  readonly activeAlerts: number;
  readonly healthScore: number | null;
}

export interface FarmMapMarker {
  readonly farmId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly totalAnimals: number;
  readonly activeAlerts: number;
  readonly healthScore: number | null;
  readonly status: 'normal' | 'warning' | 'danger' | 'critical';
}

export interface RegionalMapData {
  readonly markers: readonly FarmMapMarker[];
  readonly clusters: readonly {
    readonly signalType: string;
    readonly center: { lat: number; lng: number };
    readonly radius: number;
    readonly severity: string;
    readonly affectedFarms: readonly string[];
  }[];
  readonly summary: RegionalSummary;
}

export function getRegionalSummary(): Promise<RegionalSummary> {
  return apiGet<RegionalSummary>('/regional/summary');
}

export function getRegionalMapData(params?: {
  mode?: 'status' | 'estrus' | 'health' | 'sensor';
}): Promise<RegionalMapData> {
  return apiGet<RegionalMapData>('/regional/map', params);
}

export function getRegionDetail(regionId: string): Promise<Record<string, unknown>> {
  return apiGet<Record<string, unknown>>(`/regional/${regionId}`);
}
