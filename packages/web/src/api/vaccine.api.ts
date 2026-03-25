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

// ===========================
// 추가 API: 개체별 백신이력 + 스케줄 자동생성 + 접종률
// ===========================

export interface PublicVaccination {
  readonly date: string;
  readonly order: string;
  readonly daysSince: string;
}

export interface PublicInspection {
  readonly inspectDate: string;
  readonly result: string;
  readonly tbcInspectDate: string;
  readonly tbcResult: string;
}

export interface LocalVaccineRecord {
  readonly recordId: string;
  readonly vaccineName: string;
  readonly batchNumber: string | null;
  readonly administeredAt: string;
  readonly notes: string | null;
}

export interface AnimalVaccineHistory {
  readonly animalId: string;
  readonly traceId: string | null;
  readonly earTag: string | null;
  readonly publicData: {
    readonly vaccinations: readonly PublicVaccination[];
    readonly inspections: readonly PublicInspection[];
  };
  readonly localRecords: readonly LocalVaccineRecord[];
  readonly schedules: readonly VaccineSchedule[];
}

export interface VaccinationRate {
  readonly totalAnimals: number;
  readonly vaccinatedCount: number;
  readonly rate: number;
  readonly byProtocol: readonly {
    readonly protocolId: string;
    readonly protocolName: string;
    readonly vaccinated: number;
    readonly total: number;
    readonly rate: number;
  }[];
}

export interface ScheduleGenerationResult {
  readonly results: readonly {
    readonly protocolId: string;
    readonly protocolName: string;
    readonly totalEligible: number;
    readonly alreadyScheduled: number;
    readonly alreadyVaccinated: number;
    readonly newSchedulesCreated: number;
  }[];
  readonly totalCreated: number;
  readonly message: string;
}

export interface VaccineProtocolInfo {
  readonly id: string;
  readonly name: string;
  readonly nameEn: string;
  readonly type: 'vaccination' | 'inspection';
  readonly priority: number;
  readonly legalBasis: string;
  readonly penalty: boolean;
}

/** 개체별 백신·방역 통합 이력 조회 */
export function getAnimalVaccineHistory(animalId: string): Promise<AnimalVaccineHistory> {
  return apiGet<AnimalVaccineHistory>(`/animals/${animalId}/vaccine-history`);
}

/** 법정 프로토콜 기반 스케줄 자동생성 */
export function generateVaccineSchedule(
  farmId: string,
  params?: { month?: number; year?: number; protocolIds?: string[] },
): Promise<ScheduleGenerationResult> {
  return apiPost<ScheduleGenerationResult>(`/vaccines/generate-schedule/${farmId}`, params ?? {});
}

/** 농장별 접종률 */
export function getVaccinationRate(farmId: string): Promise<VaccinationRate> {
  return apiGet<VaccinationRate>(`/vaccines/rate/${farmId}`);
}

/** 법정 백신 프로토콜 목록 */
export function getVaccineProtocols(): Promise<readonly VaccineProtocolInfo[]> {
  return apiGet<readonly VaccineProtocolInfo[]>('/vaccines/protocols');
}
