// 정기 보고서 API — 주간/월간/분기/성과 보고서 구독·발송 이력·즉시 발송

import { apiGet, apiPost, apiPatch, apiDelete } from './client';

export type ReportKind = 'weekly' | 'monthly' | 'quarterly' | 'performance' | 'annual';

export const REPORT_KIND_LABELS: Readonly<Record<ReportKind, string>> = {
  weekly: '주간',
  monthly: '월간',
  quarterly: '분기',
  performance: '성과',
  annual: '연간',
};

export interface ReportSchedule {
  readonly scheduleId: string;
  readonly farmId: string;
  readonly kind: ReportKind;
  readonly recipients: readonly string[];
  readonly format: 'xlsx' | 'none';
  readonly sendHourKst: number;
  readonly enabled: boolean;
  /** 구독 종료일 (ISO). null = 무기한 */
  readonly endsAt: string | null;
  /** 구독 기간이 끝났는가 — 끝나도 행은 남는다 */
  readonly expired: boolean;
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
  /** 구독 기간 (개월). 12 = 1년 구독 */
  readonly durationMonths?: number;
  readonly endsAt?: string | null;
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
  patch: Partial<Pick<ReportSchedule, 'enabled' | 'format' | 'sendHourKst'>> & {
    recipients?: readonly string[];
    durationMonths?: number;
    endsAt?: string | null;
  },
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

// ── 발송 예정표 ──

export interface ScheduledOccurrence {
  readonly kind: ReportKind;
  readonly sendAt: string;
  readonly periodKey: string;
  readonly periodLabel: string;
  readonly periodTitle: string;
}

export interface ScheduleCalendarEntry {
  readonly scheduleId: string;
  readonly kind: ReportKind;
  readonly kindLabel: string;
  readonly enabled: boolean;
  readonly recipients: readonly string[];
  readonly endsAt: string | null;
  readonly expired: boolean;
  readonly occurrences: readonly ScheduledOccurrence[];
}

export interface ScheduleCalendar {
  readonly months: number;
  readonly generatedAt: string;
  readonly entries: readonly ScheduleCalendarEntry[];
  readonly totalPlanned: number;
}

export function fetchScheduleCalendar(farmId?: string, months = 12): Promise<ScheduleCalendar> {
  return apiGet<ScheduleCalendar>('/reports/schedules/calendar', { ...(farmId ? { farmId } : {}), months });
}
