// 번식성적 커맨드센터 — Breeding Performance Pipeline 타입

export type BreedingStage =
  | 'open'
  | 'estrus_detected'
  | 'inseminated'
  | 'pregnancy_confirmed'
  | 'late_gestation'
  | 'calving_expected';

export interface BreedingAnimalSummary {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly currentStage: BreedingStage;
  readonly lastEventDate: string;
  readonly daysInStage: number;
  readonly lactationNumber: number;
  readonly smaxtecEstrusDetected: boolean; // smaXtec 발정 감지 여부
  readonly urgency: 'critical' | 'high' | 'medium' | 'low';
}

export interface BreedingStageGroup {
  readonly stage: BreedingStage;
  readonly label: string;
  readonly count: number;
  readonly animals: readonly BreedingAnimalSummary[];
}

export interface BreedingKpis {
  readonly conceptionRate: number;         // 수태율 (%)
  readonly estrusDetectionRate: number;    // 발정탐지율 (%)
  readonly avgDaysOpen: number;            // 평균공태일
  readonly avgCalvingInterval: number;     // 평균분만간격 (일)
  readonly avgDaysToFirstService: number;  // 분만후 첫 수정일수 (목표 <80일)
  readonly pregnancyRate: number;          // 임신율 (%) = 발정탐지율 × 수태율
}

export interface BreedingUrgentAction {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly actionType: 'inseminate_now' | 'pregnancy_check_due' | 'calving_imminent' | 'repeat_breeder';
  readonly description: string;
  readonly hoursRemaining: number; // estimated hours before opportunity passes
  readonly detectedAt: string;
}

export interface BreedingPipelineData {
  readonly pipeline: readonly BreedingStageGroup[];
  readonly kpis: BreedingKpis;
  readonly urgentActions: readonly BreedingUrgentAction[];
  readonly totalAnimals: number;
  readonly lastUpdated: string;
}
