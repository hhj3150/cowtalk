// AI 예측 + 엔진 인터페이스 (블루프린트 PART 5)

import type { Severity, ConfidenceLevel, DataQuality } from './common';
import type { Role } from './user';
import type { AnimalFeatures, SensorReading } from './sensor';

// === 엔진 타입 ===

export type EngineType =
  | 'estrus'
  | 'disease'
  | 'pregnancy'
  | 'herd'
  | 'regional';

// === 엔진 입력 (블루프린트 PART 5) ===

export interface EngineInput {
  readonly animal: AnimalContext;
  readonly features: AnimalFeatures;
  readonly sensorData: readonly SensorReading[];
  readonly events: readonly AnimalEvent[];
  readonly farmContext: FarmContext;
  readonly environmentContext?: EnvironmentContext;
}

export interface AnimalContext {
  readonly animalId: string;
  readonly farmId: string;
  readonly earTag: string;
  readonly breed: string;
  readonly parity: number;
  readonly daysInMilk: number | null;
  readonly lactationStatus: string;
  readonly lastCalvingDate: Date | null;
  readonly lastInseminationDate: Date | null;
}

export interface AnimalEvent {
  readonly eventType: 'breeding' | 'calving' | 'health' | 'treatment' | 'pregnancy_check';
  readonly eventDate: Date;
  readonly details: Record<string, unknown>;
}

export interface FarmContext {
  readonly farmId: string;
  readonly farmName: string;
  readonly totalAnimals: number;
  readonly herdAvgTemperature: number | null;
  readonly herdAvgActivity: number | null;
  readonly herdAvgRumination: number | null;
}

export interface EnvironmentContext {
  readonly outdoorTemperature: number | null;
  readonly humidity: number | null;
  readonly thi: number | null;  // Temperature-Humidity Index
  readonly season: 'spring' | 'summer' | 'autumn' | 'winter';
}

// === 엔진 출력 (블루프린트 PART 5) ===

export interface EngineOutput {
  readonly predictionId: string;
  readonly engineType: EngineType;
  readonly farmId: string;
  readonly animalId: string;
  readonly timestamp: Date;
  readonly probability: number;           // 0-1
  readonly confidence: number;            // 0-1
  readonly confidenceLevel: ConfidenceLevel;
  readonly severity: Severity;
  readonly rankScore: number;             // 정렬용 복합 점수
  readonly predictionLabel: string;       // 사람이 읽을 수 있는 라벨
  readonly explanationText: string;       // 왜 이런 판단인지
  readonly contributingFeatures: readonly ContributingFeature[];
  readonly recommendedAction: string;
  readonly modelVersion: string;
  readonly roleSpecific: Readonly<Record<Role, RoleSpecificOutput>>;
  readonly dataQuality: DataQuality;
  readonly featureSnapshotId: string | null;
}

export interface ContributingFeature {
  readonly featureName: string;
  readonly value: number;
  readonly weight: number;            // 기여도 0-1
  readonly direction: 'positive' | 'negative' | 'neutral';
  readonly description: string;       // 한글 설명
}

export interface RoleSpecificOutput {
  readonly summary: string;           // 역할별 요약
  readonly details: string;           // 역할별 상세
  readonly priority: Severity;
  readonly actionItems: readonly string[];
  readonly showMetrics: readonly string[]; // 역할에 표시할 메트릭
}

// === 발정 감지 전용 ===

export type EstrusStage = 'pre_estrus' | 'estrus' | 'post_estrus' | 'none';

export interface EstrusOutput extends EngineOutput {
  readonly engineType: 'estrus';
  readonly stage: EstrusStage;
  readonly optimalInseminationWindow: DateWindow | null;
  readonly sensorSignatureScore: number;
  readonly eventScore: number;
  readonly cycleScore: number;
}

export interface DateWindow {
  readonly start: Date;
  readonly end: Date;
}

// === 질병 경고 전용 ===

export type DiseaseType =
  | 'mastitis'
  | 'ketosis'
  | 'milk_fever'
  | 'acidosis'
  | 'pneumonia'
  | 'metritis'
  | 'lameness';

export interface DiseaseOutput extends EngineOutput {
  readonly engineType: 'disease';
  readonly suspectedDiseases: readonly SuspectedDisease[];
  readonly urgencyHours: number;
}

export interface SuspectedDisease {
  readonly diseaseType: DiseaseType;
  readonly probability: number;
  readonly matchingSymptoms: readonly string[];
}

// === 임신 예측 전용 ===

export interface PregnancyOutput extends EngineOutput {
  readonly engineType: 'pregnancy';
  readonly daysPostInsemination: number | null;
  readonly stabilityScore: number;
  readonly estimatedDueDate: Date | null;
}

// === Decision Fusion ===

export interface FusionResult {
  readonly fusionId: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly timestamp: Date;
  readonly primaryInterpretation: EngineOutput;
  readonly secondaryInterpretations: readonly EngineOutput[];
  readonly conflictResolved: boolean;
  readonly conflictDescription: string | null;
  readonly finalSeverity: Severity;
  readonly finalRankScore: number;
}

// === 모델 레지스트리 ===

export interface ModelRegistryEntry {
  readonly modelId: string;
  readonly engineType: EngineType;
  readonly modelType: 'rule_based' | 'ml' | 'hybrid';
  readonly version: string;
  readonly metrics: ModelMetrics;
  readonly isActive: boolean;
  readonly deployedAt: Date;
}

export interface ModelMetrics {
  readonly precision: number;
  readonly recall: number;
  readonly f1Score: number;
  readonly totalPredictions: number;
  readonly evaluatedAt: Date;
}
