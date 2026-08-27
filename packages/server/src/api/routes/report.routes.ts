// 보고서 라우트 — /reports
//   GET  /farm/:farmId/monthly            월간 보고서 (기존 화면 계약 유지)
//   GET  /farm/:farmId/period             임의 주기 미리보기 (주간/월간/분기/성과)
//   GET  /schedules                       정기 발송 구독 목록
//   POST /schedules                       구독 등록·수정 (농장×주기 1건)
//   PATCH/DELETE /schedules/:scheduleId   구독 수정·해지
//   POST /schedules/:scheduleId/run-now   즉시 발송 (기간 멱등 무시)
//   GET  /deliveries                      발송 이력 (성공·실패·테스트모드까지 그대로)
//
// 집계 로직은 services/report/period-report.service.ts 하나로 모았다 —
// 주간·월간·분기가 기간만 다르고 계산은 같기 때문. 이 파일은 얇게 유지한다.

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { authenticate } from '../middleware/auth.js';
import { requirePermission, scopedFarmIds } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { reportSchedules, reportDeliveries } from '../../db/schema.js';
import { buildPeriodReport } from '../../services/report/period-report.service.js';
import {
  REPORT_PERIOD_KINDS,
  PERIOD_KIND_LABELS,
  isWithinSubscription,
  resolvePeriod,
  subscriptionEnd,
  type ReportPeriodKind,
} from '../../services/report/period.js';
import {
  deliverReport,
  buildReportBundle,
  buildScheduleCalendar,
} from '../../services/report/scheduled-report.service.js';
import { normalizeRecipients } from '../../lib/mailer.js';
import { logger } from '../../lib/logger.js';

export const reportRouter = Router();

reportRouter.use(authenticate);

interface MonthRange {
  readonly start: Date;
  readonly end: Date;
}

function parseMonthRange(month: string): MonthRange {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon || mon < 1 || mon > 12) {
    throw new Error('Invalid month format. Use YYYY-MM');
  }
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start, end };
}

/** 요청자가 그 농장을 다룰 수 있는가 (관리 역할은 scope=null → 전체 허용) */
function farmInScope(req: Request, farmId: string): boolean {
  const scope = scopedFarmIds(req);
  return scope === null || scope.includes(farmId);
}

// GET /reports/farm/:farmId/monthly?month=YYYY-MM
reportRouter.get(
  '/farm/:farmId/monthly',
  requirePermission('farm', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const farmId = req.params.farmId as string;
      const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);
      const { start, end } = parseMonthRange(month);

      const report = await buildPeriodReport({
        farmId,
        start,
        end,
        periodTitle: `${month} 월간`,
      });

      if (!report) {
        res.status(404).json({ success: false, error: '농장을 찾을 수 없습니다' });
        return;
      }

      // 기존 응답 계약 유지 — month 필드는 그대로 둔다 (웹 월간 보고서 화면이 사용)
      res.json({ ...report, month });
    } catch (error) {
      next(error);
    }
  },
);

// GET /reports/farm/:farmId/period?kind=weekly — 발송될 보고서를 메일 없이 미리 본다
reportRouter.get(
  '/farm/:farmId/period',
  requirePermission('farm', 'read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const farmId = req.params.farmId as string;
      const kind = (req.query.kind as string | undefined) ?? 'weekly';
      if (!REPORT_PERIOD_KINDS.includes(kind as ReportPeriodKind)) {
        res.status(400).json({ success: false, error: `지원 주기: ${REPORT_PERIOD_KINDS.join(', ')}` });
        return;
      }
      if (!farmInScope(req, farmId)) {
        res.status(403).json({ success: false, error: '해당 농장에 접근 권한이 없습니다' });
        return;
      }

      const bundle = await buildReportBundle(farmId, kind as ReportPeriodKind, new Date());
      if (!bundle) {
        res.status(404).json({ success: false, error: '농장을 찾을 수 없습니다' });
        return;
      }

      res.json({
        success: true,
        data: {
          kind,
          kindLabel: PERIOD_KIND_LABELS[kind as ReportPeriodKind],
          period: {
            periodKey: bundle.period.periodKey,
            label: bundle.period.label,
            title: bundle.period.title,
            start: bundle.period.start,
            end: bundle.period.end,
          },
          report: bundle.current,
          previous: bundle.previous,
          cumulative: bundle.cumulative,
          subject: bundle.subject,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ======================================================================
// 정기 발송 구독
// ======================================================================

const scheduleCreateSchema = z.object({
  farmId: z.string().uuid(),
  kind: z.enum(['weekly', 'monthly', 'quarterly', 'performance', 'annual']),
  recipients: z.array(z.string().email()).min(1).max(5),
  format: z.enum(['xlsx', 'none']).optional(),
  sendHourKst: z.number().int().min(0).max(23).optional(),
  enabled: z.boolean().optional(),
  /** 구독 종료일 (ISO). 생략 시 기존 값 유지, null 이면 무기한 */
  endsAt: z.string().datetime().nullable().optional(),
  /** 종료일 대신 개월 수로 지정 (예: 12 = 1년 구독). endsAt 이 있으면 무시 */
  durationMonths: z.number().int().min(1).max(60).optional(),
});

const scheduleUpdateSchema = z.object({
  recipients: z.array(z.string().email()).min(1).max(5).optional(),
  format: z.enum(['xlsx', 'none']).optional(),
  sendHourKst: z.number().int().min(0).max(23).optional(),
  enabled: z.boolean().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  durationMonths: z.number().int().min(1).max(60).optional(),
});

/**
 * 구독 종료일 결정 — 명시 endsAt 우선, 없으면 durationMonths 로 계산.
 * 둘 다 없으면 undefined(= 기존 값 유지), null 이면 무기한으로 되돌린다.
 */
function resolveEndsAt(
  endsAt: string | null | undefined,
  durationMonths: number | undefined,
): Date | null | undefined {
  if (endsAt === null) return null;
  if (typeof endsAt === 'string') return new Date(endsAt);
  if (durationMonths != null) return subscriptionEnd(new Date(), durationMonths);
  return undefined;
}

/** 목록 조회 스코프 조건 — 배정 농장만 (관리 역할은 전체) */
function scheduleScopeCondition(req: Request): SQL | undefined {
  const scope = scopedFarmIds(req);
  if (scope === null) return undefined;
  return inArray(reportSchedules.farmId, [...scope]);
}

// GET /reports/schedules
reportRouter.get('/schedules', requirePermission('farm', 'read'), async (req, res, next) => {
  try {
    const db = getDb();
    const farmId = req.query.farmId as string | undefined;
    const scopeCond = scheduleScopeCondition(req);
    const conditions = [scopeCond, farmId ? eq(reportSchedules.farmId, farmId) : undefined]
      .filter((c): c is SQL => c !== undefined);

    const rows = await db
      .select()
      .from(reportSchedules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reportSchedules.createdAt))
      .limit(200);

    res.json({
      success: true,
      data: rows.map((r) => ({
        ...r,
        kindLabel: PERIOD_KIND_LABELS[r.kind as ReportPeriodKind] ?? r.kind,
        nextPeriodKey: resolvePeriod(r.kind as ReportPeriodKind, new Date()).periodKey,
        /** 구독 기간이 끝났는가 — 끝나도 행은 남는다 (연장·해지는 사용자가 결정) */
        expired: !isWithinSubscription(new Date(), r.endsAt),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /reports/schedules/calendar?farmId=&months=12 — 앞으로 1년 동안 무엇이 언제 오는지
reportRouter.get('/schedules/calendar', requirePermission('farm', 'read'), async (req, res, next) => {
  try {
    const db = getDb();
    const farmId = req.query.farmId as string | undefined;
    const months = Math.min(Math.max(Number(req.query.months ?? 12) || 12, 1), 24);
    const scopeCond = scheduleScopeCondition(req);
    const conditions = [scopeCond, farmId ? eq(reportSchedules.farmId, farmId) : undefined]
      .filter((c): c is SQL => c !== undefined);

    const rows = await db
      .select()
      .from(reportSchedules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(50);

    const now = new Date();
    const entries = buildScheduleCalendar(rows, now, months);

    res.json({
      success: true,
      data: {
        months,
        generatedAt: now,
        entries,
        totalPlanned: entries.reduce((sum, e) => sum + e.occurrences.length, 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /reports/schedules — 농장×주기 1건 (있으면 갱신)
reportRouter.post('/schedules', requirePermission('farm', 'read'), async (req, res, next) => {
  try {
    const parsed = scheduleCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? '입력값 오류' });
      return;
    }
    const input = parsed.data;
    if (!farmInScope(req, input.farmId)) {
      res.status(403).json({ success: false, error: '해당 농장에 접근 권한이 없습니다' });
      return;
    }
    const recipients = normalizeRecipients(input.recipients);
    if (recipients.length === 0) {
      res.status(400).json({ success: false, error: '유효한 이메일 주소가 없습니다' });
      return;
    }

    const endsAt = resolveEndsAt(input.endsAt, input.durationMonths);

    const db = getDb();
    const [row] = await db
      .insert(reportSchedules)
      .values({
        farmId: input.farmId,
        kind: input.kind,
        recipients,
        format: input.format ?? 'xlsx',
        sendHourKst: input.sendHourKst ?? 7,
        enabled: input.enabled ?? true,
        ...(endsAt !== undefined ? { endsAt } : {}),
        createdBy: req.user?.userId ?? null,
      })
      .onConflictDoUpdate({
        target: [reportSchedules.farmId, reportSchedules.kind],
        set: {
          recipients,
          format: input.format ?? 'xlsx',
          sendHourKst: input.sendHourKst ?? 7,
          enabled: input.enabled ?? true,
          ...(endsAt !== undefined ? { endsAt } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();

    logger.info(
      { farmId: input.farmId, kind: input.kind, recipients: recipients.length, by: req.user?.userId },
      '[Report] 정기 보고서 구독 저장',
    );
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
});

// PATCH /reports/schedules/:scheduleId
reportRouter.patch('/schedules/:scheduleId', requirePermission('farm', 'read'), async (req, res, next) => {
  try {
    const parsed = scheduleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? '입력값 오류' });
      return;
    }
    const db = getDb();
    const scheduleId = req.params.scheduleId as string;
    const [existing] = await db
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.scheduleId, scheduleId));

    if (!existing || !farmInScope(req, existing.farmId)) {
      res.status(404).json({ success: false, error: '구독을 찾을 수 없습니다' });
      return;
    }

    const patch = parsed.data;
    const recipients = patch.recipients ? normalizeRecipients(patch.recipients) : undefined;
    if (patch.recipients && (!recipients || recipients.length === 0)) {
      res.status(400).json({ success: false, error: '유효한 이메일 주소가 없습니다' });
      return;
    }

    const endsAt = resolveEndsAt(patch.endsAt, patch.durationMonths);

    const [row] = await db
      .update(reportSchedules)
      .set({
        ...(recipients ? { recipients } : {}),
        ...(patch.format ? { format: patch.format } : {}),
        ...(patch.sendHourKst != null ? { sendHourKst: patch.sendHourKst } : {}),
        ...(patch.enabled != null ? { enabled: patch.enabled } : {}),
        ...(endsAt !== undefined ? { endsAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(reportSchedules.scheduleId, scheduleId))
      .returning();

    res.json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
});

// DELETE /reports/schedules/:scheduleId
reportRouter.delete('/schedules/:scheduleId', requirePermission('farm', 'read'), async (req, res, next) => {
  try {
    const db = getDb();
    const scheduleId = req.params.scheduleId as string;
    const [existing] = await db
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.scheduleId, scheduleId));

    if (!existing || !farmInScope(req, existing.farmId)) {
      res.status(404).json({ success: false, error: '구독을 찾을 수 없습니다' });
      return;
    }

    await db.delete(reportSchedules).where(eq(reportSchedules.scheduleId, scheduleId));
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /reports/schedules/:scheduleId/run-now — 지금 한 통 (기간 멱등 무시, 이력은 manual=true)
reportRouter.post('/schedules/:scheduleId/run-now', requirePermission('farm', 'read'), async (req, res, next) => {
  try {
    const db = getDb();
    const scheduleId = req.params.scheduleId as string;
    const [schedule] = await db
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.scheduleId, scheduleId));

    if (!schedule || !farmInScope(req, schedule.farmId)) {
      res.status(404).json({ success: false, error: '구독을 찾을 수 없습니다' });
      return;
    }

    const result = await deliverReport(schedule, new Date(), { manual: true });
    res.json({ success: result.status === 'sent', data: result });
  } catch (error) {
    next(error);
  }
});

// GET /reports/deliveries?farmId=&limit=
reportRouter.get('/deliveries', requirePermission('farm', 'read'), async (req, res, next) => {
  try {
    const db = getDb();
    const farmId = req.query.farmId as string | undefined;
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const scope = scopedFarmIds(req);

    const conditions = [
      scope === null ? undefined : inArray(reportDeliveries.farmId, [...scope]),
      farmId ? eq(reportDeliveries.farmId, farmId) : undefined,
    ].filter((c): c is SQL => c !== undefined);

    const rows = await db
      .select()
      .from(reportDeliveries)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reportDeliveries.createdAt))
      .limit(limit);

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});
