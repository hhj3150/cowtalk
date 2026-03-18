// 대시보드 API — 역할별 자동 분기

import { apiGet } from './client';

export interface KpiItem {
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly trend: 'up' | 'down' | 'stable';
  readonly trendValue: number | null;
  readonly drilldownType: string | null;
  readonly severity: string | null;
}

export interface ActionItem {
  readonly id: string;
  readonly priority: number;
  readonly action: string;
  readonly target: string;
  readonly urgency: string;
  readonly animalId: string | null;
  readonly farmId: string | null;
}

export interface AlertItem {
  readonly alertId: string;
  readonly title: string;
  readonly message: string;
  readonly severity: string;
  readonly type: string;
  readonly animalId: string | null;
  readonly farmId: string;
  readonly createdAt: string;
}

export interface InsightItem {
  readonly title: string;
  readonly description: string;
  readonly source: string;
}

export interface DashboardData {
  readonly kpis: readonly KpiItem[];
  readonly todayActions: readonly ActionItem[];
  readonly alerts: readonly AlertItem[];
  readonly insights: readonly InsightItem[];
  readonly roleData?: Record<string, unknown>;
}

export function getDashboard(params?: {
  farmId?: string;
  regionId?: string;
  tenantId?: string;
}): Promise<DashboardData> {
  return apiGet<DashboardData>('/dashboard', params);
}

export function getDashboardKpis(params?: {
  farmId?: string;
  regionId?: string;
  tenantId?: string;
}): Promise<{ kpis: readonly KpiItem[] }> {
  return apiGet<{ kpis: readonly KpiItem[] }>('/dashboard/kpi', params);
}
