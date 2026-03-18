// 처방전 API

import { apiGet, apiPost } from './client';

export interface Drug {
  readonly drugId: string;
  readonly name: string;
  readonly category: string;
  readonly withdrawalMilkHours: number;
  readonly withdrawalMeatDays: number;
  readonly unit: string;
  readonly route: string;
}

export interface PrescriptionInput {
  readonly animalId: string;
  readonly farmId: string;
  readonly diagnosis: string;
  readonly drugs: readonly {
    readonly drugId: string;
    readonly dosage: number;
    readonly unit: string;
    readonly route: string;
    readonly durationDays: number;
  }[];
  readonly notes: string;
}

export interface Prescription {
  readonly prescriptionId: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly vetUserId: string;
  readonly vetName: string;
  readonly diagnosis: string;
  readonly drugs: readonly {
    readonly drugId: string;
    readonly drugName: string;
    readonly dosage: number;
    readonly unit: string;
    readonly route: string;
    readonly durationDays: number;
    readonly withdrawalMilkUntil: string | null;
    readonly withdrawalMeatUntil: string | null;
  }[];
  readonly notes: string;
  readonly createdAt: string;
}

export function getDrugList(): Promise<readonly Drug[]> {
  return apiGet<readonly Drug[]>('/prescriptions/drugs');
}

export function createPrescription(input: PrescriptionInput): Promise<Prescription> {
  return apiPost<Prescription>('/prescriptions', input);
}

export function getPrescriptionsByAnimal(animalId: string): Promise<readonly Prescription[]> {
  return apiGet<readonly Prescription[]>(`/prescriptions/animal/${animalId}`);
}

export function getPrescriptionPdfUrl(prescriptionId: string): string {
  return `/api/prescriptions/${prescriptionId}/pdf`;
}
