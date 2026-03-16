// 동물 (개체) + 상태 이력

import type { Timestamp, SoftDelete } from './common';

export type AnimalStatus =
  | 'active'
  | 'dry'
  | 'pregnant'
  | 'calving'
  | 'sick'
  | 'quarantine'
  | 'sold'
  | 'deceased';

export type Sex = 'female' | 'male';

export type Breed =
  | 'holstein'
  | 'jersey'
  | 'hanwoo'
  | 'brown_swiss'
  | 'simmental'
  | 'mixed'
  | 'other';

export type LactationStatus = 'milking' | 'dry' | 'heifer' | 'unknown';

export interface Animal extends Timestamp, SoftDelete {
  readonly animalId: string;
  readonly externalId: string | null;  // smaXtec device animal ID
  readonly farmId: string;
  readonly earTag: string;
  readonly name: string | null;
  readonly breed: Breed;
  readonly sex: Sex;
  readonly birthDate: Date | null;
  readonly parity: number;             // 산차 (0 = 미경산)
  readonly daysInMilk: number | null;
  readonly lactationStatus: LactationStatus;
  readonly currentDeviceId: string | null;
  readonly status: AnimalStatus;
}

export interface AnimalStatusHistory {
  readonly historyId: string;
  readonly animalId: string;
  readonly previousStatus: AnimalStatus;
  readonly newStatus: AnimalStatus;
  readonly changedAt: Date;
  readonly changedBy: string | null;
  readonly reason: string | null;
}

export interface BreedingEvent {
  readonly eventId: string;
  readonly animalId: string;
  readonly eventDate: Date;
  readonly type: 'natural' | 'ai';     // 자연교배/인공수정
  readonly semenInfo: string | null;
  readonly technicianId: string | null;
  readonly notes: string | null;
}

export interface PregnancyCheck {
  readonly checkId: string;
  readonly animalId: string;
  readonly checkDate: Date;
  readonly result: 'positive' | 'negative' | 'uncertain';
  readonly method: 'ultrasound' | 'rectal' | 'blood_test';
  readonly daysPostInsemination: number | null;
  readonly notes: string | null;
}

export interface CalvingEvent {
  readonly eventId: string;
  readonly animalId: string;
  readonly calvingDate: Date;
  readonly calfSex: Sex | null;
  readonly calfStatus: 'alive' | 'stillborn' | null;
  readonly complications: string | null;
  readonly notes: string | null;
}

export interface HealthEvent {
  readonly eventId: string;
  readonly animalId: string;
  readonly eventDate: Date;
  readonly diagnosis: string;
  readonly severity: 'mild' | 'moderate' | 'severe';
  readonly notes: string | null;
}

export interface Treatment {
  readonly treatmentId: string;
  readonly healthEventId: string;
  readonly drug: string;
  readonly dosage: string | null;
  readonly withdrawalDays: number;
  readonly administeredBy: string | null;
  readonly administeredAt: Date;
}

export interface MilkRecord {
  readonly recordId: string;
  readonly animalId: string;
  readonly date: Date;
  readonly yield: number;          // kg
  readonly fat: number | null;     // %
  readonly protein: number | null; // %
  readonly scc: number | null;     // 체세포수
}
