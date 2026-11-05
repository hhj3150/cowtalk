// 행동 일별 지표 API — 우군·그룹 단위 휴식(횡와)·기립·이동·반추 자세

import { apiGet, apiPost } from './client';
import type { BehaviorDailyInput, BehaviorDailyRecord } from '@cowtalk/shared';

export interface BehaviorDailyResponse {
  readonly farmId: string;
  readonly days: number;
  readonly records: readonly BehaviorDailyRecord[];
}

export function getBehaviorDaily(farmId: string, days = 30): Promise<BehaviorDailyResponse> {
  return apiGet<BehaviorDailyResponse>('/behavior/daily', { farmId, days });
}

export function saveBehaviorDaily(
  farmId: string,
  rows: readonly BehaviorDailyInput[],
  source: 'csv_upload' | 'manual' = 'csv_upload',
): Promise<{ readonly saved: number }> {
  return apiPost<{ readonly saved: number }>('/behavior/daily', { farmId, source, rows });
}
