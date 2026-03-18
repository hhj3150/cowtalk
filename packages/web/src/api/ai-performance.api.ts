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

export interface PerformanceOverview {
  readonly engines: readonly EngineMetrics[];
  readonly totalPredictions: number;
  readonly totalFeedback: number;
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

export function getThresholds(engineType: string): Promise<ThresholdSuggestion> {
  return apiGet<ThresholdSuggestion>('/ai/thresholds', { engineType });
}

export function approveThreshold(engineType: string, newValue: number): Promise<void> {
  return apiPost('/ai/thresholds/approve', { engineType, newValue });
}
