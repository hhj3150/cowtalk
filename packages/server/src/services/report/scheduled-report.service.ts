// 정기 보고서 발송 — 주간/월간/분기/성과 보고서를 만들고 메일로 보낸다
//
// 잡 주기는 15분이지만 발송은 기간당 한 번이다. 멱등의 축은 (schedule_id, period_key):
//   - 성공 1건이 원장에 있으면 다시 만들지 않는다 (DB 부분 유니크 인덱스가 최종 방어선)
//   - 실패는 같은 기간 안에서 최대 3회까지만 재시도한다 (SMTP 일시 장애는 넘기고,
//     설정 오류로 15분마다 영원히 실패 로그를 쌓지는 않게)
//
// 실패는 삼키지 않는다: 실패도 원장(report_deliveries.status='failed')에 사유와 함께 남는다.
// "지난주 메일이 왜 안 왔지"에 답할 수 없는 자동화는 없는 것만 못하다.

import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { and, count, eq, isNull, min } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { animals, farms, reportDeliveries, reportSchedules, sensorDevices } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { sendMail, normalizeRecipients, isMailConfigured } from '../../lib/mailer.js';
import { buildPeriodReport, type PeriodReport } from './period-report.service.js';
import {
  cumulativeStart,
  isDue,
  isWithinSubscription,
  kstDateStr,
  resolvePeriod,
  upcomingOccurrences,
  PERIOD_KIND_LABELS,
  type PeriodRange,
  type ReportPeriodKind,
  type ScheduledOccurrence,
} from './period.js';
import {
  buildAttachmentName,
  buildReportSheets,
  renderReportEmail,
  snapshotMetrics,
} from './report-email.js';
import { generateXlsx } from './generators/xlsxGenerator.js';
import { REPORT_CONFIG } from './config.js';

export type ReportSchedule = typeof reportSchedules.$inferSelect;

/** 같은 기간 안에서 실패를 재시도하는 최대 횟수 */
export const MAX_FAILED_ATTEMPTS_PER_PERIOD = 3;
/** 한 번의 잡 실행에서 처리할 최대 발송 건수 (잡이 무한정 길어지지 않게) */
export const MAX_DELIVERIES_PER_RUN = 20;

export interface ReportBundle {
  readonly period: PeriodRange;
  readonly current: PeriodReport;
  readonly previous: PeriodReport | null;
  readonly cumulative: { readonly report: PeriodReport; readonly label: string } | null;
  readonly subject: string;
}

/**
 * 발송 대상 기간의 보고서 일체를 만든다 (이번 기간 + 직전 기간 + 성과용 누적).
 * 농장이 없으면 null.
 */
export async function buildReportBundle(
  farmId: string,
  kind: ReportPeriodKind,
  now: Date,
): Promise<ReportBundle | null> {
  const period = resolvePeriod(kind, now);

  const current = await buildPeriodReport({
    farmId,
    start: period.start,
    end: period.end,
    periodTitle: `${period.title} ${PERIOD_KIND_LABELS[kind]}`,
  });
  if (!current) return null;

  const previous = await buildPeriodReport({
    farmId,
    start: period.previous.start,
    end: period.previous.end,
    periodTitle: `${period.previous.title} ${PERIOD_KIND_LABELS[kind]}`,
  });

  let cumulative: ReportBundle['cumulative'] = null;
  if (kind === 'performance') {
    const pilotStart = await getPilotStart(farmId);
    const since = cumulativeStart(period, pilotStart);
    const report = await buildPeriodReport({
      farmId,
      start: since,
      end: period.end,
      periodTitle: '파일럿 누적',
    });
    if (report) {
      cumulative = { report, label: `${kstDateStr(since)} ~ ${kstDateStr(new Date(period.end.getTime() - 1))}` };
    }
  }

  const { subject } = renderReportEmail({
    farmName: current.farmName,
    period,
    current,
    previous,
    cumulative,
  });

  return { period, current, previous, cumulative, subject };
}

/** 파일럿 시작 기준점 — 이 농장의 첫 센서 삽입일 (없으면 null → 12개월 누적으로 폴백) */
async function getPilotStart(farmId: string): Promise<Date | null> {
  const db = getDb();
  const [row] = await db
    .select({ first: min(sensorDevices.installDate) })
    .from(sensorDevices)
    .innerJoin(animals, eq(sensorDevices.animalId, animals.animalId))
    .where(eq(animals.farmId, farmId));
  return row?.first ?? null;
}

export interface DeliveryResult {
  readonly scheduleId: string;
  readonly farmId: string;
  readonly kind: ReportPeriodKind;
  readonly periodKey: string;
  readonly status: 'sent' | 'failed' | 'skipped';
  readonly reason?: string;
  readonly testMode: boolean;
  readonly recipients: readonly string[];
  readonly subject?: string;
  readonly attachmentName?: string;
}

export interface DeliverOptions {
  /** true = 사용자가 누른 즉시 발송 (기간 멱등을 건너뛰고, 이력에 manual 로 남는다) */
  readonly manual?: boolean;
}

/** 이 스케줄·이 기간에 이미 보냈거나 재시도를 소진했는지 (정기 발송만 해당) */
async function alreadyHandled(scheduleId: string, periodKey: string): Promise<'sent' | 'exhausted' | null> {
  const db = getDb();
  const rows = await db
    .select({ status: reportDeliveries.status, cnt: count() })
    .from(reportDeliveries)
    .where(
      and(
        eq(reportDeliveries.scheduleId, scheduleId),
        eq(reportDeliveries.periodKey, periodKey),
        eq(reportDeliveries.manual, false),
      ),
    )
    .groupBy(reportDeliveries.status);

  if (rows.some((r) => r.status === 'sent')) return 'sent';
  const failed = rows.find((r) => r.status === 'failed')?.cnt ?? 0;
  return Number(failed) >= MAX_FAILED_ATTEMPTS_PER_PERIOD ? 'exhausted' : null;
}

/** 보고서 1건 생성 + 발송 + 원장 기록 */
export async function deliverReport(
  schedule: ReportSchedule,
  now: Date,
  options: DeliverOptions = {},
): Promise<DeliveryResult> {
  const db = getDb();
  const manual = options.manual === true;
  const kind = schedule.kind as ReportPeriodKind;
  const period = resolvePeriod(kind, now);
  const recipients = normalizeRecipients((schedule.recipients as string[] | null) ?? []);

  const base = {
    scheduleId: schedule.scheduleId,
    farmId: schedule.farmId,
    kind,
    periodKey: period.periodKey,
    recipients,
  } as const;

  if (recipients.length === 0) {
    logger.warn({ scheduleId: schedule.scheduleId }, '[Report] 수신자가 없어 발송을 건너뜀');
    return { ...base, status: 'skipped', reason: '수신자 없음', testMode: false };
  }

  if (!manual) {
    const handled = await alreadyHandled(schedule.scheduleId, period.periodKey);
    if (handled === 'sent') return { ...base, status: 'skipped', reason: '이미 발송됨', testMode: false };
    if (handled === 'exhausted') {
      return { ...base, status: 'skipped', reason: '재시도 횟수 소진 (원장의 실패 사유 확인 필요)', testMode: false };
    }
  }

  let attachmentPath: string | null = null;
  let attachmentName: string | null = null;

  try {
    const bundle = await buildReportBundle(schedule.farmId, kind, now);
    if (!bundle) {
      await recordDelivery({
        schedule,
        period,
        recipients,
        status: 'failed',
        manual,
        errorMessage: '농장을 찾을 수 없습니다',
        testMode: false,
      });
      return { ...base, status: 'failed', reason: '농장을 찾을 수 없습니다', testMode: false };
    }

    const rendered = renderReportEmail({
      farmName: bundle.current.farmName,
      period: bundle.period,
      current: bundle.current,
      previous: bundle.previous,
      cumulative: bundle.cumulative,
    });

    if (schedule.format === 'xlsx') {
      attachmentName = buildAttachmentName(bundle.current.farmName, kind, period.periodKey);
      if (!fs.existsSync(REPORT_CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(REPORT_CONFIG.OUTPUT_DIR, { recursive: true });
      }
      attachmentPath = path.join(REPORT_CONFIG.OUTPUT_DIR, `${uuidv4()}_${attachmentName}`);
      const sheets = buildReportSheets({
        farmName: bundle.current.farmName,
        period: bundle.period,
        current: bundle.current,
        previous: bundle.previous,
        cumulative: bundle.cumulative,
      });
      await generateXlsx(sheets as unknown as Record<string, unknown>, attachmentPath);
    }

    const mail = await sendMail({
      to: recipients,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      attachments:
        attachmentPath && attachmentName
          ? [{ filename: attachmentName, path: attachmentPath }]
          : undefined,
    });

    await recordDelivery({
      schedule,
      period,
      recipients,
      status: mail.success ? 'sent' : 'failed',
      manual,
      errorMessage: mail.error ?? null,
      testMode: mail.testMode,
      subject: rendered.subject,
      attachmentName,
      summary: snapshotMetrics(bundle.current) as unknown as Record<string, unknown>,
    });

    if (mail.success && !manual) {
      await db
        .update(reportSchedules)
        .set({ lastPeriodKey: period.periodKey, lastSentAt: new Date(), updatedAt: new Date() })
        .where(eq(reportSchedules.scheduleId, schedule.scheduleId));
    }

    logger.info(
      {
        farmId: schedule.farmId,
        kind,
        periodKey: period.periodKey,
        recipients: recipients.length,
        testMode: mail.testMode,
        manual,
        success: mail.success,
      },
      '[Report] 정기 보고서 발송',
    );

    return {
      ...base,
      status: mail.success ? 'sent' : 'failed',
      reason: mail.error,
      testMode: mail.testMode,
      subject: rendered.subject,
      ...(attachmentName ? { attachmentName } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, scheduleId: schedule.scheduleId, kind }, '[Report] 보고서 생성·발송 실패');
    await recordDelivery({
      schedule,
      period,
      recipients,
      status: 'failed',
      manual,
      errorMessage: message,
      testMode: false,
    }).catch((recordErr: unknown) => {
      logger.error({ err: recordErr }, '[Report] 실패 이력 기록마저 실패');
    });
    return { ...base, status: 'failed', reason: message, testMode: false };
  }
}

interface RecordDeliveryInput {
  readonly schedule: ReportSchedule;
  readonly period: PeriodRange;
  readonly recipients: readonly string[];
  readonly status: 'sent' | 'failed';
  readonly manual: boolean;
  readonly errorMessage?: string | null;
  readonly testMode: boolean;
  readonly subject?: string;
  readonly attachmentName?: string | null;
  readonly summary?: Record<string, unknown>;
}

async function recordDelivery(input: RecordDeliveryInput): Promise<void> {
  const db = getDb();
  await db.insert(reportDeliveries).values({
    scheduleId: input.schedule.scheduleId,
    farmId: input.schedule.farmId,
    kind: input.schedule.kind,
    periodKey: input.period.periodKey,
    periodStart: input.period.start,
    periodEnd: input.period.end,
    recipients: [...input.recipients],
    status: input.status,
    subject: input.subject ?? null,
    summary: input.summary ?? null,
    attachmentName: input.attachmentName ?? null,
    testMode: input.testMode,
    manual: input.manual,
    errorMessage: input.errorMessage ?? null,
  });
}

export interface ScheduledRunSummary {
  readonly considered: number;
  readonly due: number;
  readonly sent: number;
  readonly failed: number;
  readonly skipped: number;
  readonly deferred: number;
}

/**
 * 15분 주기 잡 진입점 — 기간이 닫혔고 아직 안 보낸 구독을 찾아 발송한다.
 * 서버가 멈춰 있었어도 다음 깨어남에 밀린 보고서가 나간다 (isDue 참조).
 */
export async function runScheduledReports(now: Date = new Date()): Promise<ScheduledRunSummary> {
  const db = getDb();

  const rows = await db
    .select()
    .from(reportSchedules)
    .innerJoin(farms, eq(reportSchedules.farmId, farms.farmId))
    .where(and(eq(reportSchedules.enabled, true), eq(farms.status, 'active'), isNull(farms.deletedAt)));

  const schedules = rows.map((r) => r.report_schedules);
  // 구독 기간이 끝난 것은 발송하지 않는다. 행은 그대로 두고 화면에서 "기간 종료"로 보이게 한다 —
  // 배치가 사용자의 구독 상태를 몰래 바꾸지 않는다.
  const active = schedules.filter((s) => isWithinSubscription(now, s.endsAt));
  const expired = schedules.length - active.length;
  if (expired > 0) {
    logger.info({ expired }, '[Report] 구독 기간이 끝난 스케줄은 발송에서 제외 (연장·해지는 사용자 몫)');
  }
  const dueList = active.filter((s) =>
    isDue(resolvePeriod(s.kind as ReportPeriodKind, now), now, s.sendHourKst, s.lastPeriodKey),
  );

  if (dueList.length === 0) {
    return { considered: schedules.length, due: 0, sent: 0, failed: 0, skipped: 0, deferred: 0 };
  }

  if (!isMailConfigured()) {
    logger.warn(
      { due: dueList.length },
      '[Report] SMTP 미설정 — 보고서는 생성되지만 실제 메일은 나가지 않는다 (원장에 test_mode=true 로 기록)',
    );
  }

  const batch = dueList.slice(0, MAX_DELIVERIES_PER_RUN);
  const deferred = dueList.length - batch.length;
  if (deferred > 0) {
    logger.info({ deferred }, '[Report] 이번 실행 한도 초과분은 다음 주기로 미룸 (기간 키가 같아 그대로 이어짐)');
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const schedule of batch) {
    const result = await deliverReport(schedule, now);
    if (result.status === 'sent') sent++;
    else if (result.status === 'failed') failed++;
    else skipped++;
  }

  logger.info(
    { considered: schedules.length, due: dueList.length, sent, failed, skipped, deferred },
    '[Report] 정기 보고서 배치 완료',
  );

  return { considered: schedules.length, due: dueList.length, sent, failed, skipped, deferred };
}


// ======================================================================
// 발송 예정표 — "앞으로 1년 동안 언제 무엇이 오는가"
// ======================================================================

export interface ScheduleCalendarEntry {
  readonly scheduleId: string;
  readonly kind: ReportPeriodKind;
  readonly kindLabel: string;
  readonly enabled: boolean;
  readonly recipients: readonly string[];
  readonly endsAt: Date | null;
  /** 구독 기간이 이미 끝났는가 (지금 기준) */
  readonly expired: boolean;
  readonly occurrences: readonly ScheduledOccurrence[];
}

/**
 * 구독별 발송 예정 목록. 구독 종료일이 있으면 그 전까지만 — 오지 않을 보고서를
 * 예정표에 그려 넣지 않는다.
 */
export function buildScheduleCalendar(
  schedules: readonly ReportSchedule[],
  now: Date,
  months: number,
): ScheduleCalendarEntry[] {
  const horizon = new Date(now.getTime() + months * 30.5 * 86_400_000);

  return schedules.map((s) => {
    const kind = s.kind as ReportPeriodKind;
    const expired = !isWithinSubscription(now, s.endsAt);
    const until = s.endsAt && s.endsAt.getTime() < horizon.getTime() ? s.endsAt : horizon;
    return {
      scheduleId: s.scheduleId,
      kind,
      kindLabel: PERIOD_KIND_LABELS[kind] ?? kind,
      enabled: s.enabled,
      recipients: (s.recipients as string[] | null) ?? [],
      endsAt: s.endsAt,
      expired,
      occurrences: s.enabled && !expired ? upcomingOccurrences(kind, now, until, s.sendHourKst) : [],
    };
  });
}
