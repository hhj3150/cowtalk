// 방역관 전용 API
// GET  /quarantine/dashboard          — 대시보드 종합 데이터
// GET  /quarantine/action-queue       — 당일 업무 큐
// PATCH /quarantine/action/:id        — 업무 상태 변경
// GET  /quarantine/early-detection-metrics — 조기감지 성과
// GET  /quarantine/national-situation — 전국 방역 현황
// GET  /quarantine/national-situation/:province — 시도 드릴다운 (시군구)
// GET  /quarantine/province-farms/:province     — 시도 농장 목록 드릴다운
// GET  /quarantine/cases              — 방역 사례 DB (경보 + 피드백 + 정확도)

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { getQuarantineDashboard, getActionQueue, getVaccinationStatus } from '../../services/epidemiology/quarantine-dashboard.service.js';
import { getEarlyDetectionMetrics } from '../../services/epidemiology/early-detection-metrics.service.js';
import { getNationalSituation, getProvinceDetail, getProvinceFarms, getAllMapFarms } from '../../services/epidemiology/national-situation.service.js';
import { getDb } from '../../config/database.js';
import { smaxtecEvents, farms, feedback } from '../../db/schema.js';
import { eq, desc, count, sql, ilike, or } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export const quarantineDashboardRouter = Router();

quarantineDashboardRouter.use(authenticate);

// ===========================
// GET /quarantine/dashboard
// ===========================

quarantineDashboardRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const data = await getQuarantineDashboard();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/action-queue
// ===========================

quarantineDashboardRouter.get('/action-queue', async (_req, res, next) => {
  try {
    const queue = await getActionQueue();
    res.json({ success: true, data: queue });
  } catch (err) {
    next(err);
  }
});

// ===========================
// PATCH /quarantine/action/:id
// ===========================

const actionPatchSchema = z.object({
  status: z.enum(['pending', 'dispatched', 'phone_confirmed', 'monitoring', 'completed']),
});

quarantineDashboardRouter.patch('/action/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = actionPatchSchema.parse(req.body);

    // 실제 구현: alerts 테이블 상태 업데이트
    // 데모: 응답만 반환
    logger.info({ id, status: body.status }, '[Quarantine] 업무 상태 변경');

    res.json({ success: true, data: { actionId: id, status: body.status } });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/early-detection-metrics
// ===========================

quarantineDashboardRouter.get('/early-detection-metrics', async (_req, res, next) => {
  try {
    const data = await getEarlyDetectionMetrics();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/national-situation
// ===========================

quarantineDashboardRouter.get('/national-situation', async (_req, res, next) => {
  try {
    const data = await getNationalSituation();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/national-situation/:province
// ===========================

quarantineDashboardRouter.get('/national-situation/:province', async (req, res, next) => {
  try {
    const province = decodeURIComponent(req.params.province ?? '');
    if (!province) {
      res.status(400).json({ success: false, error: 'province required' });
      return;
    }
    const data = await getProvinceDetail(province);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/province-farms/:province
// ===========================

quarantineDashboardRouter.get('/province-farms/:province', async (req, res, next) => {
  try {
    const province = decodeURIComponent(req.params.province ?? '');
    if (!province) {
      res.status(400).json({ success: false, error: 'province required' });
      return;
    }
    const data = await getProvinceFarms(province);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/map-farms — 전체 농장 지도 마커 데이터
// ===========================

quarantineDashboardRouter.get('/map-farms', async (_req, res, next) => {
  try {
    const data = await getAllMapFarms();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/vaccination-status — 접종 현황 (법정 백신 프로토콜별)
// ===========================

quarantineDashboardRouter.get('/vaccination-status', async (_req, res, next) => {
  try {
    const data = await getVaccinationStatus();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/cases — 방역 사례 DB (경보 이력 + 피드백 + 정확도)
// ===========================

quarantineDashboardRouter.get('/cases', async (req, res, next) => {
  try {
    const db = getDb();
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;
    const outcomeFilter = req.query.outcome as string | undefined;
    const search = req.query.search as string | undefined;

    // smaxtec_events + farms + feedback(최신 1건) JOIN
    const casesRaw = await db
      .select({
        alertId: smaxtecEvents.eventId,
        farmId: smaxtecEvents.farmId,
        farmName: farms.name,
        eventType: smaxtecEvents.eventType,
        severity: smaxtecEvents.severity,
        stage: smaxtecEvents.stage,
        confidence: smaxtecEvents.confidence,
        detectedAt: smaxtecEvents.detectedAt,
        acknowledged: smaxtecEvents.acknowledged,
        details: smaxtecEvents.details,
        feedbackType: feedback.feedbackType,
      })
      .from(smaxtecEvents)
      .leftJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
      .leftJoin(feedback, eq(smaxtecEvents.eventId, feedback.alertId))
      .where(
        search
          ? or(
              ilike(farms.name, `%${search}%`),
              ilike(smaxtecEvents.eventType, `%${search}%`),
            )
          : undefined,
      )
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(limit + 50) // 필터링 여유분
      .offset(offset);

    // outcome 매핑 + 필터
    type Outcome = 'true_positive' | 'false_positive' | 'pending';
    function mapOutcome(feedbackType: string | null): Outcome {
      if (!feedbackType) return 'pending';
      if (feedbackType === 'alert_false_positive' || feedbackType === 'disease_excluded') return 'false_positive';
      return 'true_positive';
    }

    const EVENT_TITLES: Record<string, string> = {
      fever: '체온 이상 감지',
      health_warning: '건강 경고',
      estrus: '발정 감지',
      calving: '분만 감지',
      rumination_low: '반추 저하',
      activity_low: '활동량 저하',
      cluster_fever: '집단 발열 감지',
    };

    const SEVERITY_TO_PRIORITY: Record<string, string> = {
      critical: 'critical',
      high: 'high',
      medium: 'medium',
      low: 'low',
    };

    const mapped = casesRaw.map((r) => {
      const outcome = mapOutcome(r.feedbackType);
      const detailsObj = (r.details ?? {}) as Record<string, unknown>;
      return {
        alertId: r.alertId,
        farmId: r.farmId ?? '',
        farmName: r.farmName ?? '알 수 없음',
        alertType: r.eventType ?? 'fever',
        priority: SEVERITY_TO_PRIORITY[r.severity ?? 'medium'] ?? 'medium',
        title: EVENT_TITLES[r.eventType ?? ''] ?? (r.eventType ?? '알림'),
        createdAt: r.detectedAt ? new Date(r.detectedAt).toISOString() : new Date().toISOString(),
        status: r.acknowledged ? 'acknowledged' : 'new',
        outcome,
        diseaseName: (detailsObj.diseaseName as string) ?? null,
        dsiScore: typeof detailsObj.dsiScore === 'number' ? detailsObj.dsiScore : null,
      };
    });

    // outcome 필터 적용
    const filtered = outcomeFilter && outcomeFilter !== 'all'
      ? mapped.filter((c) => c.outcome === outcomeFilter)
      : mapped;

    const cases = filtered.slice(0, limit);

    // 정확도 통계 (전체 데이터 기반)
    const [totalRows] = await db.select({ count: count() }).from(smaxtecEvents);
    const totalEvents = totalRows?.count ?? 0;

    const [tpRows] = await db
      .select({ count: count() })
      .from(feedback)
      .where(
        sql`${feedback.feedbackType} NOT IN ('alert_false_positive', 'disease_excluded') AND ${feedback.alertId} IS NOT NULL`,
      );
    const tp = tpRows?.count ?? 0;

    const [fpRows] = await db
      .select({ count: count() })
      .from(feedback)
      .where(
        sql`${feedback.feedbackType} IN ('alert_false_positive', 'disease_excluded') AND ${feedback.alertId} IS NOT NULL`,
      );
    const fp = fpRows?.count ?? 0;

    const pendingCount = Math.max(0, totalEvents - tp - fp);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = totalEvents > 0 ? tp / (tp + pendingCount * 0.5) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    res.json({
      success: true,
      data: {
        cases,
        accuracy: {
          precision: Math.round(precision * 1000) / 1000,
          recall: Math.round(recall * 1000) / 1000,
          f1: Math.round(f1 * 1000) / 1000,
          totalCases: totalEvents,
          truePositives: tp,
          falsePositives: fp,
          pending: pendingCount,
        },
        pagination: {
          page,
          limit,
          total: totalEvents,
          totalPages: Math.ceil(totalEvents / limit),
        },
      },
    });
  } catch (err) {
    logger.error(err, '[Quarantine] cases 조회 실패');
    next(err);
  }
});
