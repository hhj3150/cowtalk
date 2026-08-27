// 정기 보고서 API — 주간/월간/분기/성과 보고서 구독·발송 이력·즉시 발송

import { apiGet, apiPost, apiPatch, apiDelete } from './client';

export type ReportKind = 'weekly' | 'monthly' | 'quarterly' | 'performance';

export const REPORT_KIND_LABELS: Readonly<Record<ReportKind, string>> = {
  weekly: '주간',
  monthly: '월간',
  quarterly: '분기',
  performance: '성과',
};

export interface ReportSchedule {
  readonly scheduleId: string;
  readonly farmId: string;
  readonly kind: ReportKind;
  readonly recipients: readonly string[];
  readonly format: 'xlsx' | 'none';
  readonly sendHourKst: number;
  readonly enabled: boolean;
  readonly lastPeriodKey: string | null;
  readonly lastSentAt: string | null;
  readonly kindLabel: string;
  readonly nextPeriodKey: string;
}

export interface ReportDelivery {
  readonly deliveryId: string;
  readonly farmId: string;
  readonly kind: ReportKind;
  readonly periodKey: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly recipients: readonly string[];
  readonly status: 'sent' | 'failed';
  readonly subject: string | null;
  readonly attachmentName: string | null;
  readonly testMode: boolean;
  readonly manual: boolean;
  readonly errorMessage: string | null;
  readonly createdAt: string;
}

export interface CreateScheduleInput {
  readonly farmId: string;
  readonly kind: ReportKind;
  readonly recipients: readonly string[];
  readonly format?: 'xlsx' | 'none';
  readonly sendHourKst?: number;
  readonly enabled?: boolean;
}

export interface RunNowResult {
  readonly status: 'sent' | 'failed' | 'skipped';
  readonly reason?: string;
  readonly testMode: boolean;
  readonly recipients: readonly string[];
  readonly subject?: string;
}

export function fetchReportSchedules(farmId?: string): Promise<readonly ReportSchedule[]> {
  return apiGet<readonly ReportSchedule[]>('/reports/schedules', farmId ? { farmId } : undefined);
}

export function saveReportSchedule(input: CreateScheduleInput): Promise<ReportSchedule> {
  return apiPost<ReportSchedule>('/reports/schedules', input);
}

export function updateReportSchedule(
  scheduleId: string,
  patch: Partial<Pick<ReportSchedule, 'enabled' | 'format' | 'sendHourKst'>> & { recipients?: readonly string[] },
): Promise<ReportSchedule> {
  return apiPatch<ReportSchedule>(`/reports/schedules/${scheduleId}`, patch);
}

export function deleteReportSchedule(scheduleId: string): Promise<unknown> {
  return apiDelete<unknown>(`/reports/schedules/${scheduleId}`);
}

export function runReportNow(scheduleId: string): Promise<RunNowResult> {
  return apiPost<RunNowResult>(`/reports/schedules/${scheduleId}/run-now`, {});
}

export function fetchReportDeliveries(farmId?: string): Promise<readonly ReportDelivery[]> {
  return apiGet<readonly ReportDelivery[]>('/reports/deliveries', farmId ? { farmId } : undefined);
}
