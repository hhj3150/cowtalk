// 피드백 + 결과 평가 (Intelligence Loop)

import type { Role } from './user';

export type FeedbackType =
  | 'correct'         // AI 판단 맞음
  | 'incorrect'       // AI 판단 틀림
  | 'partially'       // 부분적으로 맞음
  | 'too_early'       // 너무 이른 알림
  | 'too_late'        // 너무 늦은 알림
  | 'not_actionable'; // 실행 불가능

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
}
