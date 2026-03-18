// 알림 API

import { apiGet, apiPatch } from './client';
import type { PaginatedResult } from '@cowtalk/shared';
import type { AlertItem } from './dashboard.api';

export function listAlerts(params?: {
  farmId?: string;
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResult<AlertItem>> {
  return apiGet<PaginatedResult<AlertItem>>('/alerts', params);
}

export function getAlert(alertId: string): Promise<AlertItem> {
  return apiGet<AlertItem>(`/alerts/${alertId}`);
}

export function updateAlertStatus(
  alertId: string,
  status: string,
  notes?: string,
): Promise<AlertItem> {
  return apiPatch<AlertItem>(`/alerts/${alertId}/status`, { status, notes });
}
