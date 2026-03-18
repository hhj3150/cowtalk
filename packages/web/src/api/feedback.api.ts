// 피드백 API

import { apiPost, apiGet } from './client';
import type { PaginatedResult } from '@cowtalk/shared';

export type FeedbackType =
  | 'estrus_confirmed'
  | 'estrus_false_positive'
  | 'disease_confirmed'
  | 'disease_excluded'
  | 'treatment_response'
  | 'insemination_done'
  | 'pregnancy_confirmed'
  | 'pregnancy_negative'
  | 'alert_acknowledged'
  | 'alert_dismissed'
  | 'alert_false_positive'
  | 'action_accepted'
  | 'action_rejected';

export interface FeedbackInput {
  readonly type: FeedbackType;
  readonly predictionId: string | null;
  readonly alertId: string | null;
  readonly animalId: string | null;
  readonly farmId: string;
  readonly notes: string | null;
}

export interface FeedbackRecord {
  readonly feedbackId: string;
  readonly type: FeedbackType;
  readonly predictionId: string | null;
  readonly animalId: string | null;
  readonly farmId: string;
  readonly userId: string;
  readonly createdAt: string;
  readonly notes: string | null;
}

export function submitFeedback(data: FeedbackInput): Promise<FeedbackRecord> {
  return apiPost<FeedbackRecord>('/feedback', data);
}

export function listFeedback(params?: {
  farmId?: string;
  type?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<FeedbackRecord>> {
  return apiGet<PaginatedResult<FeedbackRecord>>('/feedback', params);
}
