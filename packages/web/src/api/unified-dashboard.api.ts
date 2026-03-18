// 통합 대시보드 API 클라이언트

import { apiGet } from './client';
import type { UnifiedDashboardData, LiveAlarm, DashboardFarmRanking } from '@cowtalk/shared';

export interface UnifiedDashboardParams {
  readonly farmId?: string;
  readonly period?: '7d' | '14d' | '30d';
}

export type { UnifiedDashboardData };

export function getUnifiedDashboard(
  params?: UnifiedDashboardParams,
): Promise<UnifiedDashboardData> {
  const searchParams = new URLSearchParams();
  if (params?.farmId) searchParams.set('farmId', params.farmId);
  if (params?.period) searchParams.set('period', params.period);
  const query = searchParams.toString();
  return apiGet<UnifiedDashboardData>(
    `/unified-dashboard${query ? `?${query}` : ''}`,
  );
}

export function getLiveAlarms(farmId?: string): Promise<{ alarms: readonly LiveAlarm[] }> {
  const query = farmId ? `?farmId=${farmId}` : '';
  return apiGet<{ alarms: readonly LiveAlarm[] }>(`/unified-dashboard/live-alarms${query}`);
}

export function getFarmRanking(): Promise<{ rankings: readonly DashboardFarmRanking[] }> {
  return apiGet<{ rankings: readonly DashboardFarmRanking[] }>('/unified-dashboard/farm-ranking');
}
