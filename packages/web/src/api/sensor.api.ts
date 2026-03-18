// 센서 API — 차트 데이터

import { apiGet } from './client';

export type TimeRange = '24h' | '48h' | '7d' | '30d';

export interface SensorDataPoint {
  readonly timestamp: string;
  readonly temperature: number | null;
  readonly rumination: number | null;
  readonly activity: number | null;
  readonly waterIntake: number | null;
  readonly ph: number | null;
}

export interface SensorChartData {
  readonly animalId: string;
  readonly earTag: string;
  readonly range: TimeRange;
  readonly data: readonly SensorDataPoint[];
}

export function getSensorHistory(
  animalId: string,
  range: TimeRange = '24h',
): Promise<SensorChartData> {
  return apiGet<SensorChartData>(`/sensors/${animalId}/history`, { range });
}

export function getFarmSensorOverview(farmId: string): Promise<{
  readonly avgTemperature: number | null;
  readonly avgRumination: number | null;
  readonly avgActivity: number | null;
  readonly chartData: readonly SensorDataPoint[];
}> {
  return apiGet(`/sensors/farm/${farmId}/overview`);
}
