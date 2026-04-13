/**
 * 소버린 알람 공통 타입 정의
 */

export interface SovereignAlarm {
  readonly alarmId: string;
  readonly alarmSignature: string; // deterministic: animalId:type:YYYY-MM-DD
  readonly verdict?: 'confirmed' | 'false_positive' | 'modified';
  readonly animalId: string;
  readonly earTag: string;
  readonly animalName: string | null;
  readonly farmId: string;
  readonly type: string;
  readonly severity: 'info' | 'caution' | 'warning' | 'critical';
  readonly title: string;
  readonly reasoning: string;
  readonly actionPlan: string;
  readonly confidence: number; // 0-100%
  readonly detectedAt: string; // ISO date
  readonly dataPoints: Record<string, number>;
}

export interface DailySummary {
  readonly date: string;
  readonly tempAvg: number | null;
  readonly rumAvg: number | null;   // minutes
  readonly actAvg: number | null;
  readonly drSum: number | null;    // L/day
}

export interface AnimalProfile {
  readonly animalId: string;
  readonly farmId: string;
  readonly earTag: string;
  readonly name: string | null;
  readonly daysInMilk: number | null;
  readonly parity: number | null;
  readonly lactationStatus: string | null;
}

export interface SaveSovereignLabelInput {
  readonly alarmSignature: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly alarmType: string;
  readonly predictedSeverity: string;
  readonly verdict: 'confirmed' | 'false_positive' | 'modified';
  readonly notes?: string;
}

export interface SovereignAlarmAccuracy {
  readonly totalLabeled: number;
  readonly confirmed: number;
  readonly falsePositive: number;
  readonly modified: number;
  readonly accuracy: number;
  readonly byType: Record<string, { confirmed: number; falsePositive: number; modified: number; total: number }>;
}

/** 룰 함수 시그니처 */
export type RuleFunction = (summary: readonly DailySummary[], animal: AnimalProfile) => SovereignAlarm | null;

/** 룰 정의 */
export interface RuleDefinition {
  readonly eventType: string;
  readonly category: 'disease' | 'temperature' | 'rumination' | 'activity' | 'estrus' | 'calving' | 'composite' | 'feeding';
  readonly rule: RuleFunction;
}
