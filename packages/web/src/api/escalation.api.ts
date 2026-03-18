// 알림 에스컬레이션 API

import { apiGet, apiPost } from './client';

export type EscalationLevel = 1 | 2 | 3 | 4;

export interface EscalationRecord {
  readonly escalationId: string;
  readonly alertId: string;
  readonly alertTitle: string;
  readonly severity: string;
  readonly currentLevel: EscalationLevel;
  readonly escalatedAt: string;
  readonly acknowledgedBy: string | null;
  readonly acknowledgedAt: string | null;
  readonly avgResponseMinutes: number | null;
}

export interface EscalationConfig {
  readonly severity: string;
  readonly level1Targets: readonly string[];
  readonly level2DelayMinutes: number;
  readonly level2Targets: readonly string[];
  readonly level3DelayMinutes: number;
  readonly level3Targets: readonly string[];
  readonly level4DelayMinutes: number;
  readonly nightOnly: 'critical' | 'all' | 'none';
}

export function getUnacknowledgedAlerts(): Promise<readonly EscalationRecord[]> {
  return apiGet<readonly EscalationRecord[]>('/escalation/unacknowledged');
}

export function acknowledgeAlert(alertId: string): Promise<void> {
  return apiPost(`/escalation/acknowledge/${alertId}`, {});
}

export function getEscalationConfig(): Promise<readonly EscalationConfig[]> {
  return apiGet<readonly EscalationConfig[]>('/escalation/config');
}

export function getEscalationStats(): Promise<{
  readonly totalEscalated: number;
  readonly avgResponseMinutes: number;
  readonly unacknowledged: number;
}> {
  return apiGet('/escalation/stats');
}
