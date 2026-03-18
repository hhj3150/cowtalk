// 분만/신생 송아지 관리 API

import { apiGet, apiPost } from './client';

export interface CalvingUpcoming {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmName: string;
  readonly expectedDate: string;
  readonly daysUntil: number;
  readonly parity: number;
  readonly riskLevel: 'low' | 'medium' | 'high';
}

export interface CalvingRecord {
  readonly animalId: string;
  readonly farmId: string;
  readonly calvingDate: string;
  readonly calvingType: 'normal' | 'dystocia';
  readonly twinning: boolean;
  readonly calves: readonly {
    readonly sex: 'male' | 'female';
    readonly weight: number | null;
    readonly alive: boolean;
  }[];
  readonly notes: string;
}

export interface NewbornChecklist {
  readonly calfId: string;
  readonly colostrumFed: boolean;
  readonly colostrumTime: string | null;
  readonly navelDisinfected: boolean;
  readonly healthCheck: boolean;
  readonly earTagApplied: boolean;
  readonly traceIdIssued: boolean;
}

export function getUpcomingCalvings(farmId: string): Promise<readonly CalvingUpcoming[]> {
  return apiGet<readonly CalvingUpcoming[]>(`/calving/upcoming/${farmId}`);
}

export function recordCalving(record: CalvingRecord): Promise<{ calvingId: string; calfIds: readonly string[] }> {
  return apiPost<{ calvingId: string; calfIds: readonly string[] }>('/calving/record', record);
}

export function updateNewbornChecklist(calfId: string, checklist: Partial<NewbornChecklist>): Promise<void> {
  return apiPost(`/calving/newborn/${calfId}/checklist`, checklist);
}
