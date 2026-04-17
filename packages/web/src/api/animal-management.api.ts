// 동물 MDM API 클라이언트 — 등록·수정·삭제·상태변경·센서매핑·이력조회

import { apiGet, apiPost, apiPatch, apiDelete } from './client';

// === 타입 ===

export type BreedCode = 'holstein' | 'jersey' | 'hanwoo' | 'brown_swiss' | 'simmental' | 'mixed' | 'other';
export type BreedType = 'dairy' | 'beef';
export type SexCode = 'female' | 'male';
export type AnimalStatus = 'active' | 'sold' | 'dead' | 'culled' | 'transferred';

export interface AnimalRecord {
  readonly animalId: string;
  readonly farmId: string;
  readonly externalId: string | null;
  readonly earTag: string;
  readonly traceId: string | null;
  readonly name: string | null;
  readonly breed: BreedCode;
  readonly breedType: BreedType;
  readonly sex: SexCode;
  readonly birthDate: string | null;   // YYYY-MM-DD
  readonly parity: number;
  readonly daysInMilk: number | null;
  readonly lactationStatus: string;
  readonly currentDeviceId: string | null;
  readonly status: AnimalStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateAnimalInput {
  readonly farmId: string;
  readonly earTag: string;
  readonly traceId?: string;
  readonly name?: string;
  readonly breed: BreedCode;
  readonly breedType?: BreedType;
  readonly sex: SexCode;
  readonly birthDate?: string;  // YYYY-MM-DD (서버가 Date로 coerce)
  readonly parity?: number;
  readonly currentDeviceId?: string;
}

export interface UpdateAnimalInput {
  readonly earTag?: string;
  readonly traceId?: string | null;
  readonly name?: string | null;
  readonly breed?: BreedCode;
  readonly breedType?: BreedType;
  readonly sex?: SexCode;
  readonly birthDate?: string | null;
  readonly parity?: number;
  readonly currentDeviceId?: string | null;
}

export interface ChangeStatusInput {
  readonly status: AnimalStatus;
  readonly reason?: string;
  readonly occurredAt?: string;  // ISO
  readonly destinationFarmId?: string;
}

export interface TraceabilityCheckResult {
  readonly alreadyRegistered: boolean;
  readonly existing?: {
    readonly animalId: string;
    readonly earTag: string;
    readonly farmId: string;
    readonly farmName: string | null;
  };
  readonly message?: string;
  readonly ekapeData?: {
    readonly traceId: string;
    readonly birthDate?: string;
    readonly sex?: string;
    readonly breed?: string;
    readonly farmName?: string;
    // 실제 EKAPE 응답 구조에 맞춤 — 필요 시 확장
    readonly [key: string]: unknown;
  } | null;
  readonly ekapeError?: string;
}

// === API 호출 ===

export function createAnimal(input: CreateAnimalInput): Promise<AnimalRecord> {
  return apiPost<AnimalRecord>('/animals', input);
}

export function updateAnimal(animalId: string, input: UpdateAnimalInput): Promise<AnimalRecord> {
  return apiPatch<AnimalRecord>(`/animals/${animalId}`, input);
}

export function deleteAnimal(animalId: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>(`/animals/${animalId}`);
}

export function changeAnimalStatus(animalId: string, input: ChangeStatusInput): Promise<AnimalRecord> {
  return apiPost<AnimalRecord>(`/animals/${animalId}/status`, input);
}

export function assignSensor(animalId: string, deviceId: string | null): Promise<AnimalRecord> {
  return apiPost<AnimalRecord>(`/animals/${animalId}/sensor`, { deviceId });
}

/**
 * 등록 전 이력제번호 조회 — 중복 검사 + EKAPE 자동 채움 데이터.
 * traceNo는 12자리 숫자여야 함.
 */
export function checkTraceability(traceNo: string): Promise<TraceabilityCheckResult> {
  return apiGet<TraceabilityCheckResult>(`/animals/traceability-check/${traceNo}`);
}

// === 헬퍼 ===

export const BREED_LABELS: Readonly<Record<BreedCode, string>> = {
  holstein: '홀스타인 (젖소)',
  jersey: '저지 (젖소)',
  hanwoo: '한우',
  brown_swiss: '브라운 스위스 (젖소)',
  simmental: '시멘탈 (한우)',
  mixed: '교잡종',
  other: '기타',
};

export const STATUS_LABELS: Readonly<Record<AnimalStatus, string>> = {
  active: '사육 중',
  sold: '판매',
  dead: '폐사',
  culled: '도태',
  transferred: '이동',
};

export const SEX_LABELS: Readonly<Record<SexCode, string>> = {
  female: '암',
  male: '수',
};
