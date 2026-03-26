// 체중 측정 타입 — AI 체중 추정 Phase 1 데이터 수집

export interface WeightMeasurementInput {
  readonly animalId: string;
  readonly farmId: string;
  readonly actualWeightKg: number;
  readonly sidePhotoBase64?: string;
  readonly rearPhotoBase64?: string;
  readonly notes?: string;
}

export interface WeightMeasurementRecord {
  readonly measurementId: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly measuredAt: string; // ISO 8601
  readonly actualWeightKg: number;
  readonly estimatedWeightKg: number | null;
  readonly hasSidePhoto: boolean;
  readonly hasRearPhoto: boolean;
  readonly notes: string | null;
  readonly createdAt: string;
}
