// 백신 스케줄 API

import { apiGet, apiPost } from './client';

export interface VaccineSchedule {
  readonly scheduleId: string;
  readonly animalId: string;
  readonly vaccineName: string;
  readonly scheduledDate: string;
  readonly completedDate: string | null;
  readonly status: 'pending' | 'completed' | 'overdue';
}

export interface VaccineRecord {
  readonly animalId: string;
  readonly vaccineName: string;
  readonly manufacturer: string | null;
  readonly lotNumber: string | null;
  readonly dosageMl: number;
  readonly administeredDate: string;
}

export interface VaccineCoverage {
  readonly vaccineName: string;
  readonly totalAnimals: number;
  readonly vaccinatedCount: number;
  readonly coveragePercent: number;
  readonly targetPercent: number;
}

export function getFarmVaccineSchedule(farmId: string): Promise<readonly VaccineSchedule[]> {
  return apiGet<readonly VaccineSchedule[]>(`/vaccines/schedule/${farmId}`);
}

export function recordVaccination(record: VaccineRecord): Promise<void> {
  return apiPost('/vaccines/record', record);
}

export function getRegionCoverage(regionId: string): Promise<readonly VaccineCoverage[]> {
  return apiGet<readonly VaccineCoverage[]>(`/vaccines/coverage/${regionId}`);
}
