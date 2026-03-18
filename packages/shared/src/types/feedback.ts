// 피드백 + 결과 평가 (Intelligence Loop)

import type { Role } from './user.js';

export type FeedbackType =
  | 'correct'               // AI 판단 맞음
  | 'incorrect'             // AI 판단 틀림
  | 'partially'             // 부분적으로 맞음
  | 'too_early'             // 너무 이른 알림
  | 'too_late'              // 너무 늦은 알림
  | 'not_actionable'        // 실행 불가능
  | 'estrus_confirmed'      // 발정 확인됨
  | 'estrus_false'          // 발정 오탐
  | 'insemination_done'     // 수정 완료
  | 'pregnancy_confirmed'   // 임신 확인됨
  | 'pregnancy_negative'    // 임신 아님
  | 'disease_confirmed'     // 질병 확인됨
  | 'disease_false'         // 질병 오탐
  | 'treatment_effective'   // 치료 효과 있음
  | 'treatment_ineffective' // 치료 효과 없음
  | 'alert_useful'          // 알림 유용했음
  | 'alert_ignored';        // 알림 무시됨

export type MatchResult =
  | 'true_positive'
  | 'false_positive'
  | 'true_negative'
  | 'false_negative';

export interface Feedback {
  readonly feedbackId: string;
  readonly predictionId: string | null;
  readonly alertId: string | null;
  readonly animalId: string | null;
  readonly farmId: string;
  readonly feedbackType: FeedbackType;
  readonly feedbackValue: number | null;  // 1-5 별점 (선택)
  readonly sourceRole: Role;
  readonly recordedBy: string;
  readonly notes: string | null;
  readonly createdAt: Date;
}

export interface OutcomeEvaluation {
  readonly evaluationId: string;
  readonly predictionId: string;
  readonly actualOutcome: string;
  readonly isCorrect: boolean;
  readonly matchResult: MatchResult;
  readonly evaluatedAt: Date;
  readonly evaluatedBy: string | null;
  readonly details: Record<string, unknown> | null;
}

export interface EnginePerformanceReport {
  readonly engineType: string;
  readonly period: { from: Date; to: Date };
  readonly totalPredictions: number;
  readonly evaluatedCount: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1Score: number;
  readonly avgConfidence: number;
  readonly feedbackBreakdown: Readonly<Record<FeedbackType, number>>;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly trueNegatives: number;
  readonly falseNegatives: number;
  readonly calibrationError: number;
}
