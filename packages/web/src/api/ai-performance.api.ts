// AI 성능 분석 API

import { apiGet, apiPost } from './client';

export interface EngineMetrics {
  readonly engineType: string;
  readonly precision: number;
  readonly recall: number;
  readonly f1Score: number;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly totalPredictions: number;
  readonly totalEvaluated: number;
  readonly averageConfidence: number;
}

export interface AccuracyTrend {
  readonly month: string;
  readonly precision: number;
  readonly recall: number;
  readonly totalEvaluated: number;
}

export interface RoleFeedbackStats {
  readonly role: string;
  readonly total: number;
  readonly byType: Record<string, number>;
}

export interface ThresholdSuggestion {
  readonly engineType: string;
  readonly currentThreshold: number;
  readonly suggestedThreshold: number;
  readonly reason: string;
  readonly evidence: {
    readonly falsePositives: number;
    readonly falseNegatives: number;
    readonly borderlineCases: number;
  };
}

// 정액 추천 정확도 (서버 RecommendationAccuracy 미러링).
export interface RecommendationAccuracy {
  readonly totalBatches: number;
  readonly actionedBatches: number;
  readonly adherenceRate: number | null; // 0~100, actioned 중 추천정액 사용 비율
  readonly adherenceStatus: 'ok' | 'data_insufficient';
  readonly recommendedConceptionRate: number | null; // 추천-사용 그룹 수태율 (0~100)
  readonly recommendedDecided: number;
  readonly nonRecommendedConceptionRate: number | null; // 비추천-사용 그룹 수태율
  readonly nonRecommendedDecided: number;
  readonly lift: number | null; // 추천CR − 비추천CR (퍼센트 포인트)
}

export interface PerformanceOverview {
  readonly engines: readonly EngineMetrics[];
  readonly totalPredictions: number;
  // DATA-03-A: AI 평가 누적량 = outcome_evaluations 합산 (게이트 기준).
  readonly totalEvaluated: number;
  // 사용자 명시 피드백(feedback 테이블)은 별도 보존.
  readonly feedbackCount: number;
  readonly overallAccuracy: number;
  readonly feedbackRate: number;
}

export function getPerformanceOverview(params?: {
  from?: string;
  to?: string;
  farmId?: string;
}): Promise<PerformanceOverview> {
  return apiGet<PerformanceOverview>('/ai/performance', params);
}

export function getAccuracyTrend(
  engineType: string,
  months?: number,
): Promise<readonly AccuracyTrend[]> {
  return apiGet<readonly AccuracyTrend[]>('/ai/performance/trend', { engineType, months });
}

export function getRoleFeedbackStats(params?: {
  from?: string;
  to?: string;
}): Promise<readonly RoleFeedbackStats[]> {
  return apiGet<readonly RoleFeedbackStats[]>('/ai/performance/roles', params);
}

export function getRecommendationAccuracy(farmId?: string): Promise<RecommendationAccuracy> {
  return apiGet<RecommendationAccuracy>('/ai/performance/recommendation-accuracy', farmId ? { farmId } : undefined);
}

export function getThresholds(engineType: string): Promise<ThresholdSuggestion> {
  return apiGet<ThresholdSuggestion>('/ai/thresholds', { engineType });
}

export function approveThreshold(engineType: string, newValue: number): Promise<void> {
  return apiPost('/ai/thresholds/approve', { engineType, newValue });
}
