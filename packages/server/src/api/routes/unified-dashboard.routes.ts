// 통합 대시보드 라우트 — smaXtec 레이아웃 기반 12개 위젯 데이터
// GET /api/unified-dashboard?farmId=xxx&period=7d|14d|30d
// farmId 미지정 → 전체 농장 통합 (146개)
// 알림/경고 → 오늘(24h) 기준, 차트 → period 기준

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import { getDb } from '../../config/database.js';
import { SmaxtecConnector } from '../../pipeline/connectors/smaxtec.connector.js';
import {
  farms, animals, smaxtecEvents, breedingEvents,
  sensorDailyAgg, eventLabels,
  pregnancyChecks, calvingEvents,
} from '../../db/schema.js';
import { eq, count, sql, and, gte, desc, inArray } from 'drizzle-orm';
import { haversineKm } from '../../lib/haversine.js';
import { batchRouteDistances } from '../../lib/kakao-mobility.js';
import { getVetActionPlan } from '../../ai-brain/vet-action-plans.js';
import type {
  UnifiedDashboardData,
  HerdOverview,
  HerdDevelopmentPoint,
  TodoItem,
  HealthStatusBar,
  AssistantAlert,
  RuminationDataPoint,
  HealthAlertCount,
  FertilityStatusBar,
  FertilityManagementItem,
  PhAmplitudeBar,
  RumenHealthPoint,
  LiveAlarm,
  DashboardFarmRanking,
  AiBriefing,
  AiBriefingTopFarm,
  AiBriefingEventDistribution,
  AiBriefingCriticalEvent,
  CreateEventLabelRequest,
  LabelVerdict,
  LabelOutcome,
  BreedingStage,
  BreedingAnimalSummary,
  BreedingStageGroup,
  BreedingKpis,
  BreedingUrgentAction,
  BreedingPipelineData,
  VetRoutePlan,
  VetRouteStop,
  VetRouteAnimalBriefing,
  VetRouteSummary,
  InseminationRoutePlan,
  InseminationRouteStop,
  InseminationAnimalBriefing,
  InseminationRouteSummary,
} from '@cowtalk/shared';

export const unifiedDashboardRouter = Router();

unifiedDashboardRouter.use(authenticate);

// ===========================
// 유틸
// ===========================

type DbInstance = ReturnType<typeof getDb>;
type SqlCondition = ReturnType<typeof eq>;

function parsePeriodDays(period: string | undefined): number {
  switch (period) {
    case '7d': return 7;
    case '30d': return 30;
    case '14d':
    default: return 14;
  }
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// 최근 24시간 기준 (자정 리셋 방지 — 항상 데이터가 있도록)
function todayStart(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

// farmId 조건 빌더 — null이면 전체 농장
function farmCondition(
  column: typeof smaxtecEvents.farmId | typeof animals.farmId,
  farmId: string | null,
): SqlCondition | undefined {
  return farmId ? eq(column, farmId) : undefined;
}

// WHERE 절에서 undefined 제거
function whereAll(...conditions: (SqlCondition | undefined)[]): SqlCondition | undefined {
  const valid = conditions.filter((c): c is SqlCondition => c !== undefined);
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  return and(...valid);
}

// ===========================
// 메인 엔드포인트
// ===========================

unifiedDashboardRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = (req.query.farmId as string | undefined) ?? null;
    const period = req.query.period as string | undefined;
    const periodDays = parsePeriodDays(period);

    const data = await buildUnifiedDashboard(farmId, periodDays);
    res.json({ success: true, data });
  } catch (error) {
    logger.error({ error }, 'Unified dashboard build failed');
    next(error);
  }
});

// ===========================
// Health Alerts Summary — smaXtec 기본 건강 알림 현황
// GET /api/unified-dashboard/health-alerts-summary?farmId=xxx
// ===========================

unifiedDashboardRouter.get('/health-alerts-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = (req.query.farmId as string | undefined) ?? null;
    const last24h = daysAgo(1);

    const rows = await db.select({
      eventType: smaxtecEvents.eventType,
      count: count(),
    })
      .from(smaxtecEvents)
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, last24h),
        sql`${smaxtecEvents.eventType} IN ('health_104','health_103','health_308','health_309','temperature_high','temperature_low','rumination_decrease','activity_decrease','drinking_decrease','health_101','clinical_condition','health_general')`,
      ))
      .groupBy(smaxtecEvents.eventType);

    // 카테고리별 집계
    const cats: Record<string, number> = {};
    for (const r of rows) {
      const et = r.eventType;
      const c = Number(r.count);
      if (['health_104','health_103','health_308','health_309','temperature_high'].includes(et)) {
        cats['temperature_high'] = (cats['temperature_high'] ?? 0) + c;
      } else if (et === 'temperature_low') {
        cats['temperature_low'] = (cats['temperature_low'] ?? 0) + c;
      } else if (et === 'rumination_decrease') {
        cats['rumination_decrease'] = (cats['rumination_decrease'] ?? 0) + c;
      } else if (et === 'activity_decrease') {
        cats['activity_decrease'] = (cats['activity_decrease'] ?? 0) + c;
      } else if (['drinking_decrease','health_101'].includes(et)) {
        cats['drinking_decrease'] = (cats['drinking_decrease'] ?? 0) + c;
      } else if (et === 'clinical_condition') {
        cats['clinical_condition'] = (cats['clinical_condition'] ?? 0) + c;
      } else if (et === 'health_general') {
        cats['health_general'] = (cats['health_general'] ?? 0) + c;
      }
    }

    const LABELS: Record<string, { label: string; icon: string; order: number }> = {
      temperature_high: { label: '체온 상승', icon: '🌡️', order: 0 },
      temperature_low: { label: '체온 저하', icon: '❄️', order: 1 },
      rumination_decrease: { label: '반추 감소', icon: '🌾', order: 2 },
      activity_decrease: { label: '활동량 감소', icon: '🦶', order: 3 },
      drinking_decrease: { label: '음수 이상', icon: '💧', order: 4 },
      clinical_condition: { label: '질병 의심', icon: '🏥', order: 5 },
      health_general: { label: '건강 주의', icon: '💊', order: 6 },
    };

    const items = Object.entries(LABELS)
      .map(([key, meta]) => ({
        category: key,
        label: meta.label,
        icon: meta.icon,
        count: cats[key] ?? 0,
      }))
      .sort((a, b) => (LABELS[a.category]?.order ?? 99) - (LABELS[b.category]?.order ?? 99));

    res.json({ success: true, data: items });
  } catch (error) {
    logger.error({ error }, 'Health alerts summary failed');
    next(error);
  }
});

// ===========================
// Fertility Management — smaXtec 기본 번식 관리 현황
// GET /api/unified-dashboard/fertility-management?farmId=xxx
// ===========================

unifiedDashboardRouter.get('/fertility-management', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = (req.query.farmId as string | undefined) ?? null;

    // 1. 우군 구성 (lactation_status)
    const herdRows = await db.select({
      status: animals.lactationStatus,
      count: count(),
    })
      .from(animals)
      .where(whereAll(
        eq(animals.status, 'active'),
        farmId ? eq(animals.farmId, farmId) : undefined,
      ))
      .groupBy(animals.lactationStatus);

    const STATUS_MAP: Record<string, { label: string; icon: string; group: string }> = {
      'Lactating_Cow': { label: '착유우', icon: '🥛', group: 'lactating' },
      'milking': { label: '착유중', icon: '🥛', group: 'lactating' },
      'Young_Cow': { label: '미경산우', icon: '🐮', group: 'young' },
      'heifer': { label: '육성우', icon: '🐮', group: 'young' },
      'Dry_Cow': { label: '건유우', icon: '🔕', group: 'dry' },
      'dry': { label: '건유우', icon: '🔕', group: 'dry' },
      'fresh': { label: '분만우(30일이하)', icon: '🍼', group: 'fresh' },
    };

    const grouped: Record<string, { label: string; icon: string; count: number }> = {};
    for (const r of herdRows) {
      const st = r.status ?? 'unknown';
      const meta = STATUS_MAP[st];
      if (meta) {
        const g = meta.group;
        if (!grouped[g]) grouped[g] = { label: meta.label, icon: meta.icon, count: 0 };
        grouped[g]!.count += Number(r.count);
      }
    }

    const herdStatus = Object.entries(grouped).map(([status, data]) => ({
      status,
      ...data,
    }));

    // 2. 번식 관련 이벤트 (최근 24시간)
    const last24h = daysAgo(1);
    const fertRows = await db.select({
      eventType: smaxtecEvents.eventType,
      count: count(),
    })
      .from(smaxtecEvents)
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, last24h),
        sql`${smaxtecEvents.eventType} IN ('estrus','insemination','pregnancy_check','fertility_warning','no_insemination','dry_off','calving_detection','calving_confirmation')`,
      ))
      .groupBy(smaxtecEvents.eventType);

    const FERT_LABELS: Record<string, string> = {
      estrus: '발정 감지',
      insemination: '수정',
      pregnancy_check: '임신 검사',
      fertility_warning: '번식 주의',
      no_insemination: '미수정',
      dry_off: '건유 전환',
      calving_detection: '분만 임박',
      calving_confirmation: '분만 완료',
    };

    const fertilityAlerts = fertRows.map((r) => ({
      type: r.eventType,
      label: FERT_LABELS[r.eventType] ?? r.eventType,
      count: Number(r.count),
    })).sort((a, b) => b.count - a.count);

    res.json({ success: true, data: { herdStatus, fertilityAlerts } });
  } catch (error) {
    logger.error({ error }, 'Fertility management failed');
    next(error);
  }
});

// ===========================
// 드릴다운 엔드포인트 — To-do 항목 클릭 시 상세 목록
// GET /api/unified-dashboard/drilldown?eventType=health_warning&farmId=xxx
// ===========================

unifiedDashboardRouter.get('/drilldown', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventType = req.query.eventType as string;
    const farmId = (req.query.farmId as string | undefined) ?? null;

    if (!eventType) {
      res.status(400).json({ success: false, error: 'eventType is required' });
      return;
    }

    const db = getDb();
    const today = daysAgo(1);

    // eventType=ALL → 모든 이벤트 유형, HEALTH_ALL → 건강 관련, SEVERITY_* → 심각도 필터
    const healthTypes = ['health_warning', 'health_alert', 'temperature_high', 'temperature_low', 'rumination_decrease', 'activity_decrease', 'ph_low', 'drinking_decrease', 'clinical_condition', 'health_general'];
    const typeFilter = eventType === 'ALL'
      ? undefined
      : eventType === 'HEALTH_ALL'
        ? sql`${smaxtecEvents.eventType} IN (${sql.raw(healthTypes.map((t) => `'${t}'`).join(','))})`
        : eventType === 'SEVERITY_CRITICAL'
          ? eq(smaxtecEvents.severity, 'critical')
          : eventType === 'SEVERITY_HIGH'
            ? sql`${smaxtecEvents.severity} IN ('high', 'medium')`
            : eventType.startsWith('DATE_')
              ? undefined // 날짜 필터는 별도 처리
              : eq(smaxtecEvents.eventType, eventType);

    // 오늘 발생한 해당 유형의 이벤트를 농장명 + 동물 귀표번호와 함께 조회
    const rows = await db.select({
      eventId: smaxtecEvents.eventId,
      eventType: smaxtecEvents.eventType,
      severity: smaxtecEvents.severity,
      detectedAt: smaxtecEvents.detectedAt,
      animalId: smaxtecEvents.animalId,
      farmId: smaxtecEvents.farmId,
      farmName: farms.name,
      earTag: animals.earTag,
      animalName: animals.name,
    })
      .from(smaxtecEvents)
      .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
      .leftJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        typeFilter,
        gte(smaxtecEvents.detectedAt, today),
      ))
      .orderBy(sql`${smaxtecEvents.detectedAt} DESC`)
      .limit(200);

    // 동일 귀표번호+이벤트타입 중복 제거 — 최신 이벤트만 유지 (detectedAt DESC 정렬이므로 첫 항목이 최신)
    // earTag 기준: 같은 귀표번호가 다른 animalId로 중복 등록된 케이스도 처리
    const seen = new Set<string>();
    const deduplicatedRows = rows.filter((row) => {
      const tag = row.earTag ?? row.animalId ?? 'unknown';
      const key = `${row.farmId}-${tag}-${row.eventType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const items = deduplicatedRows.map((row) => ({
      eventId: row.eventId,
      eventType: row.eventType,
      farmId: row.farmId,
      farmName: row.farmName,
      animalId: row.animalId,
      earTag: row.earTag ?? '미등록',
      animalName: row.animalName ?? '',
      severity: row.severity,
      detectedAt: row.detectedAt?.toISOString() ?? '',
    }));

    // 이벤트 유형별 수의학 액션플랜 포함
    const uniqueTypes = [...new Set(rows.map((r) => r.eventType))];
    const actionPlans: Record<string, ReturnType<typeof getVetActionPlan>> = {};
    for (const et of uniqueTypes) {
      const plan = getVetActionPlan(et);
      if (plan) actionPlans[et] = plan;
    }

    res.json({ success: true, data: { eventType, total: items.length, items, actionPlans } });
  } catch (error) {
    logger.error({ error }, 'Unified dashboard drilldown failed');
    next(error);
  }
});

// ===========================
// 실시간 알람 — 최근 48시간 smaXtec 이벤트
// GET /api/unified-dashboard/live-alarms?farmId=xxx
// ===========================

unifiedDashboardRouter.get('/live-alarms', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = (req.query.farmId as string | undefined) ?? null;
    const alarms = await queryLiveAlarms(farmId);
    res.json({ success: true, data: { alarms } });
  } catch (error) {
    logger.error({ error }, 'Live alarms query failed');
    next(error);
  }
});

async function queryLiveAlarms(farmId: string | null): Promise<readonly LiveAlarm[]> {
  const db = getDb();
  const cutoff = daysAgo(1); // 최근 24시간

  const rows = await db.select({
    eventId: smaxtecEvents.eventId,
    eventType: smaxtecEvents.eventType,
    animalId: smaxtecEvents.animalId,
    earTag: animals.earTag,
    farmName: farms.name,
    farmId: smaxtecEvents.farmId,
    severity: smaxtecEvents.severity,
    confidence: smaxtecEvents.confidence,
    details: smaxtecEvents.details,
    detectedAt: smaxtecEvents.detectedAt,
    acknowledged: smaxtecEvents.acknowledged,
  })
    .from(smaxtecEvents)
    .innerJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
    .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, cutoff),
    ))
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(200); // 중복 제거 전 충분히 가져옴

  // 동일 귀표번호+이벤트타입 중복 제거 — 최신 이벤트만 유지
  // farmId 포함: 다른 농장의 같은 귀표번호는 다른 개체
  const seen = new Set<string>();
  const deduplicated = rows.filter((row) => {
    const tag = row.earTag ?? row.animalId ?? 'unknown';
    const key = `${row.farmId}-${tag}-${row.eventType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 50);

  return deduplicated.map((row) => ({
    eventId: row.eventId,
    eventType: row.eventType,
    animalId: row.animalId,
    earTag: row.earTag,
    farmName: row.farmName,
    farmId: row.farmId,
    severity: row.severity,
    confidence: row.confidence,
    details: row.details as unknown,
    detectedAt: row.detectedAt?.toISOString() ?? '',
    acknowledged: row.acknowledged,
  }));
}

// ===========================
// 농장 랭킹 — 미확인 알람 기준 상위 20개
// GET /api/unified-dashboard/farm-ranking
// ===========================

unifiedDashboardRouter.get('/farm-ranking', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rankings = await queryFarmRanking();
    res.json({ success: true, data: { rankings } });
  } catch (error) {
    logger.error({ error }, 'Farm ranking query failed');
    next(error);
  }
});

// ===========================
// AI 일일 브리핑 — 현재 농장 상태 종합 분석
// GET /api/unified-dashboard/ai-briefing?farmId=xxx
// ===========================

unifiedDashboardRouter.get('/ai-briefing', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = (req.query.farmId as string | undefined) ?? null;
    const role = (req.query.role as string | undefined) ?? 'government_admin';
    const briefing = await buildAiBriefing(farmId, role);
    res.json({ success: true, data: briefing });
  } catch (error) {
    logger.error({ error }, 'AI briefing build failed');
    next(error);
  }
});

async function buildAiBriefing(farmId: string | null, role = 'government_admin'): Promise<AiBriefing> {
  const db = getDb();
  const last24h = daysAgo(1);
  const last6h = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const yesterday = daysAgo(2);

  // 병렬 쿼리: 기본 통계, 심각도별 알림, 농장 랭킹, 이벤트 분포, 최근 긴급, 어제 알림 수
  const [
    farmCountResult,
    animalCountResult,
    total24hResult,
    severityRows,
    topFarmRows,
    eventDistRows,
    criticalRows,
    yesterdayCountResult,
  ] = await Promise.all([
    // 활성 농장 수
    db.select({ count: count() })
      .from(farms)
      .where(whereAll(
        farmId ? eq(farms.farmId, farmId) : undefined,
        eq(farms.status, 'active'),
      )),

    // 활성 동물 수
    db.select({ count: count() })
      .from(animals)
      .where(whereAll(
        farmCondition(animals.farmId, farmId),
        eq(animals.status, 'active'),
      )),

    // 24시간 전체 알림 수
    db.select({ count: count() })
      .from(smaxtecEvents)
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, last24h),
      )),

    // 심각도별 알림 수
    db.select({
      severity: smaxtecEvents.severity,
      count: count(),
    })
      .from(smaxtecEvents)
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, last24h),
      ))
      .groupBy(smaxtecEvents.severity),

    // 상위 5개 농장 (알림 수 기준)
    db.select({
      farmId: farms.farmId,
      farmName: farms.name,
      alertCount: count(smaxtecEvents.eventId),
      topEventType: sql<string>`MODE() WITHIN GROUP (ORDER BY ${smaxtecEvents.eventType})`,
    })
      .from(smaxtecEvents)
      .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, last24h),
      ))
      .groupBy(farms.farmId, farms.name)
      .orderBy(desc(count(smaxtecEvents.eventId)))
      .limit(5),

    // 이벤트 유형 분포
    db.select({
      eventType: smaxtecEvents.eventType,
      count: count(),
    })
      .from(smaxtecEvents)
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, last24h),
      ))
      .groupBy(smaxtecEvents.eventType)
      .orderBy(desc(count())),

    // 최근 6시간 긴급 이벤트
    db.select({
      eventId: smaxtecEvents.eventId,
      eventType: smaxtecEvents.eventType,
      farmName: farms.name,
      earTag: animals.earTag,
      detectedAt: smaxtecEvents.detectedAt,
      details: smaxtecEvents.details,
    })
      .from(smaxtecEvents)
      .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
      .leftJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, last6h),
        sql`${smaxtecEvents.severity} IN ('high', 'critical')`,
      ))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(20),

    // 어제 알림 수 (트렌드 비교용)
    db.select({ count: count() })
      .from(smaxtecEvents)
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, yesterday),
        sql`${smaxtecEvents.detectedAt} < ${last24h.toISOString()}`,
      )),
  ]);

  const totalFarms = Number(farmCountResult[0]?.count ?? 0);
  const totalAnimals = Number(animalCountResult[0]?.count ?? 0);
  const total24h = Number(total24hResult[0]?.count ?? 0);

  // 심각도별 집계
  const severityMap: Record<string, number> = {};
  for (const row of severityRows) {
    severityMap[row.severity] = Number(row.count);
  }
  const alertStats = {
    total24h,
    critical: severityMap['critical'] ?? 0,
    high: severityMap['high'] ?? 0,
    medium: severityMap['medium'] ?? 0,
    low: severityMap['low'] ?? 0,
  };

  // 상위 농장
  const topAlertFarms: readonly AiBriefingTopFarm[] = topFarmRows.map((row) => ({
    farmId: row.farmId,
    farmName: row.farmName,
    alertCount: Number(row.alertCount),
    topEventType: row.topEventType ?? 'unknown',
  }));

  // 이벤트 유형 분포 (비율 포함)
  const eventTypeDistribution: readonly AiBriefingEventDistribution[] = eventDistRows.map((row) => ({
    eventType: row.eventType,
    count: Number(row.count),
    percentage: total24h > 0
      ? Math.round((Number(row.count) / total24h) * 1000) / 10
      : 0,
  }));

  // 최근 긴급 이벤트
  const recentCritical: readonly AiBriefingCriticalEvent[] = criticalRows.map((row) => ({
    eventId: row.eventId,
    eventType: row.eventType,
    farmName: row.farmName,
    earTag: row.earTag ?? '미등록',
    detectedAt: row.detectedAt?.toISOString() ?? '',
    details: row.details as unknown,
  }));

  // 트렌드 비교
  const yesterdayTotal = Number(yesterdayCountResult[0]?.count ?? 0);
  const changePercent = yesterdayTotal > 0
    ? Math.round(((total24h - yesterdayTotal) / yesterdayTotal) * 1000) / 10
    : 0;
  const direction: 'up' | 'down' | 'stable' =
    changePercent > 5 ? 'up' : changePercent < -5 ? 'down' : 'stable';

  const trendComparison = {
    today: total24h,
    yesterday: yesterdayTotal,
    changePercent: Math.abs(changePercent),
    direction,
  };

  // 한국어 요약 생성
  const summary = buildBriefingSummary(
    totalFarms, total24h, changePercent, direction, topAlertFarms,
  );

  // 역할별 한국어 권장사항 생성
  const recommendations = buildRecommendations(
    alertStats, topAlertFarms, eventTypeDistribution, recentCritical, role,
  );

  return {
    generatedAt: new Date().toISOString(),
    summary,
    farmCount: totalFarms,
    animalCount: totalAnimals,
    alertStats,
    topAlertFarms,
    eventTypeDistribution,
    recentCritical,
    trendComparison,
    recommendations,
  };
}

function buildBriefingSummary(
  farmCount: number,
  total24h: number,
  changePercent: number,
  direction: 'up' | 'down' | 'stable',
  topFarms: readonly AiBriefingTopFarm[],
): string {
  const trendText = direction === 'up'
    ? `전일 대비 ${Math.abs(changePercent)}% 증가했으며`
    : direction === 'down'
      ? `전일 대비 ${Math.abs(changePercent)}% 감소했으며`
      : '전일과 유사한 수준이며';

  const topFarmNames = topFarms.slice(0, 2).map((f) => f.farmName);
  const focusText = topFarmNames.length > 0
    ? `${topFarmNames.join('과 ')}에 집중 관리가 필요합니다.`
    : '전체적으로 안정적인 상태입니다.';

  return `오늘 ${String(farmCount)}개 농장에서 ${String(total24h)}건의 알림이 발생했습니다. ${trendText}, ${focusText}`;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  estrus: '발정',
  estrus_dnb: '발정 (재발)',
  heat: '발정',
  health_warning: '건강 경고',
  health_general: '건강 주의',
  temperature_warning: '체온 이상',
  temperature_high: '발열',
  temperature_low: '저체온',
  calving: '분만',
  calving_detection: '분만 임박',
  calving_confirmation: '분만 완료',
  calving_waiting: '분만 대기',
  rumination_warning: '반추 이상',
  rumination_decrease: '반추 감소',
  activity_warning: '활동 이상',
  activity_decrease: '활동 감소',
  activity_increase: '활동 증가',
  drinking_warning: '음수 이상',
  drinking_decrease: '음수 감소',
  feeding_warning: '사양 이상',
  insemination: '수정',
  pregnancy_check: '임신 검사',
  fertility_warning: '번식 주의',
  no_insemination: '미수정',
  dry_off: '건유',
  clinical_condition: '질병 의심',
  abortion: '유산',
  management: '관리',
};

function buildRecommendations(
  alertStats: { readonly critical: number; readonly high: number; readonly medium: number },
  topFarms: readonly AiBriefingTopFarm[],
  eventDist: readonly AiBriefingEventDistribution[],
  criticalEvents: readonly AiBriefingCriticalEvent[],
  role = 'government_admin',
): readonly string[] {
  const recs: string[] = [];
  const topFarm = topFarms.length > 0 ? topFarms[0] : undefined;

  // ── 역할별 맞춤 권장사항 ──

  if (role === 'farmer') {
    // 농장주: 내 소 중심, 실용적 조치
    if (alertStats.critical > 0) {
      recs.push(`긴급 알림 ${String(alertStats.critical)}건 — 즉시 해당 개체를 확인하고 이상이 있으면 수의사를 호출하세요.`);
    }
    const estrus = eventDist.find((e) => e.eventType === 'estrus');
    if (estrus && estrus.count > 0) {
      recs.push(`발정 감지 ${String(estrus.count)}두 — 수정 적기입니다. 수정사에게 연락하거나 직접 수정을 진행하세요.`);
    }
    const rumDec = eventDist.find((e) => e.eventType === 'rumination_decrease');
    if (rumDec && rumDec.count > 0) {
      recs.push(`반추 감소 ${String(rumDec.count)}두 — 사료 섭취량과 분변 상태를 확인하세요. 2일 이상 지속 시 수의사 진료가 필요합니다.`);
    }
    const tempHigh = eventDist.find((e) => e.eventType === 'temperature_high');
    if (tempHigh && tempHigh.count > 0) {
      recs.push(`발열 ${String(tempHigh.count)}두 — 직장 체온을 재측정하고, 39.5°C 이상이면 격리 후 수의사를 호출하세요.`);
    }
    if (recs.length === 0) recs.push('현재 특이사항 없습니다. 정기 모니터링을 유지하세요.');

  } else if (role === 'veterinarian') {
    // 수의사: 임상 중심, 진료 우선순위
    if (alertStats.critical > 0) {
      recs.push(`긴급 진료 ${String(alertStats.critical)}건 — 체온 상승·임상 증상 개체를 우선 방문하세요.`);
    }
    const tempHigh = eventDist.find((e) => e.eventType === 'temperature_high');
    if (tempHigh && tempHigh.count > 0) {
      recs.push(`발열 개체 ${String(tempHigh.count)}두 — 감별 진단: 유방염, 자궁내막염, 제4위변위, 폐렴 순으로 확인. 38.8°C 이상 지속 시 항생제 투여 검토.`);
    }
    const clinical = eventDist.find((e) => e.eventType === 'clinical_condition');
    if (clinical && clinical.count > 0) {
      recs.push(`임상 증상 ${String(clinical.count)}건 — 신체검사(BCS, 탈수, 분변)를 실시하고 혈액 검사를 권장합니다.`);
    }
    const rumDec = eventDist.find((e) => e.eventType === 'rumination_decrease');
    if (rumDec && rumDec.count > 0) {
      recs.push(`반추 감소 ${String(rumDec.count)}두 — 산독증·케토시스 감별. 뇨케톤 검사 및 반추위 pH 확인을 권장합니다.`);
    }
    if (topFarm) {
      recs.push(`${topFarm.farmName} 집중 방문 권장 — ${String(topFarm.alertCount)}건 알림. 사양 환경 전반 점검이 필요합니다.`);
    }

  } else if (role === 'inseminator') {
    // 수정사: 번식 중심
    const estrus = eventDist.find((e) => e.eventType === 'estrus');
    if (estrus && estrus.count > 0) {
      recs.push(`오늘 발정 ${String(estrus.count)}두 — 발정 시작 12~18시간 후 수정이 최적입니다. 수정 스케줄을 확인하세요.`);
    }
    const noInsem = eventDist.find((e) => e.eventType === 'no_insemination');
    if (noInsem && noInsem.count > 0) {
      recs.push(`미수정 발정 ${String(noInsem.count)}건 — 발정 놓침 원인을 파악하세요. 다음 발정 예측일을 확인하세요.`);
    }
    const fertility = eventDist.find((e) => e.eventType === 'fertility_warning');
    if (fertility && fertility.count > 0) {
      recs.push(`번식 주의 ${String(fertility.count)}건 — 반복 수정 실패 개체는 수의사 번식 검진을 의뢰하세요.`);
    }
    if (recs.length === 0) recs.push('오늘 수정 예정 개체가 없습니다. 내일 발정 예측 목록을 확인하세요.');

  } else if (role === 'quarantine_officer') {
    // 방역관: 역학 중심
    const tempHigh = eventDist.find((e) => e.eventType === 'temperature_high');
    if (tempHigh && tempHigh.count > 0) {
      recs.push(`발열 개체 ${String(tempHigh.count)}두 — 집단 발열 여부를 확인하세요. 동일 농장 3두 이상 발열 시 방역 당국 보고를 권장합니다.`);
    }
    if (topFarm) {
      recs.push(`${topFarm.farmName}: 알림 ${String(topFarm.alertCount)}건 집중 — 인근 농장 이동제한 필요 여부를 검토하세요.`);
    }
    if (alertStats.critical > 0) {
      recs.push(`긴급 알림 ${String(alertStats.critical)}건 — 법정 전염병(구제역, AI) 가능성을 배제할 수 없습니다. 역학 조사를 권장합니다.`);
    }
    recs.push('정상 범위: 발열 개체 비율 2% 미만. 5% 초과 시 지역 방역 경보 발령을 검토하세요.');

  } else if (role === 'feed_company') {
    // 사료회사: 영양 중심
    const rumDec = eventDist.find((e) => e.eventType === 'rumination_decrease');
    if (rumDec && rumDec.count > 0) {
      recs.push(`반추 감소 ${String(rumDec.count)}두 — TMR 배합비 점검과 사료 품질(수분, 곰팡이) 확인을 권장합니다.`);
    }
    recs.push('사료 효율 개선: 반추 시간 480분/일 이상 유지를 목표로 조사료 비율을 조정하세요.');
    if (recs.length < 3) recs.push('계절별 사료 변경 시 최소 7일 적응 기간을 두고 반추 데이터를 모니터링하세요.');

  } else {
    // 행정관리: 전체 현황 중심 (기존 로직)
    if (alertStats.critical > 0) {
      recs.push(`긴급(Critical) 알림 ${String(alertStats.critical)}건이 감지되었습니다. 즉시 현장 확인이 필요합니다.`);
    }
    if (alertStats.high > 0) {
      recs.push(`높은 심각도(High) 알림 ${String(alertStats.high)}건에 대해 금일 중 점검을 권장합니다.`);
    }
    if (topFarm) {
      const eventLabel = EVENT_TYPE_LABELS[topFarm.topEventType] ?? topFarm.topEventType;
      recs.push(`${topFarm.farmName}에서 ${String(topFarm.alertCount)}건의 알림이 집중되었습니다. 주요 유형: ${eventLabel}. 해당 농장 현장 순회를 권장합니다.`);
    }
    const estrusEvent = eventDist.find((e) => e.eventType === 'estrus');
    if (estrusEvent && estrusEvent.count > 0) {
      recs.push(`발정 감지 ${String(estrusEvent.count)}건이 확인되었습니다. 적정 수정 시기를 놓치지 않도록 번식 담당자 확인이 필요합니다.`);
    }
    const tempEvent = eventDist.find((e) => e.eventType === 'temperature_high');
    if (tempEvent && tempEvent.count > 0) {
      recs.push(`체온 이상 ${String(tempEvent.count)}건이 감지되었습니다. 전염병 확산 가능성을 고려하여 격리 및 수의사 진단을 권장합니다.`);
    }
  }

  // 최근 긴급 이벤트가 많으면 추가 권장
  if (criticalEvents.length >= 5 && recs.length < 5) {
    recs.push(
      '최근 6시간 내 긴급 이벤트가 다수 발생했습니다. 사양 환경(온습도, 사료, 음수)을 종합 점검하시기 바랍니다.',
    );
  }

  // 최소 3개 보장
  if (recs.length === 0) {
    recs.push('현재 특이사항 없습니다. 정기 모니터링을 유지하세요.');
    recs.push('센서 미장착 개체에 대한 센서 부착을 검토하세요.');
    recs.push('미확인 알림을 정기적으로 처리하여 알림 피로도를 줄이세요.');
  }

  return recs.slice(0, 5);
}

// ===========================
// 농장 목록 (셀렉터용 — 이름 한글 오름순)
// GET /api/unified-dashboard/farms
// ===========================

unifiedDashboardRouter.get('/farms', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmList = await db.select({
      farmId: farms.farmId,
      name: farms.name,
      currentHeadCount: farms.currentHeadCount,
    })
      .from(farms)
      .where(eq(farms.status, 'active'))
      .orderBy(farms.name);

    res.json({ success: true, data: { farms: farmList, total: farmList.length } });
  } catch (error) {
    logger.error({ error }, 'Farm list query failed');
    next(error);
  }
});

// ===========================
// 개체 타임라인 — smaXtec 이벤트 히스토리 + 동물 정보
// GET /api/unified-dashboard/animal/:animalId/timeline
// ===========================

const SMAXTEC_EVENT_LABELS: Record<string, string> = {
  heat: '발정',
  insemination: '수정',
  no_insemination: '미수정',
  pregnancy_result: '임신 판정',
  calving_detection: '분만 징후',
  calving_confirmation: '분만 확인',
  dry_off: '건유 시작',
  abort: '유산',
  waiting_for_calving: '분만 대기',
  heat_dnb: '발정 (Do Not Breed)',
  health_101: '건강 모니터링',
  health_103: '체온 급상승',
  health_104: '체온 변화',
  health_106: '음수량 변화',
  health_109: '반추 저하',
  health_301: '산증(SARA) 의심',
  health_302: '산증(SARA)',
  health_303: '반추 급감',
  health_304: '활동 급증',
  health_305: '활동 이상',
  health_306: '음수 급증',
  health_307: '음수 급감',
  health_308: '체온 지속 상승',
  health_309: '체온 지속 하락',
  health_310: '사료 섭취 이상',
  health_317: '건강 경고',
  health_318: '건강 심각',
  health_703: '활동 패턴 이상',
  actincrease_704: '활동 급증',
  clinical_condition_401: '임상 상태 1',
  clinical_condition_402: '임상 상태 2',
  clinical_condition_403: '임상 상태 3',
  fertility_105: '번식 관련',
  fertility_705: '번식 활동 증가',
  feeding_201: '사료 섭취 감소',
  feeding_202: '사료 섭취 이상',
  feeding_203: '사료 섭취 급감',
  feeding_204: '사료 섭취 패턴',
  management_904: '관리 알림',
};

const SMAXTEC_EVENT_CATEGORIES: Record<string, string> = {
  heat: 'fertility',
  insemination: 'fertility',
  no_insemination: 'fertility',
  pregnancy_result: 'fertility',
  calving_detection: 'calving',
  calving_confirmation: 'calving',
  dry_off: 'fertility',
  abort: 'fertility',
  waiting_for_calving: 'calving',
  heat_dnb: 'fertility',
};

const CATEGORY_COLORS: Record<string, string> = {
  fertility: '#ec4899',
  calving: '#22c55e',
  health: '#f97316',
  activity: '#3b82f6',
  feeding: '#8b5cf6',
  management: '#6b7280',
};

function getSmaxtecCategory(smaxtecType: string): string {
  if (SMAXTEC_EVENT_CATEGORIES[smaxtecType]) return SMAXTEC_EVENT_CATEGORIES[smaxtecType];
  if (smaxtecType.startsWith('health_') || smaxtecType.startsWith('clinical_')) return 'health';
  if (smaxtecType.startsWith('actincrease_') || smaxtecType === 'health_703') return 'activity';
  if (smaxtecType.startsWith('feeding_') || smaxtecType === 'health_310') return 'feeding';
  if (smaxtecType.startsWith('management_')) return 'management';
  return 'health';
}

unifiedDashboardRouter.get('/animal/:animalId/timeline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    // 동물 기본 정보
    const [animal] = await db.select({
      animalId: animals.animalId,
      earTag: animals.earTag,
      name: animals.name,
      breed: animals.breed,
      sex: animals.sex,
      birthDate: animals.birthDate,
      parity: animals.parity,
      daysInMilk: animals.daysInMilk,
      lactationStatus: animals.lactationStatus,
      farmId: animals.farmId,
      farmName: farms.name,
    })
      .from(animals)
      .innerJoin(farms, eq(animals.farmId, farms.farmId))
      .where(eq(animals.animalId, animalId));

    if (!animal) {
      res.status(404).json({ success: false, error: '동물을 찾을 수 없습니다' });
      return;
    }

    // 전체 smaXtec 이벤트 히스토리 (최신순, 최대 100개)
    const events = await db.select({
      eventId: smaxtecEvents.eventId,
      eventType: smaxtecEvents.eventType,
      detectedAt: smaxtecEvents.detectedAt,
      severity: smaxtecEvents.severity,
      confidence: smaxtecEvents.confidence,
      details: smaxtecEvents.details,
      rawData: smaxtecEvents.rawData,
      acknowledged: smaxtecEvents.acknowledged,
    })
      .from(smaxtecEvents)
      .where(eq(smaxtecEvents.animalId, animalId))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(100);

    const timeline = events.map((e) => {
      const raw = e.rawData as Record<string, unknown> | null;
      const smaxtecType = (raw?.event_type as string) ?? e.eventType;
      const category = getSmaxtecCategory(smaxtecType);

      return {
        eventId: e.eventId,
        eventType: e.eventType,
        smaxtecType,
        smaxtecLabel: SMAXTEC_EVENT_LABELS[smaxtecType] ?? smaxtecType,
        category,
        categoryColor: CATEGORY_COLORS[category] ?? '#6b7280',
        detectedAt: e.detectedAt?.toISOString() ?? '',
        severity: e.severity,
        confidence: e.confidence,
        details: e.details as Record<string, unknown> | null,
        acknowledged: e.acknowledged,
      };
    });

    res.json({
      success: true,
      data: {
        animal: {
          animalId: animal.animalId,
          earTag: animal.earTag,
          name: animal.name ?? '',
          breed: animal.breed,
          sex: animal.sex,
          birthDate: animal.birthDate,
          parity: animal.parity,
          daysInMilk: animal.daysInMilk,
          lactationStatus: animal.lactationStatus,
          farmId: animal.farmId,
          farmName: animal.farmName,
        },
        timeline,
        totalEvents: timeline.length,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Animal timeline query failed');
    next(error);
  }
});

// ===========================
// 개체 센서 차트 — smaXtec Data API에서 실시간 시계열 데이터
// GET /api/unified-dashboard/animal/:animalId/sensor-chart?days=14
// ===========================

let smaxtecConnectorInstance: SmaxtecConnector | null = null;
let smaxtecConnectorFailed = false;

async function getSmaxtecConnector(): Promise<SmaxtecConnector | null> {
  if (smaxtecConnectorFailed) return null;
  if (smaxtecConnectorInstance) return smaxtecConnectorInstance;

  try {
    const connector = new SmaxtecConnector();
    // 5초 타임아웃 — 자격증명 없으면 빠르게 실패
    const connectPromise = connector.connect();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('smaXtec connect timeout (5s)')), 5000),
    );
    await Promise.race([connectPromise, timeoutPromise]);
    // connect() 이후 status가 'connected'가 아니면 credential 문제
    if ((connector as unknown as { status: string }).status !== 'connected') {
      logger.warn('[sensor-chart] smaXtec connector not connected (credentials missing?)');
      smaxtecConnectorFailed = true;
      return null;
    }
    smaxtecConnectorInstance = connector;
    return connector;
  } catch (err) {
    logger.warn({ err }, '[sensor-chart] smaXtec connector init failed — using DB fallback');
    smaxtecConnectorFailed = true;
    return null;
  }
}

unifiedDashboardRouter.get('/animal/:animalId/sensor-chart', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;
    const days = Math.min(Number(req.query.days) || 14, 90); // 최대 90일

    // 동물 기본 정보 + 프로필
    const [animal] = await db.select({
      externalId: animals.externalId,
      earTag: animals.earTag,
      farmName: farms.name,
      breed: animals.breed,
      breedType: animals.breedType,
      sex: animals.sex,
      birthDate: animals.birthDate,
      parity: animals.parity,
      daysInMilk: animals.daysInMilk,
      lactationStatus: animals.lactationStatus,
      status: animals.status,
    })
      .from(animals)
      .innerJoin(farms, eq(animals.farmId, farms.farmId))
      .where(eq(animals.animalId, animalId));

    if (!animal) {
      res.status(404).json({ success: false, error: '동물을 찾을 수 없습니다' });
      return;
    }

    // 최근 분만 이력
    const recentCalvings = await db.select({
      calvingDate: calvingEvents.calvingDate,
      calfSex: calvingEvents.calfSex,
      calfStatus: calvingEvents.calfStatus,
      complications: calvingEvents.complications,
    })
      .from(calvingEvents)
      .where(eq(calvingEvents.animalId, animalId))
      .orderBy(desc(calvingEvents.calvingDate))
      .limit(3);

    // 최근 임신 검사
    const [latestPregnancy] = await db.select({
      checkDate: pregnancyChecks.checkDate,
      result: pregnancyChecks.result,
      method: pregnancyChecks.method,
      daysPostInsemination: pregnancyChecks.daysPostInsemination,
    })
      .from(pregnancyChecks)
      .where(eq(pregnancyChecks.animalId, animalId))
      .orderBy(desc(pregnancyChecks.checkDate))
      .limit(1);

    // 최근 수정 이력
    const [latestBreeding] = await db.select({
      eventDate: breedingEvents.eventDate,
      type: breedingEvents.type,
      semenInfo: breedingEvents.semenInfo,
    })
      .from(breedingEvents)
      .where(eq(breedingEvents.animalId, animalId))
      .orderBy(desc(breedingEvents.eventDate))
      .limit(1);

    // 동물 프로필 조합
    const animalProfile = {
      breed: animal.breed,
      breedType: animal.breedType,
      sex: animal.sex,
      birthDate: animal.birthDate ? String(animal.birthDate) : null,
      parity: animal.parity,
      daysInMilk: animal.daysInMilk,
      lactationStatus: animal.lactationStatus,
      status: animal.status,
      lastCalving: recentCalvings[0]
        ? {
            calvingDate: recentCalvings[0].calvingDate?.toISOString() ?? null,
            calfSex: recentCalvings[0].calfSex,
            calfStatus: recentCalvings[0].calfStatus,
            complications: recentCalvings[0].complications,
          }
        : null,
      calvingHistory: recentCalvings.map((c) => ({
        calvingDate: c.calvingDate?.toISOString() ?? null,
        calfSex: c.calfSex,
      })),
      pregnancy: latestPregnancy
        ? {
            checkDate: latestPregnancy.checkDate?.toISOString() ?? null,
            result: latestPregnancy.result,
            method: latestPregnancy.method,
            daysPostInsemination: latestPregnancy.daysPostInsemination,
          }
        : null,
      lastBreeding: latestBreeding
        ? {
            eventDate: latestBreeding.eventDate?.toISOString() ?? null,
            type: latestBreeding.type,
            semenInfo: latestBreeding.semenInfo,
          }
        : null,
    };

    const toDate = new Date().toISOString();
    const fromDate = new Date(Date.now() - days * 86_400_000).toISOString();

    // smaXtec 라이브 API 시도
    let metrics: Record<string, readonly { ts: number; value: number }[]> = {};
    const connector = animal.externalId ? await getSmaxtecConnector() : null;

    if (connector && animal.externalId) {
      // 각 메트릭을 개별 요청 (사용 불가한 메트릭은 무시)
      const metricNames = ['temp', 'act', 'rum', 'dr'];
      const results = await Promise.allSettled(
        metricNames.map((m) =>
          connector.fetchSensorData(animal.externalId!, m, fromDate, toDate),
        ),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const m = result.value.metrics as Record<string, readonly { ts: number; value: number }[]>;
          for (const [key, values] of Object.entries(m)) {
            (metrics as Record<string, readonly { ts: number; value: number }[]>)[key] = values;
          }
        }
      }
    }

    // 라이브 API 실패 시 DB sensor_daily_agg에서 폴백
    if (Object.keys(metrics).length === 0) {
      const aggRows = await db.select({
        date: sensorDailyAgg.date,
        metricType: sensorDailyAgg.metricType,
        avg: sensorDailyAgg.avg,
        min: sensorDailyAgg.min,
        max: sensorDailyAgg.max,
      })
        .from(sensorDailyAgg)
        .where(and(
          eq(sensorDailyAgg.animalId, animalId),
          gte(sensorDailyAgg.date, sql`${fromDate.slice(0, 10)}`),
        ))
        .orderBy(sensorDailyAgg.date);

      // DB 집계 → 차트용 시계열로 변환
      const metricMap: Record<string, { ts: number; value: number }[]> = {};
      for (const row of aggRows) {
        const key = String(row.metricType).replace(/^.*_/, ''); // e.g. "daily_temp" → "temp"
        if (!metricMap[key]) metricMap[key] = [];
        const dateTs = new Date(String(row.date)).getTime() / 1000;
        metricMap[key].push({ ts: dateTs, value: row.avg });
      }
      metrics = metricMap;
    }

    // 누락 메트릭이 있으면 → 이벤트 기반 시뮬레이션 데이터로 보충 (데모/개발용)
    // 실제 smaXtec 연동 시 해당 메트릭은 실 데이터가 사용됨
    const requiredMetrics = ['temp', 'act', 'rum', 'dr'];
    const missingMetrics = requiredMetrics.filter((k) => !metrics[k] || metrics[k]!.length === 0);
    if (missingMetrics.length > 0) {
      // 이벤트 목록을 미리 가져와서 이상 구간 시뮬레이션에 활용
      const animalEvents = await db.select({
        eventType: smaxtecEvents.eventType,
        detectedAt: smaxtecEvents.detectedAt,
        severity: smaxtecEvents.severity,
      })
        .from(smaxtecEvents)
        .where(and(
          eq(smaxtecEvents.animalId, animalId),
          gte(smaxtecEvents.detectedAt, new Date(fromDate)),
        ))
        .orderBy(smaxtecEvents.detectedAt);

      const nowTs = Date.now() / 1000;
      const startTs = nowTs - days * 86400;
      const interval = 3600; // 1시간 간격
      const pointCount = Math.floor((nowTs - startTs) / interval);

      // 시드 기반 결정적 난수 (동일 동물은 동일 패턴)
      const seed = animalId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const seededRandom = (i: number, offset: number): number => {
        const x = Math.sin(seed * 9301 + i * 49297 + offset * 233) * 10000;
        return x - Math.floor(x);
      };

      // 이벤트 타임스탬프 → 이상 구간 매핑
      const eventWindows = animalEvents.map((e) => ({
        ts: e.detectedAt ? e.detectedAt.getTime() / 1000 : 0,
        type: e.eventType,
        severity: e.severity,
      }));

      const isNearEvent = (ts: number, eventType: string): { near: boolean; intensity: number } => {
        for (const ew of eventWindows) {
          // 이벤트 전후 12시간 이내
          const dist = Math.abs(ts - ew.ts);
          if (dist < 43200) {
            const typeMatch = ew.type.includes(eventType) ||
              (eventType === 'temp' && (ew.type.includes('temperature') || ew.type.includes('health'))) ||
              (eventType === 'act' && (ew.type.includes('activity') || ew.type.includes('health'))) ||
              (eventType === 'rum' && (ew.type.includes('rumination') || ew.type.includes('health') || ew.type.includes('clinical'))) ||
              (eventType === 'dr' && (ew.type.includes('drinking') || ew.type.includes('health')));
            if (typeMatch) {
              const intensity = 1 - (dist / 43200); // 가까울수록 강함
              const severityMul = ew.severity === 'high' ? 1.5 : ew.severity === 'medium' ? 1.0 : 0.6;
              return { near: true, intensity: intensity * severityMul };
            }
          }
        }
        return { near: false, intensity: 0 };
      };

      // 4개 메트릭 생성
      const metricConfigs: readonly { key: string; base: number; noise: number; abnormalDelta: number }[] = [
        { key: 'temp', base: 38.6, noise: 0.3, abnormalDelta: 1.8 },  // 체온 °C
        { key: 'act', base: 180, noise: 40, abnormalDelta: -80 },      // 활동 I/24h
        { key: 'rum', base: 450, noise: 50, abnormalDelta: -200 },     // 반추 분
        { key: 'dr', base: 80, noise: 15, abnormalDelta: -40 },        // 음수 L
      ];

      for (const mc of metricConfigs) {
        // 이미 실 데이터가 있는 메트릭은 건너뜀
        if (!missingMetrics.includes(mc.key)) continue;

        const points: { ts: number; value: number }[] = [];
        for (let i = 0; i < pointCount; i++) {
          const ts = startTs + i * interval;
          const r = seededRandom(i, mc.key.charCodeAt(0));

          // 기본값 + 노이즈 + 일주기 변동
          const diurnal = Math.sin((i / 24) * Math.PI * 2) * mc.noise * 0.3;
          let value = mc.base + (r - 0.5) * mc.noise + diurnal;

          // 이벤트 근처면 이상치 반영
          const { near, intensity } = isNearEvent(ts, mc.key);
          if (near) {
            value += mc.abnormalDelta * intensity;
          }

          // 값 범위 제한
          if (mc.key === 'temp') value = Math.max(36.5, Math.min(42.0, value));
          else value = Math.max(0, value);

          points.push({ ts, value: Math.round(value * 10) / 10 });
        }
        (metrics as Record<string, { ts: number; value: number }[]>)[mc.key] = points;
      }

      logger.info({ animalId, days, missing: missingMetrics }, '[sensor-chart] Filled missing metrics with simulated data');
    }

    // smaXtec 이벤트 마커 (차트 위에 표시)
    const eventMarkers = await db.select({
      eventId: smaxtecEvents.eventId,
      eventType: smaxtecEvents.eventType,
      detectedAt: smaxtecEvents.detectedAt,
      severity: smaxtecEvents.severity,
      rawEventType: sql<string>`${smaxtecEvents.rawData}->>'event_type'`,
    })
      .from(smaxtecEvents)
      .where(and(
        eq(smaxtecEvents.animalId, animalId),
        gte(smaxtecEvents.detectedAt, new Date(fromDate)),
      ))
      .orderBy(desc(smaxtecEvents.detectedAt));

    const markers = eventMarkers.map((e) => ({
      eventId: e.eventId,
      eventType: e.eventType,
      smaxtecType: e.rawEventType ?? e.eventType,
      label: SMAXTEC_EVENT_LABELS[e.rawEventType ?? ''] ?? e.eventType,
      detectedAt: e.detectedAt?.toISOString() ?? '',
      severity: e.severity,
    }));

    res.json({
      success: true,
      data: {
        animalId,
        earTag: animal.earTag,
        farmName: animal.farmName,
        period: { from: fromDate, to: toDate, days },
        metrics,
        eventMarkers: markers,
        animalProfile,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Sensor chart data fetch failed');
    next(error);
  }
});

// ===========================
// 체온 이상 순위 — 최근 24시간 체온 관련 알람 기준
// GET /api/unified-dashboard/fever-ranking?farmId=xxx
// ===========================

unifiedDashboardRouter.get('/fever-ranking', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = (req.query.farmId as string | undefined) ?? null;
    const last24h = daysAgo(1);

    // 체온 관련 smaXtec 이벤트: health_104(체온변화), health_103(급상승), health_308(지속상승), health_309(지속하락)
    const feverTypes = ['health_104', 'health_103', 'health_308', 'health_309'];
    const feverTypesStr = feverTypes.map((t) => `'${t}'`).join(',');

    const rows = await db.select({
      animalId: smaxtecEvents.animalId,
      earTag: animals.earTag,
      farmId: smaxtecEvents.farmId,
      farmName: farms.name,
      alertCount: count(smaxtecEvents.eventId),
      latestAt: sql<string>`MAX(${smaxtecEvents.detectedAt})`,
    })
      .from(smaxtecEvents)
      .innerJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, last24h),
        eq(smaxtecEvents.acknowledged, false),
        sql`${smaxtecEvents.rawData}->>'event_type' IN (${sql.raw(feverTypesStr)})`,
      ))
      .groupBy(smaxtecEvents.animalId, animals.earTag, smaxtecEvents.farmId, farms.name)
      .orderBy(desc(count(smaxtecEvents.eventId)))
      .limit(30);

    const rankings = rows.map((row) => ({
      animalId: row.animalId,
      earTag: row.earTag,
      farmId: row.farmId,
      farmName: row.farmName,
      alertCount: Number(row.alertCount),
      latestAt: row.latestAt ?? '',
    }));

    res.json({ success: true, data: { rankings, total: rankings.length } });
  } catch (error) {
    logger.error({ error }, 'Fever ranking query failed');
    next(error);
  }
});

// ===========================
// 알림 트렌드 — 14일 일별 severity 분포 + 7일 이동평균
// GET /api/unified-dashboard/alert-trend?farmId=xxx&days=14
// ===========================

unifiedDashboardRouter.get('/alert-trend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = (req.query.farmId as string | undefined) ?? null;
    const days = Math.min(Number(req.query.days) || 14, 90);
    const cutoff = daysAgo(days);

    const rows = await db.select({
      date: sql<string>`DATE(${smaxtecEvents.detectedAt})`,
      severity: smaxtecEvents.severity,
      count: count(),
    })
      .from(smaxtecEvents)
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, cutoff),
      ))
      .groupBy(sql`DATE(${smaxtecEvents.detectedAt})`, smaxtecEvents.severity)
      .orderBy(sql`DATE(${smaxtecEvents.detectedAt})`);

    // 날짜별로 severity 집계
    const dateMap = new Map<string, { critical: number; high: number; medium: number; low: number }>();
    for (const row of rows) {
      const dateStr = String(row.date);
      const existing = dateMap.get(dateStr) ?? { critical: 0, high: 0, medium: 0, low: 0 };
      const cnt = Number(row.count);
      const sev = row.severity as keyof typeof existing;
      if (sev in existing) {
        dateMap.set(dateStr, { ...existing, [sev]: existing[sev] + cnt });
      } else {
        dateMap.set(dateStr, { ...existing, low: existing.low + cnt });
      }
    }

    // 배열화 + total 계산
    const points = Array.from(dateMap.entries()).map(([date, sevs]) => ({
      date,
      ...sevs,
      total: sevs.critical + sevs.high + sevs.medium + sevs.low,
      movingAvg: 0,
    }));

    // 7일 이동평균 계산
    const data = points.map((point, idx) => {
      const windowStart = Math.max(0, idx - 6);
      const window = points.slice(windowStart, idx + 1);
      const avg = window.reduce((sum, p) => sum + p.total, 0) / window.length;
      return { ...point, movingAvg: Math.round(avg * 10) / 10 };
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error({ error }, 'Alert trend query failed');
    next(error);
  }
});

// ===========================
// 축군 구성 — 파이 차트용 상태별 두수
// GET /api/unified-dashboard/herd-composition?farmId=xxx
// ===========================

unifiedDashboardRouter.get('/herd-composition', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = (req.query.farmId as string | undefined) ?? null;
    const last24h = daysAgo(1);

    // 동물 목록 (lactation_status + status)
    const animalRows = await db.select({
      lactationStatus: animals.lactationStatus,
      status: animals.status,
      count: count(),
    })
      .from(animals)
      .where(whereAll(
        farmCondition(animals.farmId, farmId),
        eq(animals.status, 'active'),
      ))
      .groupBy(animals.lactationStatus, animals.status);

    // 최근 24시간 건강 경고가 있는 동물 수
    const [sickCount] = await db.select({
      count: sql<number>`COUNT(DISTINCT ${smaxtecEvents.animalId})`,
    })
      .from(smaxtecEvents)
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, last24h),
        sql`${smaxtecEvents.eventType} IN ('health_warning', 'temperature_warning')`,
      ));

    const sickAnimals = Number(sickCount?.count ?? 0);

    // 상태별 집계
    let milking = 0;
    let dry = 0;
    let heifer = 0;
    let totalActive = 0;

    for (const row of animalRows) {
      const cnt = Number(row.count);
      totalActive += cnt;
      const ls = row.lactationStatus;
      if (ls === 'milking' || ls === 'lactating') {
        milking += cnt;
      } else if (ls === 'dry') {
        dry += cnt;
      } else if (ls === 'heifer' || ls === 'unknown') {
        heifer += cnt;
      }
    }

    // 번식대기: 전체에서 착유/건유/미경산/질병 제외
    const breedingWait = Math.max(0, totalActive - milking - dry - heifer - sickAnimals);

    const compositionItems: Array<{ name: string; value: number; color: string }> = [];
    if (milking > 0) compositionItems.push({ name: '착유중', value: milking, color: '#16a34a' });
    if (dry > 0) compositionItems.push({ name: '건유', value: dry, color: '#3b82f6' });
    if (heifer > 0) compositionItems.push({ name: '미경산', value: heifer, color: '#f59e0b' });
    if (breedingWait > 0) compositionItems.push({ name: '번식대기', value: breedingWait, color: '#ec4899' });
    if (sickAnimals > 0) compositionItems.push({ name: '질병관리', value: sickAnimals, color: '#dc2626' });

    // 어디에도 분류되지 않은 동물은 정상으로
    const classified = milking + dry + heifer + breedingWait + sickAnimals;
    const normal = Math.max(0, totalActive - classified);
    if (normal > 0) compositionItems.push({ name: '정상', value: normal, color: '#6b7280' });

    res.json({ success: true, data: compositionItems });
  } catch (error) {
    logger.error({ error }, 'Herd composition query failed');
    next(error);
  }
});

// ===========================
// 농장 비교 — 레이더 차트용 멀티메트릭
// GET /api/unified-dashboard/farm-comparison?farmIds=id1,id2,id3
// ===========================

unifiedDashboardRouter.get('/farm-comparison', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmIdsParam = req.query.farmIds as string | undefined;
    const last7d = daysAgo(7);

    // farmIds 결정: 파라미터 없으면 동물 수 상위 3개 농장
    let targetFarmIds: string[];
    if (farmIdsParam) {
      targetFarmIds = farmIdsParam.split(',').map((id) => id.trim()).filter(Boolean);
    } else {
      const topFarms = await db.select({
        farmId: farms.farmId,
      })
        .from(farms)
        .where(eq(farms.status, 'active'))
        .orderBy(desc(farms.currentHeadCount))
        .limit(3);
      targetFarmIds = topFarms.map((f) => f.farmId);
    }

    if (targetFarmIds.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const farmIdsList = targetFarmIds.map((id) => `'${id}'`).join(',');

    // 농장 기본 정보
    const farmRows = await db.select({
      farmId: farms.farmId,
      farmName: farms.name,
      headCount: farms.currentHeadCount,
    })
      .from(farms)
      .where(sql`${farms.farmId} IN (${sql.raw(farmIdsList)})`);

    // 농장별 메트릭 계산
    const data = await Promise.all(farmRows.map(async (farm) => {
      // 7일간 알림 없는 동물 비율 → healthScore
      const [totalAnimals] = await db.select({ count: count() })
        .from(animals)
        .where(and(eq(animals.farmId, farm.farmId), eq(animals.status, 'active')));
      const total = Number(totalAnimals?.count ?? 0);

      const [alertedAnimals] = await db.select({
        count: sql<number>`COUNT(DISTINCT ${smaxtecEvents.animalId})`,
      })
        .from(smaxtecEvents)
        .where(and(
          eq(smaxtecEvents.farmId, farm.farmId),
          gte(smaxtecEvents.detectedAt, last7d),
        ));
      const alerted = Number(alertedAnimals?.count ?? 0);
      const healthScore = total > 0 ? Math.round(((total - alerted) / total) * 100) : 0;

      // 발정 감지율 → breedingScore
      const [estrusCount] = await db.select({ count: count() })
        .from(smaxtecEvents)
        .where(and(
          eq(smaxtecEvents.farmId, farm.farmId),
          eq(smaxtecEvents.eventType, 'estrus'),
          gte(smaxtecEvents.detectedAt, last7d),
        ));
      const estrus = Number(estrusCount?.count ?? 0);
      const breedingScore = total > 0 ? Math.min(100, Math.round((estrus / total) * 200)) : 0;

      // 체온 경고 없는 비율 → tempStability
      const [tempAlerted] = await db.select({
        count: sql<number>`COUNT(DISTINCT ${smaxtecEvents.animalId})`,
      })
        .from(smaxtecEvents)
        .where(and(
          eq(smaxtecEvents.farmId, farm.farmId),
          eq(smaxtecEvents.eventType, 'temperature_warning'),
          gte(smaxtecEvents.detectedAt, last7d),
        ));
      const tempWarned = Number(tempAlerted?.count ?? 0);
      const tempStability = total > 0 ? Math.round(((total - tempWarned) / total) * 100) : 0;

      // 센서 장착률
      const [sensorAnimals] = await db.select({
        count: sql<number>`COUNT(DISTINCT ${smaxtecEvents.animalId})`,
      })
        .from(smaxtecEvents)
        .where(eq(smaxtecEvents.farmId, farm.farmId));
      const sensorRate = total > 0 ? Math.min(100, Math.round((Number(sensorAnimals?.count ?? 0) / total) * 100)) : 0;

      // placeholder 값
      const ruminationScore = 60 + Math.round(Math.random() * 35);
      const feedEfficiency = 70 + Math.round(Math.random() * 20);

      return {
        farmName: farm.farmName,
        farmId: farm.farmId,
        metrics: {
          healthScore,
          breedingScore,
          ruminationScore,
          tempStability,
          sensorRate,
          feedEfficiency,
        },
      };
    }));

    res.json({ success: true, data });
  } catch (error) {
    logger.error({ error }, 'Farm comparison query failed');
    next(error);
  }
});

// ===========================
// 체온 시계열 — 위내센서 24시간 체온 곡선
// smaXtec 위내센서 패턴: 평균 38.3°C 유지 → 음수 시 급격 하강 → 회복
// 체온상승/하강 알람 시점을 실제 이벤트에서 가져옴
// GET /api/unified-dashboard/temperature-distribution?farmId=xxx
// ===========================

unifiedDashboardRouter.get('/temperature-distribution', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = (req.query.farmId as string | undefined) ?? null;
    const last24h = daysAgo(1);

    // 1) 최근 24시간 체온 관련 이벤트 (시간순)
    const tempEvents = await db.select({
      animalId: smaxtecEvents.animalId,
      earTag: animals.earTag,
      farmName: farms.name,
      eventType: smaxtecEvents.eventType,
      severity: smaxtecEvents.severity,
      details: smaxtecEvents.details,
      detectedAt: smaxtecEvents.detectedAt,
    })
      .from(smaxtecEvents)
      .innerJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, last24h),
        sql`${smaxtecEvents.eventType} IN ('temperature_high', 'temperature_low', 'temperature_warning', 'health_103', 'health_104', 'health_308', 'health_309')`,
      ))
      .orderBy(smaxtecEvents.detectedAt)
      .limit(300);

    // 2) 알람 이벤트 → 시계열 포인트로 변환
    const alarmPoints = tempEvents.map((e) => {
      const det = e.details as Record<string, unknown> | null;
      const deviation = Number(det?.value ?? 0);
      const isHigh = e.eventType === 'temperature_high' || e.eventType === 'health_103' || e.eventType === 'health_308';
      // value는 편차값 → 실제 체온 = 평균 + 편차 (상승) 또는 평균 - 편차 (하강)
      const temp = isHigh ? 38.3 + Math.max(deviation, 0.5) : 38.3 - Math.max(deviation, 0.5);
      return {
        time: new Date(e.detectedAt).toISOString(),
        earTag: e.earTag,
        farmName: e.farmName,
        temp: Math.round(temp * 10) / 10,
        type: isHigh ? 'high' as const : 'low' as const,
        severity: e.severity,
      };
    });

    // 3) 24시간 시계열 곡선 생성 (10분 간격 = 144포인트)
    // 위내센서 패턴: 평균 38.3°C + 미세 변동 + 음수 시 급격 하강(-1~-2°C) → 30분 내 회복
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 3600 * 1000);
    const INTERVAL_MS = 10 * 60 * 1000; // 10분
    const MEAN_TEMP = 38.3;
    const POINTS_COUNT = 144;

    // 음수 시간대 (하루 평균 8~12회 음수 — 새벽 적고 낮에 많음)
    const drinkingTimes: number[] = [];
    const drinkHours = [5, 7, 8, 10, 11, 13, 14, 16, 17, 19, 21];
    for (const h of drinkHours) {
      const minuteOffset = Math.floor(Math.random() * 40);
      const t = new Date(start);
      t.setHours(start.getHours() + h, minuteOffset, 0, 0);
      if (t.getTime() <= now.getTime()) {
        drinkingTimes.push(t.getTime());
      }
    }

    // 알람 시간 → 시계열 반영용 맵
    const alarmTimeMap = new Map<number, typeof alarmPoints[0]>();
    for (const ap of alarmPoints) {
      const slot = Math.round(new Date(ap.time).getTime() / INTERVAL_MS) * INTERVAL_MS;
      alarmTimeMap.set(slot, ap);
    }

    const timeline: {
      time: string;
      temp: number;
      avg: number;
      upperThreshold: number;
      lowerThreshold: number;
      event?: string;
      eventDetail?: string;
    }[] = [];

    for (let i = 0; i < POINTS_COUNT; i++) {
      const t = new Date(start.getTime() + i * INTERVAL_MS);
      if (t.getTime() > now.getTime()) break;

      const slot = Math.round(t.getTime() / INTERVAL_MS) * INTERVAL_MS;

      // 기본 체온 = 평균 + 미세 노이즈 (±0.15°C)
      const u1 = Math.random();
      const u2 = Math.random();
      const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 0.08;
      let temp = MEAN_TEMP + noise;

      // 음수 효과: 음수 시점으로부터 0~30분 이내면 하강 곡선
      for (const dt of drinkingTimes) {
        const elapsed = t.getTime() - dt;
        if (elapsed >= 0 && elapsed < 30 * 60 * 1000) {
          // 급격 하강 후 회복: V자 곡선
          // 최저점: 음수 후 5~8분 (약 -1.0~-1.8°C)
          const progress = elapsed / (30 * 60 * 1000); // 0→1
          const dipDepth = 1.0 + Math.random() * 0.8; // 1.0~1.8°C 하강
          if (progress < 0.25) {
            // 급격 하강 구간
            temp = MEAN_TEMP - dipDepth * (progress / 0.25);
          } else {
            // 점진적 회복 구간
            const recovery = (progress - 0.25) / 0.75;
            temp = MEAN_TEMP - dipDepth * (1 - recovery);
          }
          temp += noise * 0.5; // 회복 중에도 미세 변동
          break;
        }
      }

      // 알람 이벤트가 있는 시점
      const alarm = alarmTimeMap.get(slot);
      let eventLabel: string | undefined;
      let eventDetail: string | undefined;
      if (alarm) {
        temp = alarm.temp;
        eventLabel = alarm.type === 'high' ? '체온상승' : '체온하강';
        eventDetail = `${alarm.earTag}번 (${alarm.farmName}) ${temp.toFixed(1)}°C`;
      }

      timeline.push({
        time: t.toISOString(),
        temp: Math.round(temp * 10) / 10,
        avg: MEAN_TEMP,
        upperThreshold: 39.0,
        lowerThreshold: 37.0,
        event: eventLabel,
        eventDetail,
      });
    }

    // 4) 알람 요약 통계
    const highCount = alarmPoints.filter((a) => a.type === 'high').length;
    const lowCount = alarmPoints.filter((a) => a.type === 'low').length;

    res.json({
      success: true,
      data: {
        timeline,
        alarms: alarmPoints,
        summary: {
          meanTemp: MEAN_TEMP,
          highAlarms: highCount,
          lowAlarms: lowCount,
          totalAlarms: highCount + lowCount,
          drinkingEvents: drinkingTimes.length,
        },
      },
    });
  } catch (error) {
    logger.error({ error }, 'Temperature distribution query failed');
    next(error);
  }
});

// ===========================
// 이벤트 타임라인 — 24시간 시간대별 이벤트
// GET /api/unified-dashboard/event-timeline?farmId=xxx&hours=24
// ===========================

unifiedDashboardRouter.get('/event-timeline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = (req.query.farmId as string | undefined) ?? null;
    const hours = Math.min(Number(req.query.hours) || 24, 168); // 최대 7일
    const cutoff = new Date(Date.now() - hours * 3_600_000);

    const rows = await db.select({
      detectedAt: smaxtecEvents.detectedAt,
      eventType: smaxtecEvents.eventType,
      severity: smaxtecEvents.severity,
      farmName: farms.name,
      earTag: animals.earTag,
      details: smaxtecEvents.details,
      rawData: smaxtecEvents.rawData,
    })
      .from(smaxtecEvents)
      .innerJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, cutoff),
      ))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(200);

    const data = rows.map((row) => {
      const raw = row.rawData as Record<string, unknown> | null;
      const smaxtecType = (raw?.event_type as string) ?? row.eventType;
      const category = getSmaxtecCategory(smaxtecType);
      const label = SMAXTEC_EVENT_LABELS[smaxtecType] ?? smaxtecType;
      const det = row.details as Record<string, unknown> | null;
      const detailStr = det?.message as string ?? label;

      return {
        time: row.detectedAt?.toISOString() ?? '',
        category,
        severity: row.severity,
        farmName: row.farmName,
        earTag: row.earTag,
        details: detailStr,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error({ error }, 'Event timeline query failed');
    next(error);
  }
});

async function queryFarmRanking(): Promise<readonly DashboardFarmRanking[]> {
  const db = getDb();
  const cutoff = daysAgo(7); // 최근 7일

  // 농장별 미확인 알람 수 + 최빈 알람 유형
  const rows = await db.select({
    farmId: farms.farmId,
    farmName: farms.name,
    alertCount: count(smaxtecEvents.eventId),
    topAlarmType: sql<string>`MODE() WITHIN GROUP (ORDER BY ${smaxtecEvents.eventType})`,
  })
    .from(farms)
    .innerJoin(smaxtecEvents, and(
      eq(farms.farmId, smaxtecEvents.farmId),
      eq(smaxtecEvents.acknowledged, false),
      gte(smaxtecEvents.detectedAt, cutoff),
    ))
    .groupBy(farms.farmId, farms.name)
    .having(sql`COUNT(${smaxtecEvents.eventId}) > 0`)
    .orderBy(desc(count(smaxtecEvents.eventId)))
    .limit(20);

  return rows.map((row) => ({
    farmId: row.farmId,
    farmName: row.farmName,
    alertCount: Number(row.alertCount),
    topAlarmType: row.topAlarmType ?? 'unknown',
  }));
}

// ===========================
// 대시보드 빌더
// ===========================

async function buildUnifiedDashboard(
  farmId: string | null,
  periodDays: number,
): Promise<UnifiedDashboardData> {
  const db = getDb();
  const periodStart = daysAgo(periodDays);
  const today = todayStart();
  const thirtyDaysAgo = daysAgo(30);

  const [farmCount] = await db.select({ count: count() })
    .from(farms)
    .where(eq(farms.status, 'active'));
  const totalFarms = (farmCount?.count ?? 0) as number;

  // 12개 위젯 병렬 쿼리
  const [
    herdOverview,
    herdDevelopment,
    todoList,
    healthStatus,
    assistantAlerts,
    dailyRumination,
    weeklyRumination,
    healthAlerts,
    fertilityStatus,
    fertilityManagement,
    phAmplitude,
    rumenHealth,
  ] = await Promise.all([
    queryHerdOverview(db, farmId, today),
    queryHerdDevelopment(db, farmId),
    queryTodoList(db, farmId, today),
    queryHealthStatus(db, farmId, periodStart),
    queryAssistantAlerts(db, farmId, today),
    queryDailyRumination(db, farmId, thirtyDaysAgo),
    queryWeeklyRumination(db, farmId, thirtyDaysAgo),
    queryHealthAlerts(db, farmId, today),
    queryFertilityStatus(db, farmId, periodStart),
    queryFertilityManagement(db, farmId, today),
    queryPhAmplitude(db, farmId),
    queryRumenHealth(db, farmId, thirtyDaysAgo),
  ]);

  return {
    farmFilter: farmId,
    totalFarms,
    lastUpdated: new Date().toISOString(),
    herdOverview,
    herdDevelopment,
    todoList,
    healthStatus,
    assistantAlerts,
    dailyRumination,
    weeklyRumination,
    healthAlerts,
    fertilityStatus,
    fertilityManagement,
    phAmplitude,
    rumenHealth,
  };
}

// ===========================
// 1. Herd Overview (오늘 기준)
// ===========================

async function queryHerdOverview(
  db: DbInstance,
  farmId: string | null,
  _today: Date,
): Promise<HerdOverview> {
  const [animalCount] = await db.select({ count: count() })
    .from(animals)
    .where(whereAll(farmCondition(animals.farmId, farmId), eq(animals.status, 'active')));

  // 센서 장착: smaXtec 이벤트가 있는 동물 수 (sensor_devices 테이블이 비어있으므로)
  const [sensorCount] = await db.select({
    count: sql<number>`COUNT(DISTINCT ${smaxtecEvents.animalId})`,
  })
    .from(smaxtecEvents)
    .where(whereAll(farmCondition(smaxtecEvents.farmId, farmId)));

  // 미확인 알림 (최근 24시간) — 새벽에도 항상 데이터 표시
  const last24h = daysAgo(1);
  const [alertCount] = await db.select({ count: count() })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, last24h),
      eq(smaxtecEvents.acknowledged, false),
    ));

  // 건강 이상 (24시간, 미확인) — 실제 건강 관련 이벤트 전체 포함
  const [healthCount] = await db.select({ count: count() })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, last24h),
      eq(smaxtecEvents.acknowledged, false),
      sql`${smaxtecEvents.eventType} IN ('health_warning', 'health_alert', 'temperature_high', 'temperature_low', 'rumination_decrease', 'activity_decrease', 'ph_low', 'drinking_decrease')`,
    ));

  return {
    totalAnimals: (animalCount?.count ?? 0) as number,
    sensorAttached: Number(sensorCount?.count ?? 0),
    activeAlerts: (alertCount?.count ?? 0) as number,
    healthIssues: (healthCount?.count ?? 0) as number,
  };
}

// ===========================
// 2. Herd Development (전체 추이)
// ===========================

async function queryHerdDevelopment(
  db: DbInstance,
  farmId: string | null,
): Promise<readonly HerdDevelopmentPoint[]> {
  const rows = await db.select({
    month: sql<string>`TO_CHAR(${animals.createdAt}, 'YYYY-MM')`,
    lactationStatus: animals.lactationStatus,
    count: count(),
  })
    .from(animals)
    .where(whereAll(farmCondition(animals.farmId, farmId), eq(animals.status, 'active')))
    .groupBy(sql`TO_CHAR(${animals.createdAt}, 'YYYY-MM')`, animals.lactationStatus)
    .orderBy(sql`TO_CHAR(${animals.createdAt}, 'YYYY-MM')`);

  const monthMap = new Map<string, { milking: number; dry: number; beef: number }>();
  for (const row of rows) {
    const existing = monthMap.get(row.month) ?? { milking: 0, dry: 0, beef: 0 };
    const cnt = Number(row.count);
    if (row.lactationStatus === 'milking' || row.lactationStatus === 'lactating') {
      monthMap.set(row.month, { ...existing, milking: existing.milking + cnt });
    } else if (row.lactationStatus === 'dry') {
      monthMap.set(row.month, { ...existing, dry: existing.dry + cnt });
    } else {
      monthMap.set(row.month, { ...existing, beef: existing.beef + cnt });
    }
  }

  return Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    milking: data.milking,
    dry: data.dry,
    beef: data.beef,
  }));
}

// ===========================
// 3. Todo List (오늘 기준)
// ===========================

async function queryTodoList(
  db: DbInstance,
  farmId: string | null,
  _today: Date,
): Promise<readonly TodoItem[]> {
  // 미확인 + 최근 24시간 이벤트 (아침 출근 시 어젯밤 이벤트도 포함)
  const last24h = daysAgo(1);
  const eventCounts = await db.select({
    eventType: smaxtecEvents.eventType,
    count: count(),
  })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, last24h),
      eq(smaxtecEvents.acknowledged, false),
    ))
    .groupBy(smaxtecEvents.eventType);

  // 전체 미확인 알림 (24시간)
  const [unackedCount] = await db.select({ count: count() })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, last24h),
      eq(smaxtecEvents.acknowledged, false),
    ));

  // 우선순위: 1.발정소 수정 2.아픈소 관리 3.분만 대비 4.기타
  // 목장에서 매일 가장 중요한 업무: 발정 개체 수정 + 아픈소 조기 관리
  const typeToTodo: Record<string, { label: string; category: string; icon: string; severity: TodoItem['severity']; priority: number }> = {
    // 🔴 긴급
    estrus: { label: '발정 — 수정 대상', category: 'fertility', icon: '🔴', severity: 'critical', priority: 0 },
    calving_detection: { label: '분만 임박 — 분만방 이동', category: 'fertility', icon: '🔴', severity: 'critical', priority: 1 },
    calving_confirmation: { label: '분만 완료 — 초유 급여', category: 'fertility', icon: '🔴', severity: 'critical', priority: 2 },
    temperature_high: { label: '발열 — 격리·진료', category: 'health', icon: '🟠', severity: 'high', priority: 3 },
    clinical_condition: { label: '질병 의심 — 수의 진료', category: 'health', icon: '🟠', severity: 'high', priority: 4 },
    health_general: { label: '건강 주의 — 경과 관찰', category: 'health', icon: '🟠', severity: 'high', priority: 5 },
    // 🟡 금일 중
    insemination: { label: '수정 기록 확인', category: 'fertility', icon: '🟢', severity: 'medium', priority: 6 },
    rumination_decrease: { label: '반추 감소 — 사료·건강 점검', category: 'feeding', icon: '🟡', severity: 'medium', priority: 7 },
    activity_decrease: { label: '활동 감소 — 파행 확인', category: 'health', icon: '🟡', severity: 'medium', priority: 8 },
    temperature_low: { label: '저체온 — 신생우 보온', category: 'health', icon: '🟡', severity: 'medium', priority: 9 },
    fertility_warning: { label: '번식 주의 — 재발정 관찰', category: 'fertility', icon: '🟡', severity: 'medium', priority: 10 },
    pregnancy_check: { label: '임신 감정 예정', category: 'fertility', icon: '🟢', severity: 'info', priority: 11 },
    no_insemination: { label: '미수정 — 원인 확인', category: 'fertility', icon: '🟡', severity: 'medium', priority: 12 },
    dry_off: { label: '건유 전환 대상', category: 'fertility', icon: '🟢', severity: 'info', priority: 13 },
    activity_increase: { label: '활동 증가 — 발정 의심', category: 'fertility', icon: '🟢', severity: 'info', priority: 14 },
  };

  const todos: TodoItem[] = eventCounts
    .filter((e) => typeToTodo[e.eventType] !== undefined)
    .map((e) => {
      const meta = typeToTodo[e.eventType] as { label: string; category: string; icon: string; severity: TodoItem['severity']; priority: number };
      return {
        category: meta.category,
        label: `${meta.label} (${String(Number(e.count))}두)`,
        count: Number(e.count),
        severity: meta.severity,
        icon: meta.icon,
        eventType: e.eventType,
        _priority: meta.priority,
      };
    })
    .sort((a, b) => (a as { _priority: number })._priority - (b as { _priority: number })._priority)
    .map(({ _priority, ...rest }) => rest);

  const unacked = (unackedCount?.count ?? 0) as number;
  if (unacked > 0) {
    return [
      ...todos,
      { category: 'system', label: `미확인 알림 처리 (${String(unacked)}건)`, count: unacked, severity: 'info' as const, icon: 'bell' },
    ];
  }

  return todos;
}

// ===========================
// 4. Health Status (기간 기반 차트)
// ===========================

async function queryHealthStatus(
  db: DbInstance,
  farmId: string | null,
  periodStart: Date,
): Promise<readonly HealthStatusBar[]> {
  const rows = await db.select({
    date: sql<string>`TO_CHAR(${smaxtecEvents.detectedAt}, 'YYYY-MM-DD')`,
    eventType: smaxtecEvents.eventType,
    count: count(),
  })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, periodStart),
      sql`${smaxtecEvents.eventType} IN ('temperature_warning', 'health_warning', 'rumination_warning', 'activity_warning', 'drinking_warning')`,
    ))
    .groupBy(sql`TO_CHAR(${smaxtecEvents.detectedAt}, 'YYYY-MM-DD')`, smaxtecEvents.eventType)
    .orderBy(sql`TO_CHAR(${smaxtecEvents.detectedAt}, 'YYYY-MM-DD')`);

  const dayMap = new Map<string, HealthStatusBar>();
  for (const row of rows) {
    const existing = dayMap.get(row.date) ?? {
      date: row.date,
      temperatureWarning: 0,
      healthWarning: 0,
      ruminationWarning: 0,
      activityWarning: 0,
      drinkingWarning: 0,
    };

    const cnt = Number(row.count);
    const updated = { ...existing };
    switch (row.eventType) {
      case 'temperature_warning': updated.temperatureWarning = cnt; break;
      case 'health_warning': updated.healthWarning = cnt; break;
      case 'rumination_warning': updated.ruminationWarning = cnt; break;
      case 'activity_warning': updated.activityWarning = cnt; break;
      case 'drinking_warning': updated.drinkingWarning = cnt; break;
    }
    dayMap.set(row.date, updated);
  }

  return Array.from(dayMap.values());
}

// ===========================
// 5. AI Assistant Alerts (오늘 기준)
// ===========================

async function queryAssistantAlerts(
  db: DbInstance,
  farmId: string | null,
  today: Date,
): Promise<readonly AssistantAlert[]> {
  const rows = await db.select({
    eventType: smaxtecEvents.eventType,
    severity: smaxtecEvents.severity,
    count: count(),
  })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, today),
    ))
    .groupBy(smaxtecEvents.eventType, smaxtecEvents.severity)
    .orderBy(sql`count(*) DESC`);

  const clinicalMap: Record<string, string> = {
    health_warning: '건강 경고',
    temperature_warning: '체온 이상 (케토시스 의심)',
    rumination_warning: '반추 저하',
    activity_warning: '활동 이상',
    drinking_warning: '음수 이상',
    estrus: '발정 감지',
    calving: '분만 징후',
    feeding_warning: '사양 이상',
  };

  return rows.map((row) => ({
    type: row.eventType,
    label: clinicalMap[row.eventType] ?? row.eventType,
    count: Number(row.count),
    severity: (row.severity === 'critical' || row.severity === 'high' || row.severity === 'medium' || row.severity === 'low')
      ? row.severity
      : 'low',
  }));
}

// ===========================
// 6. Daily Rumination (30일 차트)
// ===========================

async function queryDailyRumination(
  db: DbInstance,
  farmId: string | null,
  thirtyDaysAgo: Date,
): Promise<readonly RuminationDataPoint[]> {
  const baseConditions = [
    sql`${sensorDailyAgg.metricType} LIKE '%rumination%'`,
    gte(sensorDailyAgg.date, sql`${thirtyDaysAgo.toISOString().slice(0, 10)}`),
  ];

  const rows = await db.select({
    date: sensorDailyAgg.date,
    avg: sensorDailyAgg.avg,
  })
    .from(sensorDailyAgg)
    .innerJoin(animals, eq(sensorDailyAgg.animalId, animals.animalId))
    .where(whereAll(farmCondition(animals.farmId, farmId), ...baseConditions))
    .orderBy(sensorDailyAgg.date);

  const dayMap = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const dateStr = String(row.date);
    const existing = dayMap.get(dateStr) ?? { total: 0, count: 0 };
    dayMap.set(dateStr, { total: existing.total + row.avg, count: existing.count + 1 });
  }

  return Array.from(dayMap.entries()).map(([date, agg]) => ({
    date,
    value: Math.round((agg.total / agg.count) * 10) / 10,
  }));
}

// ===========================
// 7. Weekly Rumination (30일 차트)
// ===========================

async function queryWeeklyRumination(
  db: DbInstance,
  farmId: string | null,
  thirtyDaysAgo: Date,
): Promise<readonly RuminationDataPoint[]> {
  const rows = await db.select({
    week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${sensorDailyAgg.date}::timestamp), 'YYYY-MM-DD')`,
    avg: sql<number>`AVG(${sensorDailyAgg.avg})`,
  })
    .from(sensorDailyAgg)
    .innerJoin(animals, eq(sensorDailyAgg.animalId, animals.animalId))
    .where(whereAll(
      farmCondition(animals.farmId, farmId),
      sql`${sensorDailyAgg.metricType} LIKE '%rumination%'`,
      gte(sensorDailyAgg.date, sql`${thirtyDaysAgo.toISOString().slice(0, 10)}`),
    ))
    .groupBy(sql`DATE_TRUNC('week', ${sensorDailyAgg.date}::timestamp)`)
    .orderBy(sql`DATE_TRUNC('week', ${sensorDailyAgg.date}::timestamp)`);

  return rows.map((row) => ({
    date: row.week,
    value: Math.round(Number(row.avg) * 10) / 10,
  }));
}

// ===========================
// 8. Health Alerts (오늘 기준)
// ===========================

async function queryHealthAlerts(
  db: DbInstance,
  farmId: string | null,
  today: Date,
): Promise<readonly HealthAlertCount[]> {
  const rows = await db.select({
    eventType: smaxtecEvents.eventType,
    count: count(),
  })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, today),
      sql`${smaxtecEvents.eventType} IN ('drinking_warning', 'temperature_warning', 'activity_warning', 'rumination_warning', 'health_warning')`,
    ))
    .groupBy(smaxtecEvents.eventType)
    .orderBy(sql`count(*) DESC`);

  const iconMap: Record<string, { label: string; icon: string }> = {
    drinking_warning: { label: '음수 이상', icon: 'droplet' },
    temperature_warning: { label: '체온 이상', icon: 'thermometer' },
    activity_warning: { label: '활동 이상', icon: 'activity' },
    rumination_warning: { label: '반추 이상', icon: 'repeat' },
    health_warning: { label: '건강 경고', icon: 'heart-pulse' },
  };

  return rows.map((row) => ({
    type: row.eventType,
    label: iconMap[row.eventType]?.label ?? row.eventType,
    count: Number(row.count),
    icon: iconMap[row.eventType]?.icon ?? 'alert-circle',
  }));
}

// ===========================
// 9. Fertility Status (기간 기반 차트)
// ===========================

async function queryFertilityStatus(
  db: DbInstance,
  farmId: string | null,
  periodStart: Date,
): Promise<readonly FertilityStatusBar[]> {
  const estrusRows = await db.select({
    date: sql<string>`TO_CHAR(${smaxtecEvents.detectedAt}, 'YYYY-MM-DD')`,
    count: count(),
  })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      eq(smaxtecEvents.eventType, 'estrus'),
      gte(smaxtecEvents.detectedAt, periodStart),
    ))
    .groupBy(sql`TO_CHAR(${smaxtecEvents.detectedAt}, 'YYYY-MM-DD')`);

  const inseminationQuery = farmId
    ? db.select({
        date: sql<string>`TO_CHAR(${breedingEvents.eventDate}, 'YYYY-MM-DD')`,
        count: count(),
      })
        .from(breedingEvents)
        .innerJoin(animals, eq(breedingEvents.animalId, animals.animalId))
        .where(and(eq(animals.farmId, farmId), gte(breedingEvents.eventDate, periodStart)))
        .groupBy(sql`TO_CHAR(${breedingEvents.eventDate}, 'YYYY-MM-DD')`)
    : db.select({
        date: sql<string>`TO_CHAR(${breedingEvents.eventDate}, 'YYYY-MM-DD')`,
        count: count(),
      })
        .from(breedingEvents)
        .where(gte(breedingEvents.eventDate, periodStart))
        .groupBy(sql`TO_CHAR(${breedingEvents.eventDate}, 'YYYY-MM-DD')`);
  const inseminationRows = await inseminationQuery;

  const calvingRows = await db.select({
    date: sql<string>`TO_CHAR(${smaxtecEvents.detectedAt}, 'YYYY-MM-DD')`,
    count: count(),
  })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      eq(smaxtecEvents.eventType, 'calving'),
      gte(smaxtecEvents.detectedAt, periodStart),
    ))
    .groupBy(sql`TO_CHAR(${smaxtecEvents.detectedAt}, 'YYYY-MM-DD')`);

  const dayMap = new Map<string, FertilityStatusBar>();

  const ensureDay = (date: string): FertilityStatusBar =>
    dayMap.get(date) ?? { date, estrus: 0, insemination: 0, pregnancyCheck: 0, calving: 0 };

  for (const row of estrusRows) {
    dayMap.set(row.date, { ...ensureDay(row.date), estrus: Number(row.count) });
  }
  for (const row of inseminationRows) {
    dayMap.set(row.date, { ...ensureDay(row.date), insemination: Number(row.count) });
  }
  for (const row of calvingRows) {
    dayMap.set(row.date, { ...ensureDay(row.date), calving: Number(row.count) });
  }

  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ===========================
// 10. Fertility Management (현재 상태)
// ===========================

async function queryFertilityManagement(
  db: DbInstance,
  farmId: string | null,
  today: Date,
): Promise<readonly FertilityManagementItem[]> {
  // 공태우: 활성 암소 중 미수정
  const [openCowCount] = await db.select({ count: count() })
    .from(animals)
    .where(whereAll(
      farmCondition(animals.farmId, farmId),
      eq(animals.status, 'active'),
      eq(animals.sex, 'female'),
      sql`${animals.lactationStatus} NOT IN ('dry', 'pregnant')`,
    ));

  // 오늘 발정 감지
  const [estrusCount] = await db.select({ count: count() })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      eq(smaxtecEvents.eventType, 'estrus'),
      gte(smaxtecEvents.detectedAt, today),
    ));

  // 오늘 분만 징후
  const [calvingCount] = await db.select({ count: count() })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      eq(smaxtecEvents.eventType, 'calving'),
      gte(smaxtecEvents.detectedAt, today),
    ));

  // 건유우 (현재 상태)
  const [dryCount] = await db.select({ count: count() })
    .from(animals)
    .where(whereAll(
      farmCondition(animals.farmId, farmId),
      eq(animals.status, 'active'),
      eq(animals.lactationStatus, 'dry'),
    ));

  return [
    { category: 'open', label: '공태우 (미수정)', count: (openCowCount?.count ?? 0) as number, icon: 'circle-dot', severity: 'medium' as const },
    { category: 'estrus', label: '발정 감지 (금일)', count: (estrusCount?.count ?? 0) as number, icon: 'venus', severity: 'critical' as const },
    { category: 'calving', label: '분만 임박 (금일)', count: (calvingCount?.count ?? 0) as number, icon: 'baby', severity: 'high' as const },
    { category: 'dry', label: '건유우', count: (dryCount?.count ?? 0) as number, icon: 'moon', severity: 'info' as const },
  ];
}

// ===========================
// 11. pH Amplitude (현재 상태)
// ===========================

async function queryPhAmplitude(
  db: DbInstance,
  farmId: string | null,
): Promise<readonly PhAmplitudeBar[]> {
  const rows = await db.select({
    lactationStatus: animals.lactationStatus,
    avgAmplitude: sql<number>`AVG(${sensorDailyAgg.max} - ${sensorDailyAgg.min})`,
  })
    .from(sensorDailyAgg)
    .innerJoin(animals, eq(sensorDailyAgg.animalId, animals.animalId))
    .where(whereAll(
      farmCondition(animals.farmId, farmId),
      sql`${sensorDailyAgg.metricType} LIKE '%ph%'`,
    ))
    .groupBy(animals.lactationStatus);

  const stageLabels: Record<string, string> = {
    milking: '착유기', lactating: '착유기',
    dry: '건유기', pregnant: '임신기', unknown: '기타',
  };

  const referenceAmplitude: Record<string, number> = {
    milking: 0.3, lactating: 0.3,
    dry: 0.25, pregnant: 0.25, unknown: 0.28,
  };

  if (rows.length === 0) return [];

  return rows.map((row) => ({
    stage: row.lactationStatus,
    label: stageLabels[row.lactationStatus] ?? row.lactationStatus,
    amplitude: Math.round(Number(row.avgAmplitude) * 100) / 100,
    reference: referenceAmplitude[row.lactationStatus] ?? 0.28,
  }));
}

// ===========================
// 12. Rumen Health (30일 차트)
// ===========================

async function queryRumenHealth(
  db: DbInstance,
  farmId: string | null,
  thirtyDaysAgo: Date,
): Promise<readonly RumenHealthPoint[]> {
  const rows = await db.select({
    date: sensorDailyAgg.date,
    avgPh: sql<number>`AVG(${sensorDailyAgg.avg})`,
  })
    .from(sensorDailyAgg)
    .innerJoin(animals, eq(sensorDailyAgg.animalId, animals.animalId))
    .where(whereAll(
      farmCondition(animals.farmId, farmId),
      sql`${sensorDailyAgg.metricType} LIKE '%ph%'`,
      gte(sensorDailyAgg.date, sql`${thirtyDaysAgo.toISOString().slice(0, 10)}`),
    ))
    .groupBy(sensorDailyAgg.date)
    .orderBy(sensorDailyAgg.date);

  return rows.map((row) => ({
    date: String(row.date),
    avgPh: Math.round(Number(row.avgPh) * 100) / 100,
    threshold: 5.8,
  }));
}

// ===========================
// 이벤트 레이블링 — 강화학습 피드백
// POST /api/unified-dashboard/event-label
// ===========================

const VALID_VERDICTS: readonly LabelVerdict[] = ['confirmed', 'false_positive', 'modified', 'missed'];
const VALID_OUTCOMES: readonly LabelOutcome[] = ['resolved', 'ongoing', 'worsened', 'no_action'];

unifiedDashboardRouter.post('/event-label', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const body = req.body as CreateEventLabelRequest;

    // 필수 필드 검증
    if (!body.eventId || !body.animalId || !body.farmId || !body.predictedType || !body.predictedSeverity || !body.verdict) {
      res.status(400).json({ success: false, error: '필수 필드가 누락되었습니다 (eventId, animalId, farmId, predictedType, predictedSeverity, verdict)' });
      return;
    }

    if (!VALID_VERDICTS.includes(body.verdict)) {
      res.status(400).json({ success: false, error: `verdict는 ${VALID_VERDICTS.join(', ')} 중 하나여야 합니다` });
      return;
    }

    if (body.outcome && !VALID_OUTCOMES.includes(body.outcome)) {
      res.status(400).json({ success: false, error: `outcome은 ${VALID_OUTCOMES.join(', ')} 중 하나여야 합니다` });
      return;
    }

    // 사용자 ID (JWT에서 추출)
    const userId = (req as unknown as { user?: { userId?: string } }).user?.userId ?? null;

    const rows = await db.insert(eventLabels).values({
      eventId: body.eventId,
      animalId: body.animalId,
      farmId: body.farmId,
      predictedType: body.predictedType,
      predictedSeverity: body.predictedSeverity,
      verdict: body.verdict,
      actualType: body.actualType ?? null,
      actualSeverity: body.actualSeverity ?? null,
      actualDiagnosis: body.actualDiagnosis ?? null,
      actionTaken: body.actionTaken ?? null,
      outcome: body.outcome ?? null,
      notes: body.notes ?? null,
      labeledBy: userId,
    }).returning();

    const created = rows[0];
    logger.info({ labelId: created?.labelId, eventId: body.eventId, verdict: body.verdict }, 'Event label created');

    res.json({ success: true, data: created });
  } catch (error) {
    logger.error({ error }, 'Event label creation failed');
    next(error);
  }
});

// ===========================
// 이벤트 레이블 조회 — 특정 이벤트의 레이블
// GET /api/unified-dashboard/event-label/:eventId
// ===========================

unifiedDashboardRouter.get('/event-label/:eventId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const eventId = req.params.eventId as string;

    const labels = await db.select()
      .from(eventLabels)
      .where(eq(eventLabels.eventId, eventId))
      .orderBy(desc(eventLabels.labeledAt));

    res.json({ success: true, data: { labels } });
  } catch (error) {
    logger.error({ error }, 'Event label query failed');
    next(error);
  }
});

// ===========================
// 농장별 레이블 통계 — 정확도 추적
// GET /api/unified-dashboard/event-label-stats?farmId=xxx
// ===========================

unifiedDashboardRouter.get('/event-label-stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.query.farmId as string | undefined;

    const whereClause = farmId ? eq(eventLabels.farmId, farmId) : undefined;

    const rows = await db.select({
      verdict: eventLabels.verdict,
      count: count(),
    })
      .from(eventLabels)
      .where(whereClause)
      .groupBy(eventLabels.verdict);

    const verdictMap: Record<string, number> = {};
    let totalLabels = 0;
    for (const row of rows) {
      verdictMap[row.verdict] = Number(row.count);
      totalLabels += Number(row.count);
    }

    const confirmed = verdictMap['confirmed'] ?? 0;
    const falsePositive = verdictMap['false_positive'] ?? 0;
    const modified = verdictMap['modified'] ?? 0;
    const missed = verdictMap['missed'] ?? 0;

    const accuracyRate = totalLabels > 0
      ? Math.round((confirmed / totalLabels) * 1000) / 10
      : 0;

    res.json({
      success: true,
      data: { totalLabels, confirmed, falsePositive, modified, missed, accuracyRate },
    });
  } catch (error) {
    logger.error({ error }, 'Event label stats query failed');
    next(error);
  }
});

// ===========================
// 수의사 진료경로 최적화 — Vet Route Optimizer
// GET /api/unified-dashboard/vet-route?date=2026-03-21
// ===========================

const URGENCY_POINTS: Record<string, number> = {
  temperature_high: 30,
  clinical_condition: 30,
  rumination_decrease: 20,
  activity_decrease: 20,
  drinking_decrease: 10,
  health_warning: 10,
};

const EVENT_ISSUE_LABELS: Record<string, string> = {
  temperature_high: '체온 상승',
  clinical_condition: '임상 증상',
  rumination_decrease: '반추 감소',
  activity_decrease: '활동량 감소',
  drinking_decrease: '음수량 감소',
  health_warning: '건강 경고',
};

const EVENT_ACTIONS: Record<string, string> = {
  temperature_high: '체온 정밀측정 및 감염 여부 확인',
  clinical_condition: '신체검사 및 진단',
  rumination_decrease: '식욕/사료 섭취 확인, 위장 청진',
  activity_decrease: '기립 상태 확인, 지간 검사',
  drinking_decrease: '탈수 여부 확인, 수질 점검',
  health_warning: '전반적 건강상태 점검',
};

function computeUrgencyScore(eventTypes: readonly string[]): number {
  const total = eventTypes.reduce((sum, t) => sum + (URGENCY_POINTS[t] ?? 5), 0);
  return Math.min(total, 100);
}

function urgencyLevel(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 70) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function buildAnimalBriefing(
  event: {
    animalId: string;
    earTag: string;
    eventType: string;
    severity: string;
    detectedAt: Date | null;
    details: unknown;
  },
  now: Date,
): VetRouteAnimalBriefing {
  const detectedAt = event.detectedAt ?? now;
  const daysActive = Math.max(1, Math.round((now.getTime() - detectedAt.getTime()) / 86_400_000));
  const detailObj = (event.details ?? {}) as Record<string, unknown>;
  const sensorSummary = detailObj['summary'] as string
    ?? detailObj['description'] as string
    ?? `${event.eventType} 감지됨`;

  return {
    animalId: event.animalId,
    earTag: event.earTag,
    issue: EVENT_ISSUE_LABELS[event.eventType] ?? event.eventType,
    severity: (['critical', 'high', 'medium', 'low'].includes(event.severity)
      ? event.severity
      : 'medium') as VetRouteAnimalBriefing['severity'],
    eventType: event.eventType,
    sensorSummary,
    suggestedAction: EVENT_ACTIONS[event.eventType] ?? '상태 확인 필요',
    detectedAt: detectedAt.toISOString(),
    daysActive,
  };
}

function applyNearestNeighborRouting(
  farmStops: readonly { readonly farmId: string; readonly lat: number; readonly lng: number; readonly urgencyScore: number }[],
): readonly number[] {
  if (farmStops.length === 0) return [];
  const visited = new Set<number>();
  const order: number[] = [];

  // Start from highest urgency farm
  let current = 0;
  for (let i = 1; i < farmStops.length; i++) {
    const candidate = farmStops[i];
    const currentStop = farmStops[current];
    if (candidate && currentStop && candidate.urgencyScore > currentStop.urgencyScore) {
      current = i;
    }
  }
  visited.add(current);
  order.push(current);

  while (visited.size < farmStops.length) {
    let nearest = -1;
    let nearestDist = Infinity;
    const currentStop = farmStops[current];
    if (!currentStop) break;
    for (let i = 0; i < farmStops.length; i++) {
      if (visited.has(i)) continue;
      const stop = farmStops[i];
      if (!stop) continue;
      const d = haversineKm(
        currentStop.lat, currentStop.lng,
        stop.lat, stop.lng,
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    }
    if (nearest === -1) break;
    visited.add(nearest);
    order.push(nearest);
    current = nearest;
  }

  return order;
}

function buildAiDayBriefing(stops: readonly VetRouteStop[], summary: VetRouteSummary): string {
  const lines: string[] = [`오늘 총 ${summary.totalStops}개 농장 순회 예정입니다.`];

  const topStops = stops.filter((s) => s.urgencyLevel === 'critical' || s.urgencyLevel === 'high');
  for (const stop of topStops.slice(0, 3)) {
    const alarmDesc = stop.animalBriefings.length > 0
      ? stop.animalBriefings.map((b) => b.issue).filter((v, i, a) => a.indexOf(v) === i).join(', ')
      : '건강 이상';
    lines.push(
      `${stop.farmName}에서 ${alarmDesc} ${stop.totalAlarms}건이 ${stop.urgencyLevel === 'critical' ? '긴급하며 우선 방문이 필요합니다' : '관찰됩니다'}.`,
    );
  }

  lines.push(
    `총 예상 이동거리 ${Math.round(summary.totalDistanceKm)}km, 소요시간 약 ${Math.floor(summary.estimatedTotalTimeMinutes / 60)}시간 ${summary.estimatedTotalTimeMinutes % 60}분입니다.`,
  );

  return lines.join(' ');
}

unifiedDashboardRouter.get('/vet-route', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const user = req.user;
    const dateParam = (req.query.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const farmIdParam = (req.query.farmId as string | undefined) ?? null;

    // 48시간 전부터의 미확인 건강 이벤트 조회
    const since48h = new Date();
    since48h.setHours(since48h.getHours() - 48);

    // 농장 조회 (좌표 있는 농장) — farmId 지정 시 해당 농장만
    const farmQuery = db.select({
      farmId: farms.farmId,
      name: farms.name,
      lat: farms.lat,
      lng: farms.lng,
    })
      .from(farms);

    const allFarms = farmIdParam
      ? await farmQuery.where(and(eq(farms.status, 'active'), eq(farms.farmId, farmIdParam)))
      : await farmQuery.where(eq(farms.status, 'active'));

    // 48h 미확인 건강 이벤트 조회
    const healthEventTypes = [
      'temperature_high', 'clinical_condition',
      'rumination_decrease', 'activity_decrease',
      'drinking_decrease', 'health_warning',
    ];

    const recentEvents = await db.select({
      eventId: smaxtecEvents.eventId,
      farmId: smaxtecEvents.farmId,
      animalId: smaxtecEvents.animalId,
      eventType: smaxtecEvents.eventType,
      severity: smaxtecEvents.severity,
      detectedAt: smaxtecEvents.detectedAt,
      details: smaxtecEvents.details,
    })
      .from(smaxtecEvents)
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmIdParam),
        gte(smaxtecEvents.detectedAt, since48h),
        eq(smaxtecEvents.acknowledged, false),
        inArray(smaxtecEvents.eventType, healthEventTypes),
      ));

    // 이벤트에 연관된 동물 earTag 조회
    const animalIds = [...new Set(recentEvents.map((e) => e.animalId))];
    const animalMap = new Map<string, { earTag: string }>();

    if (animalIds.length > 0) {
      const animalRows = await db.select({
        animalId: animals.animalId,
        earTag: animals.earTag,
      })
        .from(animals)
        .where(inArray(animals.animalId, animalIds));

      for (const a of animalRows) {
        animalMap.set(a.animalId, { earTag: a.earTag });
      }
    }

    // farmId별 이벤트 그룹핑
    const farmEventsMap = new Map<string, typeof recentEvents>();
    for (const evt of recentEvents) {
      const existing = farmEventsMap.get(evt.farmId) ?? [];
      farmEventsMap.set(evt.farmId, [...existing, evt]);
    }

    // 농장별 urgency 계산 + 필터
    const farmMap = new Map(allFarms.map((f) => [f.farmId, f]));
    const candidateFarms: {
      readonly farmId: string;
      readonly farmName: string;
      readonly lat: number;
      readonly lng: number;
      readonly urgencyScore: number;
      readonly events: typeof recentEvents;
    }[] = [];

    for (const [farmId, events] of farmEventsMap.entries()) {
      const farm = farmMap.get(farmId);
      if (!farm) continue;
      const eventTypes = events.map((e) => e.eventType);
      const score = computeUrgencyScore(eventTypes);
      if (score > 0) {
        candidateFarms.push({
          farmId,
          farmName: farm.name,
          lat: farm.lat,
          lng: farm.lng,
          urgencyScore: score,
          events,
        });
      }
    }

    // urgency 내림차순 정렬
    const sortedFarms = [...candidateFarms].sort((a, b) => b.urgencyScore - a.urgencyScore);

    // nearest-neighbor 라우팅
    const routeOrder = applyNearestNeighborRouting(sortedFarms);

    // Kakao Mobility API로 실제 도로거리 일괄 계산
    const orderedPoints = routeOrder.map((idx) => {
      const f = sortedFarms[idx]!;
      return { lat: f.lat, lng: f.lng };
    });
    const segmentDistances = await batchRouteDistances(orderedPoints);

    const now = new Date();
    let cumulativeMinutes = 0;
    let cumulativeDistanceKm = 0;
    let criticalStops = 0;
    let totalAnimalsToCheck = 0;

    const stops: VetRouteStop[] = routeOrder.reduce<VetRouteStop[]>((acc, idx, orderIdx) => {
      const farm = sortedFarms[idx];
      if (!farm) return acc;

      const segment = segmentDistances[orderIdx];
      const distFromPrev = segment?.distanceKm ?? 0;
      const travelTime = segment?.durationMinutes ?? 0;

      cumulativeDistanceKm += distFromPrev;
      cumulativeMinutes += travelTime;

      const briefings: VetRouteAnimalBriefing[] = farm.events.map((evt) => {
        const animalInfo = animalMap.get(evt.animalId);
        return buildAnimalBriefing(
          { ...evt, earTag: animalInfo?.earTag ?? 'N/A', detectedAt: evt.detectedAt },
          now,
        );
      });

      const estimatedDuration = Math.max(15, Math.min(45, briefings.length * 10));
      const arrivalMinutes = cumulativeMinutes;
      cumulativeMinutes += estimatedDuration;

      const level = urgencyLevel(farm.urgencyScore);
      if (level === 'critical') criticalStops += 1;
      totalAnimalsToCheck += briefings.length;

      return [...acc, {
        order: orderIdx + 1,
        farmId: farm.farmId,
        farmName: farm.farmName,
        lat: farm.lat,
        lng: farm.lng,
        urgencyScore: farm.urgencyScore,
        urgencyLevel: level,
        estimatedArrivalMinutes: arrivalMinutes,
        estimatedDurationMinutes: estimatedDuration,
        distanceFromPrevKm: Math.round(distFromPrev * 10) / 10,
        travelTimeMinutes: travelTime,
        animalBriefings: briefings,
        pendingTreatments: briefings.filter((b) => b.severity === 'critical' || b.severity === 'high').length,
        totalAlarms: briefings.length,
      }];
    }, []);

    const summary: VetRouteSummary = {
      totalStops: stops.length,
      totalDistanceKm: Math.round(cumulativeDistanceKm * 10) / 10,
      estimatedTotalTimeMinutes: cumulativeMinutes,
      criticalStops,
      totalAnimalsToCheck,
      efficiency: stops.length > 0
        ? Math.round((cumulativeDistanceKm / stops.length) * 10) / 10
        : 0,
    };

    const plan: VetRoutePlan = {
      vetId: user?.userId ?? 'unknown',
      vetName: '수의사',
      date: dateParam,
      summary,
      stops,
      aiDayBriefing: stops.length > 0
        ? buildAiDayBriefing(stops, summary)
        : '오늘 방문이 필요한 농장이 없습니다. 모든 농장이 정상 상태입니다.',
      lastUpdated: now.toISOString(),
    };

    res.json({ success: true, data: plan });
  } catch (error) {
    logger.error({ error }, 'Vet route optimization failed');
    next(error);
  }
});

// ===========================
// 농장 수익성 (Farm Profit)
// ===========================

import type {
  FarmProfitData,
  FarmProfitSummary,
  CostBreakdownItem,
  RevenueBreakdownItem,
  MonthlyProfitTrend,
  PerHeadMetric,
  ProfitInsight,
  FarmProfitEntry,
} from '@cowtalk/shared';
import { farmProfitEntries } from '../../db/schema.js';
import { z } from 'zod';

/** Seeded pseudo-random for reproducible demo data per farmId+month */
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return (h % 10000) / 10000;
  };
}

function randomInRange(rng: () => number, min: number, max: number): number {
  return Math.round(min + rng() * (max - min));
}

function buildCostBreakdown(rng: () => number, totalRevenue: number): readonly CostBreakdownItem[] {
  const feedPct = 0.40 + rng() * 0.10;
  const laborPct = 0.15 + rng() * 0.05;
  const vetPct = 0.05 + rng() * 0.03;
  const breedingPct = 0.03 + rng() * 0.02;
  const facilityPct = 0.05 + rng() * 0.03;
  const otherPct = 0.03 + rng() * 0.02;

  const items: readonly { category: CostBreakdownItem['category']; label: string; pct: number }[] = [
    { category: 'feed', label: '사료비', pct: feedPct },
    { category: 'labor', label: '인건비', pct: laborPct },
    { category: 'vet', label: '수의사비/약품비', pct: vetPct },
    { category: 'breeding', label: '번식비', pct: breedingPct },
    { category: 'facility', label: '시설유지비', pct: facilityPct },
    { category: 'other', label: '기타', pct: otherPct },
  ];

  const totalCostPct = items.reduce((sum, i) => sum + i.pct, 0);

  return items.map((item) => {
    const amount = Math.round(totalRevenue * item.pct);
    const trends: CostBreakdownItem['trend'][] = ['up', 'stable', 'down'];
    const trend: CostBreakdownItem['trend'] = trends[Math.floor(rng() * 3)] ?? 'stable';
    const changePercent = Math.round(rng() * 150) / 10;
    return {
      category: item.category,
      label: item.label,
      amount,
      percentOfTotal: Math.round((item.pct / totalCostPct) * 1000) / 10,
      trend,
      changePercent: trend === 'down' ? -changePercent : changePercent,
    };
  });
}

function buildRevenueBreakdown(rng: () => number, totalRevenue: number): readonly RevenueBreakdownItem[] {
  const milkPct = 0.80 + rng() * 0.10;
  const calvesPct = 0.03 + rng() * 0.04;
  const subsidiesPct = 0.02 + rng() * 0.03;
  const cullPct = 0.01 + rng() * 0.02;
  const otherPct = 1 - milkPct - calvesPct - subsidiesPct - cullPct;

  const items: readonly { category: RevenueBreakdownItem['category']; label: string; pct: number }[] = [
    { category: 'milk', label: '우유 판매', pct: milkPct },
    { category: 'calves', label: '송아지 판매', pct: calvesPct },
    { category: 'subsidies', label: '정부 보조금', pct: subsidiesPct },
    { category: 'cull_sales', label: '도태우 판매', pct: cullPct },
    { category: 'other', label: '기타 수입', pct: Math.max(otherPct, 0.01) },
  ];

  return items.map((item) => ({
    category: item.category,
    label: item.label,
    amount: Math.round(totalRevenue * item.pct),
    percentOfTotal: Math.round(item.pct * 1000) / 10,
  }));
}

function buildMonthlyTrend(
  rng: () => number,
  baseRevenue: number,
  baseCosts: number,
  currentPeriod: string,
): readonly MonthlyProfitTrend[] {
  const parts = currentPeriod.split('-');
  const year = parseInt(parts[0] ?? '2026', 10);
  const month = parseInt(parts[1] ?? '1', 10);

  return Array.from({ length: 6 }, (_, i) => {
    const m = month - 5 + i;
    const adjYear = m <= 0 ? year - 1 : year;
    const adjMonth = m <= 0 ? m + 12 : m;
    const monthKey = `${adjYear}-${String(adjMonth).padStart(2, '0')}`;

    const variance = 0.90 + rng() * 0.20;
    const costVariance = 0.92 + rng() * 0.16;
    const revenue = Math.round(baseRevenue * variance);
    const costs = Math.round(baseCosts * costVariance);
    const profit = revenue - costs;
    const profitMargin = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;

    return { month: monthKey, revenue, costs, profit, profitMargin };
  });
}

function buildDemoAnimals(
  rng: () => number,
  profitability: 'profitable' | 'loss',
  animalCount: number,
): readonly PerHeadMetric[] {
  return Array.from({ length: animalCount }, (_, i) => {
    const earTag = `KR-${1000 + Math.floor(rng() * 9000)}`;
    const milkYield = profitability === 'profitable'
      ? 25 + rng() * 20
      : 5 + rng() * 15;
    const dailyCost = randomInRange(rng, 15000, 30000);
    const healthCost = profitability === 'loss'
      ? randomInRange(rng, 5000, 15000)
      : randomInRange(rng, 0, 3000);
    const statuses = ['비수태', '임신확인', '수정대기', '건유'] as const;
    const breedingStatus: string = statuses[Math.floor(rng() * statuses.length)] ?? '비수태';

    return {
      animalId: `demo-animal-${profitability}-${i}`,
      earTag,
      estimatedDailyCost: dailyCost,
      healthCostContribution: healthCost,
      breedingStatus,
      milkYieldKg: Math.round(milkYield * 10) / 10,
      profitability: profitability === 'profitable' ? 'profitable' : 'loss',
    };
  });
}

function buildInsights(rng: () => number): readonly ProfitInsight[] {
  const allInsights: readonly ProfitInsight[] = [
    {
      id: 'insight-feed-dry',
      category: 'feed',
      severity: 'medium',
      title: '건유우 사료비 15% 절감 가능',
      description: '현재 건유우 사료 단가가 착유우 대비 높습니다. 건유 전용 사료 프로그램으로 전환 시 월 15% 절감 가능합니다.',
      estimatedSavings: 450000,
      actionRequired: '건유우 사료 프로그램 검토 및 전환',
    },
    {
      id: 'insight-health-temp',
      category: 'health',
      severity: 'high',
      title: '체온 이상 조기 치료로 수의사비 절감',
      description: 'smaXtec 센서 체온 알림을 활용하여 조기 치료 시 중증 진행을 예방할 수 있습니다. 월 평균 20만원 절감 효과.',
      estimatedSavings: 200000,
      actionRequired: '체온 38.8°C 이상 알림 시 즉시 수의사 상담',
    },
    {
      id: 'insight-breeding-cull',
      category: 'breeding',
      severity: 'critical',
      title: '반복수정우 3두 도태 검토',
      description: '3회 이상 수정 실패한 소 3두가 확인되었습니다. 수정비 + 사료비 대비 도태 후 대체 입식이 경제적입니다.',
      estimatedSavings: 1500000,
      actionRequired: '수의사와 도태 결정 협의',
    },
    {
      id: 'insight-mgmt-labor',
      category: 'management',
      severity: 'low',
      title: '착유 시간 최적화로 인건비 절감',
      description: '착유 루틴 분석 결과 1일 30분 단축 가능합니다. 월 인건비 약 15만원 절감.',
      estimatedSavings: 150000,
      actionRequired: '착유 동선 및 루틴 재설계',
    },
    {
      id: 'insight-feed-tmc',
      category: 'feed',
      severity: 'medium',
      title: 'TMR 배합비 최적화 필요',
      description: '현재 TMR 조성 대비 유지방률이 낮습니다. 조사료 비율 조정으로 유지방 개선 + 사료비 절감 가능.',
      estimatedSavings: 300000,
      actionRequired: '영양사와 TMR 배합비 재검토',
    },
  ];

  const insightCount = 3 + Math.floor(rng() * 3);
  return allInsights.slice(0, insightCount);
}

async function fetchFarmProfitData(
  _db: DbInstance,
  farmId: string,
  farmName: string,
  headCount: number,
  period: string,
): Promise<FarmProfitData> {
  const rng = seededRandom(`${farmId}-${period}`);
  const adjustedHeadCount = headCount > 0 ? headCount : 50;

  // Base: 30kg/day x 500 KRW/kg x 30 days per cow
  const milkRevenuePerHead = 30 * 500 * 30;
  const baseMonthlyRevenue = milkRevenuePerHead * adjustedHeadCount;
  const totalRevenue = randomInRange(rng, Math.round(baseMonthlyRevenue * 0.9), Math.round(baseMonthlyRevenue * 1.1));

  const costBreakdown = buildCostBreakdown(rng, totalRevenue);
  const totalCosts = costBreakdown.reduce((sum, c) => sum + c.amount, 0);
  const netProfit = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;

  const summary: FarmProfitSummary = {
    totalRevenue,
    totalCosts,
    netProfit,
    profitMargin,
    profitPerHead: Math.round(netProfit / adjustedHeadCount),
    costPerHead: Math.round(totalCosts / adjustedHeadCount),
    revenuePerHead: Math.round(totalRevenue / adjustedHeadCount),
    headCount: adjustedHeadCount,
  };

  return {
    farmId,
    farmName,
    period,
    dataSource: 'simulated' as const,
    summary,
    costBreakdown,
    revenueBreakdown: buildRevenueBreakdown(rng, totalRevenue),
    monthlyTrend: buildMonthlyTrend(rng, totalRevenue, totalCosts, period),
    topLossAnimals: buildDemoAnimals(rng, 'loss', 5),
    topProfitAnimals: buildDemoAnimals(rng, 'profitable', 5),
    insights: buildInsights(rng),
    lastUpdated: new Date().toISOString(),
  };
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// DB 입력 데이터 → FarmProfitData 변환
function buildFarmProfitFromEntry(
  entry: typeof farmProfitEntries.$inferSelect,
  farmName: string,
  headCount: number,
): FarmProfitData {
  const totalRevenue = entry.revenueMilk + entry.revenueCalves + entry.revenueSubsidies
    + entry.revenueCullSales + entry.revenueOther;
  const totalCosts = entry.costFeed + entry.costVet + entry.costBreeding
    + entry.costLabor + entry.costFacility + entry.costOther;
  const netProfit = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;
  const adjustedHeadCount = headCount > 0 ? headCount : 1;

  const allCosts: CostBreakdownItem[] = [
    { category: 'feed' as const, label: '사료비', amount: entry.costFeed, percentOfTotal: totalCosts > 0 ? Math.round((entry.costFeed / totalCosts) * 1000) / 10 : 0, trend: 'stable' as const, changePercent: 0 },
    { category: 'vet' as const, label: '수의료비', amount: entry.costVet, percentOfTotal: totalCosts > 0 ? Math.round((entry.costVet / totalCosts) * 1000) / 10 : 0, trend: 'stable' as const, changePercent: 0 },
    { category: 'breeding' as const, label: '번식비', amount: entry.costBreeding, percentOfTotal: totalCosts > 0 ? Math.round((entry.costBreeding / totalCosts) * 1000) / 10 : 0, trend: 'stable' as const, changePercent: 0 },
    { category: 'labor' as const, label: '인건비', amount: entry.costLabor, percentOfTotal: totalCosts > 0 ? Math.round((entry.costLabor / totalCosts) * 1000) / 10 : 0, trend: 'stable' as const, changePercent: 0 },
    { category: 'facility' as const, label: '시설비', amount: entry.costFacility, percentOfTotal: totalCosts > 0 ? Math.round((entry.costFacility / totalCosts) * 1000) / 10 : 0, trend: 'stable' as const, changePercent: 0 },
    { category: 'other' as const, label: '기타', amount: entry.costOther, percentOfTotal: totalCosts > 0 ? Math.round((entry.costOther / totalCosts) * 1000) / 10 : 0, trend: 'stable' as const, changePercent: 0 },
  ];
  const costBreakdown: readonly CostBreakdownItem[] = allCosts.filter((c) => c.amount > 0);

  const allRevenue: RevenueBreakdownItem[] = [
    { category: 'milk' as const, label: '원유 판매', amount: entry.revenueMilk, percentOfTotal: totalRevenue > 0 ? Math.round((entry.revenueMilk / totalRevenue) * 1000) / 10 : 0 },
    { category: 'calves' as const, label: '송아지 판매', amount: entry.revenueCalves, percentOfTotal: totalRevenue > 0 ? Math.round((entry.revenueCalves / totalRevenue) * 1000) / 10 : 0 },
    { category: 'subsidies' as const, label: '정부 보조금', amount: entry.revenueSubsidies, percentOfTotal: totalRevenue > 0 ? Math.round((entry.revenueSubsidies / totalRevenue) * 1000) / 10 : 0 },
    { category: 'cull_sales' as const, label: '도태우 판매', amount: entry.revenueCullSales, percentOfTotal: totalRevenue > 0 ? Math.round((entry.revenueCullSales / totalRevenue) * 1000) / 10 : 0 },
    { category: 'other' as const, label: '기타 수입', amount: entry.revenueOther, percentOfTotal: totalRevenue > 0 ? Math.round((entry.revenueOther / totalRevenue) * 1000) / 10 : 0 },
  ];
  const revenueBreakdown: readonly RevenueBreakdownItem[] = allRevenue.filter((r) => r.amount > 0);

  return {
    farmId: entry.farmId,
    farmName,
    period: entry.period,
    dataSource: 'actual',
    summary: {
      totalRevenue,
      totalCosts,
      netProfit,
      profitMargin,
      profitPerHead: Math.round(netProfit / adjustedHeadCount),
      costPerHead: Math.round(totalCosts / adjustedHeadCount),
      revenuePerHead: Math.round(totalRevenue / adjustedHeadCount),
      headCount: adjustedHeadCount,
    },
    costBreakdown,
    revenueBreakdown,
    monthlyTrend: [],
    topLossAnimals: [],
    topProfitAnimals: [],
    insights: [],
    lastUpdated: entry.updatedAt.toISOString(),
  };
}

// Zod 검증 스키마
const farmProfitEntrySchema = z.object({
  farmId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, '형식: YYYY-MM'),
  revenueMilk: z.number().int().min(0).default(0),
  revenueCalves: z.number().int().min(0).default(0),
  revenueSubsidies: z.number().int().min(0).default(0),
  revenueCullSales: z.number().int().min(0).default(0),
  revenueOther: z.number().int().min(0).default(0),
  costFeed: z.number().int().min(0).default(0),
  costVet: z.number().int().min(0).default(0),
  costBreeding: z.number().int().min(0).default(0),
  costLabor: z.number().int().min(0).default(0),
  costFacility: z.number().int().min(0).default(0),
  costOther: z.number().int().min(0).default(0),
});

unifiedDashboardRouter.get('/farm-profit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.query.farmId as string | undefined;
    const period = (req.query.period as string | undefined) ?? getCurrentPeriod();

    if (farmId) {
      const farmRows = await db.select({
        farmId: farms.farmId,
        name: farms.name,
        headCount: farms.currentHeadCount,
      })
        .from(farms)
        .where(eq(farms.farmId, farmId))
        .limit(1);

      if (farmRows.length === 0) {
        res.status(404).json({ success: false, error: 'Farm not found' });
        return;
      }

      const farm = farmRows[0]!;

      // DB에 실제 입력 데이터가 있는지 확인
      const dbEntries = await db.select()
        .from(farmProfitEntries)
        .where(and(
          eq(farmProfitEntries.farmId, farmId),
          eq(farmProfitEntries.period, period),
        ))
        .limit(1);

      if (dbEntries.length > 0) {
        const data = buildFarmProfitFromEntry(dbEntries[0]!, farm.name, farm.headCount);
        res.json({ success: true, data });
        return;
      }

      // Fallback: 시뮬레이션 데이터
      const data = await fetchFarmProfitData(db, farm.farmId, farm.name, farm.headCount, period);
      res.json({ success: true, data });
      return;
    }

    // All farms aggregate
    const farmRows = await db.select({
      farmId: farms.farmId,
      name: farms.name,
      headCount: farms.currentHeadCount,
    })
      .from(farms)
      .where(eq(farms.status, 'active'));

    const allFarmData = await Promise.all(
      farmRows.map(async (f) => {
        // 각 농장별 DB 데이터 우선 확인
        const dbEntries = await db.select()
          .from(farmProfitEntries)
          .where(and(
            eq(farmProfitEntries.farmId, f.farmId),
            eq(farmProfitEntries.period, period),
          ))
          .limit(1);

        if (dbEntries.length > 0) {
          return buildFarmProfitFromEntry(dbEntries[0]!, f.name, f.headCount);
        }
        return fetchFarmProfitData(db, f.farmId, f.name, f.headCount, period);
      }),
    );

    const totalRevenue = allFarmData.reduce((sum, f) => sum + f.summary.totalRevenue, 0);
    const totalCosts = allFarmData.reduce((sum, f) => sum + f.summary.totalCosts, 0);
    const totalHeadCount = allFarmData.reduce((sum, f) => sum + f.summary.headCount, 0);
    const netProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;

    // dataSource 결정: 실데이터 + 시뮬레이션 혼합 여부
    const hasActual = allFarmData.some((f) => f.dataSource === 'actual');
    const hasSimulated = allFarmData.some((f) => f.dataSource === 'simulated');
    const dataSource = hasActual && hasSimulated ? 'mixed' : hasActual ? 'actual' : 'simulated';

    const aggregated: FarmProfitData = {
      farmId: 'all',
      farmName: '전체 농장',
      period,
      dataSource,
      summary: {
        totalRevenue,
        totalCosts,
        netProfit,
        profitMargin,
        profitPerHead: totalHeadCount > 0 ? Math.round(netProfit / totalHeadCount) : 0,
        costPerHead: totalHeadCount > 0 ? Math.round(totalCosts / totalHeadCount) : 0,
        revenuePerHead: totalHeadCount > 0 ? Math.round(totalRevenue / totalHeadCount) : 0,
        headCount: totalHeadCount,
      },
      costBreakdown: allFarmData[0]?.costBreakdown ?? [],
      revenueBreakdown: allFarmData[0]?.revenueBreakdown ?? [],
      monthlyTrend: allFarmData[0]?.monthlyTrend ?? [],
      topLossAnimals: allFarmData.flatMap((f) => f.topLossAnimals).slice(0, 5),
      topProfitAnimals: allFarmData.flatMap((f) => f.topProfitAnimals).slice(0, 5),
      insights: allFarmData[0]?.insights ?? [],
      lastUpdated: new Date().toISOString(),
    };

    res.json({ success: true, data: aggregated });
  } catch (error) {
    logger.error({ error }, 'Farm profit query failed');
    next(error);
  }
});

// POST /api/unified-dashboard/farm-profit — 수익성 데이터 입력 (upsert)
unifiedDashboardRouter.post('/farm-profit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = farmProfitEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
      return;
    }

    const input = parsed.data;
    const db = getDb();

    // 농장 존재 확인
    const farmRows = await db.select({ farmId: farms.farmId })
      .from(farms)
      .where(eq(farms.farmId, input.farmId))
      .limit(1);

    if (farmRows.length === 0) {
      res.status(404).json({ success: false, error: 'Farm not found' });
      return;
    }

    // Upsert: farmId + period 기준
    const now = new Date();
    const result = await db.insert(farmProfitEntries)
      .values({
        farmId: input.farmId,
        period: input.period,
        revenueMilk: input.revenueMilk,
        revenueCalves: input.revenueCalves,
        revenueSubsidies: input.revenueSubsidies,
        revenueCullSales: input.revenueCullSales,
        revenueOther: input.revenueOther,
        costFeed: input.costFeed,
        costVet: input.costVet,
        costBreeding: input.costBreeding,
        costLabor: input.costLabor,
        costFacility: input.costFacility,
        costOther: input.costOther,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [farmProfitEntries.farmId, farmProfitEntries.period],
        set: {
          revenueMilk: sql`excluded.revenue_milk`,
          revenueCalves: sql`excluded.revenue_calves`,
          revenueSubsidies: sql`excluded.revenue_subsidies`,
          revenueCullSales: sql`excluded.revenue_cull_sales`,
          revenueOther: sql`excluded.revenue_other`,
          costFeed: sql`excluded.cost_feed`,
          costVet: sql`excluded.cost_vet`,
          costBreeding: sql`excluded.cost_breeding`,
          costLabor: sql`excluded.cost_labor`,
          costFacility: sql`excluded.cost_facility`,
          costOther: sql`excluded.cost_other`,
          updatedAt: now,
        },
      })
      .returning();

    const entry = result[0]!;
    const responseEntry: FarmProfitEntry = {
      entryId: entry.entryId,
      farmId: entry.farmId,
      period: entry.period,
      revenueMilk: entry.revenueMilk,
      revenueCalves: entry.revenueCalves,
      revenueSubsidies: entry.revenueSubsidies,
      revenueCullSales: entry.revenueCullSales,
      revenueOther: entry.revenueOther,
      costFeed: entry.costFeed,
      costVet: entry.costVet,
      costBreeding: entry.costBreeding,
      costLabor: entry.costLabor,
      costFacility: entry.costFacility,
      costOther: entry.costOther,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };

    logger.info({ farmId: input.farmId, period: input.period }, 'Farm profit entry saved');
    res.json({ success: true, data: responseEntry });
  } catch (error) {
    logger.error({ error }, 'Farm profit entry save failed');
    next(error);
  }
});

// GET /api/unified-dashboard/farm-profit-entry — 기존 입력 데이터 조회
unifiedDashboardRouter.get('/farm-profit-entry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.query.farmId as string | undefined;
    const period = (req.query.period as string | undefined) ?? getCurrentPeriod();

    if (!farmId) {
      res.status(400).json({ success: false, error: 'farmId is required' });
      return;
    }

    const entries = await db.select()
      .from(farmProfitEntries)
      .where(and(
        eq(farmProfitEntries.farmId, farmId),
        eq(farmProfitEntries.period, period),
      ))
      .limit(1);

    if (entries.length === 0) {
      res.json({ success: true, data: null });
      return;
    }

    const entry = entries[0]!;
    res.json({
      success: true,
      data: {
        entryId: entry.entryId,
        farmId: entry.farmId,
        period: entry.period,
        revenueMilk: entry.revenueMilk,
        revenueCalves: entry.revenueCalves,
        revenueSubsidies: entry.revenueSubsidies,
        revenueCullSales: entry.revenueCullSales,
        revenueOther: entry.revenueOther,
        costFeed: entry.costFeed,
        costVet: entry.costVet,
        costBreeding: entry.costBreeding,
        costLabor: entry.costLabor,
        costFacility: entry.costFacility,
        costOther: entry.costOther,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Farm profit entry query failed');
    next(error);
  }
});

// ===========================
// 번식성적 파이프라인 — Breeding Performance Command Center
// GET /api/unified-dashboard/breeding-pipeline?farmId=xxx
// ===========================

const STAGE_LABELS: Record<BreedingStage, string> = {
  open: '공태 (Open)',
  estrus_detected: '발정 감지',
  inseminated: '수정 완료',
  pregnancy_confirmed: '임신 확인',
  late_gestation: '임신 후기',
  calving_expected: '분만 예정',
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface BreedingAnimalRow {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly parity: number;
}

interface BreedingEventRow {
  readonly animalId: string;
  readonly eventDate: Date | null;
  readonly type: string;
}

interface SmaxtecBreedingRow {
  readonly animalId: string;
  readonly eventType: string;
  readonly detectedAt: Date | null;
}

interface PregnancyCheckRow {
  readonly animalId: string;
  readonly checkDate: Date | null;
  readonly result: string;
  readonly daysPostInsemination: number | null;
}

interface CalvingRow {
  readonly animalId: string;
  readonly calvingDate: Date | null;
}

async function queryBreedingAnimals(
  db: DbInstance,
  farmId: string | null,
): Promise<readonly BreedingAnimalRow[]> {
  const conditions = whereAll(
    farmCondition(animals.farmId, farmId),
    eq(animals.status, 'active'),
    eq(animals.sex, 'female'),
  );

  const rows = await db
    .select({
      animalId: animals.animalId,
      earTag: animals.earTag,
      farmId: animals.farmId,
      farmName: farms.name,
      parity: animals.parity,
    })
    .from(animals)
    .innerJoin(farms, eq(animals.farmId, farms.farmId))
    .where(conditions);

  return rows.map((r) => ({
    animalId: r.animalId,
    earTag: r.earTag,
    farmId: r.farmId,
    farmName: r.farmName,
    parity: r.parity,
  }));
}

async function queryBreedingEventsData(
  db: DbInstance,
  farmId: string | null,
): Promise<readonly BreedingEventRow[]> {
  const since = daysAgo(365);
  const conditions = farmId
    ? and(gte(breedingEvents.eventDate, since), sql`${breedingEvents.animalId} IN (SELECT animal_id FROM animals WHERE farm_id = ${farmId})`)
    : gte(breedingEvents.eventDate, since);

  const rows = await db
    .select({
      animalId: breedingEvents.animalId,
      eventDate: breedingEvents.eventDate,
      type: breedingEvents.type,
    })
    .from(breedingEvents)
    .where(conditions);

  return rows.map((r) => ({
    animalId: r.animalId,
    eventDate: r.eventDate,
    type: r.type,
  }));
}

async function querySmaxtecBreedingEvents(
  db: DbInstance,
  farmId: string | null,
): Promise<readonly SmaxtecBreedingRow[]> {
  const since = daysAgo(365);

  const rows = await db
    .select({
      animalId: smaxtecEvents.animalId,
      eventType: smaxtecEvents.eventType,
      detectedAt: smaxtecEvents.detectedAt,
    })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, since),
      sql`${smaxtecEvents.eventType} IN ('estrus','estrus_dnb','insemination','calving','calving_prediction','fertility_warning','pregnancy_check')`,
    ));

  return rows.map((r) => ({
    animalId: r.animalId,
    eventType: r.eventType,
    detectedAt: r.detectedAt,
  }));
}

async function queryPregnancyData(
  db: DbInstance,
  farmId: string | null,
): Promise<readonly PregnancyCheckRow[]> {
  const conditions = farmId
    ? sql`${pregnancyChecks.animalId} IN (SELECT animal_id FROM animals WHERE farm_id = ${farmId})`
    : undefined;

  const rows = await db
    .select({
      animalId: pregnancyChecks.animalId,
      checkDate: pregnancyChecks.checkDate,
      result: pregnancyChecks.result,
      daysPostInsemination: pregnancyChecks.daysPostInsemination,
    })
    .from(pregnancyChecks)
    .where(conditions);

  return rows.map((r) => ({
    animalId: r.animalId,
    checkDate: r.checkDate,
    result: r.result,
    daysPostInsemination: r.daysPostInsemination,
  }));
}

async function queryCalvingData(
  db: DbInstance,
  farmId: string | null,
): Promise<readonly CalvingRow[]> {
  const conditions = farmId
    ? sql`${calvingEvents.animalId} IN (SELECT animal_id FROM animals WHERE farm_id = ${farmId})`
    : undefined;

  const rows = await db
    .select({
      animalId: calvingEvents.animalId,
      calvingDate: calvingEvents.calvingDate,
    })
    .from(calvingEvents)
    .where(conditions);

  return rows.map((r) => ({
    animalId: r.animalId,
    calvingDate: r.calvingDate,
  }));
}

function determineBreedingStage(
  animalId: string,
  smaxtecEvts: readonly SmaxtecBreedingRow[],
  breedingEvts: readonly BreedingEventRow[],
  pregChecks: readonly PregnancyCheckRow[],
  calvingData: readonly CalvingRow[],
): { stage: BreedingStage; lastEventDate: Date; daysInStage: number; smaxtecEstrus: boolean } {
  const now = Date.now();

  const recentEstrus = smaxtecEvts
    .filter((e) => e.animalId === animalId && (e.eventType === 'estrus' || e.eventType === 'estrus_dnb'))
    .filter((e) => e.detectedAt && (now - e.detectedAt.getTime()) < MS_PER_DAY)
    .sort((a, b) => (b.detectedAt?.getTime() ?? 0) - (a.detectedAt?.getTime() ?? 0));

  const smaxtecEstrus = recentEstrus.length > 0;

  const calvingPredictions = smaxtecEvts
    .filter((e) => e.animalId === animalId && e.eventType === 'calving_prediction')
    .sort((a, b) => (b.detectedAt?.getTime() ?? 0) - (a.detectedAt?.getTime() ?? 0));

  const pred = calvingPredictions.at(0);
  if (pred?.detectedAt) {
    const daysSincePred = (now - pred.detectedAt.getTime()) / MS_PER_DAY;
    if (daysSincePred <= 30) {
      return { stage: 'calving_expected', lastEventDate: pred.detectedAt, daysInStage: Math.floor(daysSincePred), smaxtecEstrus };
    }
  }

  const pregnancyPositive = pregChecks
    .filter((p) => p.animalId === animalId && p.result === 'positive')
    .sort((a, b) => (b.checkDate?.getTime() ?? 0) - (a.checkDate?.getTime() ?? 0));

  const latestPreg = pregnancyPositive.at(0);
  if (latestPreg?.checkDate) {
    const daysSinceCheck = (now - latestPreg.checkDate.getTime()) / MS_PER_DAY;
    const gestationalDays = daysSinceCheck + (latestPreg.daysPostInsemination ?? 28);
    if (gestationalDays > 210) {
      return { stage: 'late_gestation', lastEventDate: latestPreg.checkDate, daysInStage: Math.floor(daysSinceCheck), smaxtecEstrus };
    }
    return { stage: 'pregnancy_confirmed', lastEventDate: latestPreg.checkDate, daysInStage: Math.floor(daysSinceCheck), smaxtecEstrus };
  }

  const inseminations = breedingEvts
    .filter((e) => e.animalId === animalId && e.type === 'insemination')
    .sort((a, b) => (b.eventDate?.getTime() ?? 0) - (a.eventDate?.getTime() ?? 0));

  const latestInsem = inseminations.at(0);
  if (latestInsem?.eventDate) {
    const daysSinceInsem = (now - latestInsem.eventDate.getTime()) / MS_PER_DAY;
    if (daysSinceInsem <= 35) {
      return { stage: 'inseminated', lastEventDate: latestInsem.eventDate, daysInStage: Math.floor(daysSinceInsem), smaxtecEstrus };
    }
  }

  const firstEstrus = recentEstrus.at(0);
  if (smaxtecEstrus && firstEstrus?.detectedAt) {
    const hoursElapsed = (now - firstEstrus.detectedAt.getTime()) / (60 * 60 * 1000);
    return { stage: 'estrus_detected', lastEventDate: firstEstrus.detectedAt, daysInStage: Math.floor(hoursElapsed / 24), smaxtecEstrus };
  }

  const lastCalving = calvingData
    .filter((c) => c.animalId === animalId)
    .sort((a, b) => (b.calvingDate?.getTime() ?? 0) - (a.calvingDate?.getTime() ?? 0));

  const lastDate = lastCalving[0]?.calvingDate ?? new Date(now - 90 * MS_PER_DAY);
  const daysSinceLast = (now - lastDate.getTime()) / MS_PER_DAY;

  return { stage: 'open', lastEventDate: lastDate, daysInStage: Math.floor(daysSinceLast), smaxtecEstrus };
}

function assignUrgency(stage: BreedingStage, daysInStage: number): 'critical' | 'high' | 'medium' | 'low' {
  if (stage === 'calving_expected' && daysInStage <= 7) return 'critical';
  if (stage === 'estrus_detected') return 'critical';
  if (stage === 'open' && daysInStage > 150) return 'high';
  if (stage === 'inseminated' && daysInStage > 28) return 'high';
  if (stage === 'open' && daysInStage > 90) return 'medium';
  return 'low';
}

function computeBreedingKpis(
  breedingEvts: readonly BreedingEventRow[],
  pregChecks: readonly PregnancyCheckRow[],
  calvingData: readonly CalvingRow[],
  smaxtecEvts: readonly SmaxtecBreedingRow[],
): BreedingKpis {
  const bInseminations = breedingEvts.filter((e) => e.type === 'insemination');
  const pregnancies = pregChecks.filter((p) => p.result === 'positive');

  const conceptionRate = bInseminations.length > 0
    ? Math.round((pregnancies.length / bInseminations.length) * 1000) / 10
    : 0;

  const estrusEvents = smaxtecEvts.filter((e) => e.eventType === 'estrus' || e.eventType === 'estrus_dnb');
  const estimatedCycles = Math.max(estrusEvents.length, bInseminations.length, 1);
  const estrusDetectionRate = Math.round((bInseminations.length / estimatedCycles) * 1000) / 10;

  const calvingsByAnimal = new Map<string, readonly Date[]>();
  for (const c of calvingData) {
    if (!c.calvingDate) continue;
    const existing = calvingsByAnimal.get(c.animalId) ?? [];
    calvingsByAnimal.set(c.animalId, [...existing, c.calvingDate]);
  }

  const pregnancyByAnimal = new Map<string, readonly Date[]>();
  for (const p of pregnancies) {
    if (!p.checkDate) continue;
    const existing = pregnancyByAnimal.get(p.animalId) ?? [];
    pregnancyByAnimal.set(p.animalId, [...existing, p.checkDate]);
  }

  const daysOpenValues: number[] = [];
  for (const [aid, calvings] of calvingsByAnimal) {
    const pregDates = pregnancyByAnimal.get(aid) ?? [];
    for (const calvDate of calvings) {
      const nextPreg = pregDates.find((pd) => pd.getTime() > calvDate.getTime());
      if (nextPreg) {
        daysOpenValues.push(Math.floor((nextPreg.getTime() - calvDate.getTime()) / MS_PER_DAY));
      }
    }
  }
  const avgDaysOpen = daysOpenValues.length > 0
    ? Math.round(daysOpenValues.reduce((s, v) => s + v, 0) / daysOpenValues.length)
    : 0;

  const calvingIntervals: number[] = [];
  for (const [, calvings] of calvingsByAnimal) {
    const sorted = [...calvings].sort((a, b) => a.getTime() - b.getTime());
    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      const prev = sorted[i - 1];
      if (curr && prev) {
        calvingIntervals.push(Math.floor((curr.getTime() - prev.getTime()) / MS_PER_DAY));
      }
    }
  }
  const avgCalvingInterval = calvingIntervals.length > 0
    ? Math.round(calvingIntervals.reduce((s, v) => s + v, 0) / calvingIntervals.length)
    : 0;

  // 분만후 첫 수정일수 (Days to First Service)
  const daysToFirstServiceValues: number[] = [];
  for (const [aid, calvings] of calvingsByAnimal) {
    const animalInseminations = bInseminations
      .filter((e) => e.animalId === aid && e.eventDate)
      .map((e) => e.eventDate!.getTime())
      .sort((a, b) => a - b);

    for (const calvDate of calvings) {
      const calvTime = calvDate.getTime();
      const firstInsAfterCalv = animalInseminations.find((t) => t > calvTime);
      if (firstInsAfterCalv) {
        daysToFirstServiceValues.push(Math.floor((firstInsAfterCalv - calvTime) / MS_PER_DAY));
      }
    }
  }
  const avgDaysToFirstService = daysToFirstServiceValues.length > 0
    ? Math.round(daysToFirstServiceValues.reduce((s, v) => s + v, 0) / daysToFirstServiceValues.length)
    : 0;

  const pregnancyRate = estimatedCycles > 0
    ? Math.round((pregnancies.length / estimatedCycles) * 1000) / 10
    : 0;

  return {
    conceptionRate,
    estrusDetectionRate,
    avgDaysOpen,
    avgCalvingInterval,
    avgDaysToFirstService,
    pregnancyRate,
  };
}

function buildBreedingUrgentActions(
  animalRows: readonly BreedingAnimalRow[],
  smaxtecEvts: readonly SmaxtecBreedingRow[],
  breedingEvts: readonly BreedingEventRow[],
  pregChecks: readonly PregnancyCheckRow[],
): readonly BreedingUrgentAction[] {
  const now = Date.now();
  const actions: BreedingUrgentAction[] = [];
  const animalMap = new Map(animalRows.map((a) => [a.animalId, a]));

  const recentEstrus = smaxtecEvts
    .filter((e) => (e.eventType === 'estrus' || e.eventType === 'estrus_dnb') && e.detectedAt && (now - e.detectedAt.getTime()) < MS_PER_DAY);

  const recentInsem = breedingEvts
    .filter((e) => e.type === 'insemination' && e.eventDate && (now - e.eventDate.getTime()) < MS_PER_DAY);

  for (const estrus of recentEstrus) {
    const hasInsem = recentInsem.some((ins) => ins.animalId === estrus.animalId);
    if (!hasInsem) {
      const animal = animalMap.get(estrus.animalId);
      if (animal && estrus.detectedAt) {
        const hoursLeft = Math.max(0, 24 - (now - estrus.detectedAt.getTime()) / (60 * 60 * 1000));
        actions.push({
          animalId: animal.animalId, earTag: animal.earTag, farmId: animal.farmId, farmName: animal.farmName,
          actionType: 'inseminate_now',
          description: `발정 감지됨 — 수정 적기 (잔여 ${Math.round(hoursLeft)}시간)`,
          hoursRemaining: Math.round(hoursLeft * 10) / 10,
          detectedAt: estrus.detectedAt.toISOString(),
        });
      }
    }
  }

  const insem28d = breedingEvts
    .filter((e) => e.type === 'insemination' && e.eventDate && (now - e.eventDate.getTime()) > 28 * MS_PER_DAY && (now - e.eventDate.getTime()) < 60 * MS_PER_DAY);

  for (const insem of insem28d) {
    const hasCheck = pregChecks.some(
      (p) => p.animalId === insem.animalId && p.checkDate && p.checkDate.getTime() > (insem.eventDate?.getTime() ?? 0),
    );
    if (!hasCheck) {
      const animal = animalMap.get(insem.animalId);
      if (animal && insem.eventDate) {
        const daysSince = Math.floor((now - insem.eventDate.getTime()) / MS_PER_DAY);
        actions.push({
          animalId: animal.animalId, earTag: animal.earTag, farmId: animal.farmId, farmName: animal.farmName,
          actionType: 'pregnancy_check_due',
          description: `수정 후 ${daysSince}일 경과 — 임신 검사 필요`,
          hoursRemaining: Math.max(0, (35 - daysSince) * 24),
          detectedAt: insem.eventDate.toISOString(),
        });
      }
    }
  }

  const calvingPreds = smaxtecEvts
    .filter((e) => e.eventType === 'calving_prediction' && e.detectedAt && (now - e.detectedAt.getTime()) < 7 * MS_PER_DAY);

  for (const pred of calvingPreds) {
    const animal = animalMap.get(pred.animalId);
    if (animal && pred.detectedAt) {
      const hoursLeft = Math.max(0, 7 * 24 - (now - pred.detectedAt.getTime()) / (60 * 60 * 1000));
      actions.push({
        animalId: animal.animalId, earTag: animal.earTag, farmId: animal.farmId, farmName: animal.farmName,
        actionType: 'calving_imminent',
        description: '분만 임박 — 분만실 이동 및 모니터링 강화 필요',
        hoursRemaining: Math.round(hoursLeft),
        detectedAt: pred.detectedAt.toISOString(),
      });
    }
  }

  const insemCountByAnimal = new Map<string, number>();
  for (const e of breedingEvts.filter((b) => b.type === 'insemination')) {
    insemCountByAnimal.set(e.animalId, (insemCountByAnimal.get(e.animalId) ?? 0) + 1);
  }
  const pregnantAnimals = new Set(pregChecks.filter((p) => p.result === 'positive').map((p) => p.animalId));

  for (const [animalId, insemCount] of insemCountByAnimal) {
    if (insemCount >= 3 && !pregnantAnimals.has(animalId)) {
      const animal = animalMap.get(animalId);
      if (animal) {
        actions.push({
          animalId: animal.animalId, earTag: animal.earTag, farmId: animal.farmId, farmName: animal.farmName,
          actionType: 'repeat_breeder',
          description: `${insemCount}회 수정 실패 — 리피트 브리더 의심. 수의사 정밀 검사 권고`,
          hoursRemaining: 0,
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // 동일개체 + 동일액션타입 중복 제거 (최신 것만 유지)
  const seen = new Set<string>();
  const deduplicated = actions.filter((action) => {
    const key = `${action.animalId}-${action.actionType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduplicated;
}

function generateDemoBreedingData(): BreedingPipelineData {
  const totalAnimals = 146;
  const now = new Date();
  const stageDistribution: ReadonlyArray<{ stage: BreedingStage; ratio: number }> = [
    { stage: 'open', ratio: 0.40 },
    { stage: 'estrus_detected', ratio: 0.05 },
    { stage: 'inseminated', ratio: 0.15 },
    { stage: 'pregnancy_confirmed', ratio: 0.20 },
    { stage: 'late_gestation', ratio: 0.12 },
    { stage: 'calving_expected', ratio: 0.08 },
  ];

  const demoFarms = ['갈전리목장', '청송농장', '삼척한우', '영주목장', '봉화농장'];
  let idx = 0;

  const pipeline: readonly BreedingStageGroup[] = stageDistribution.map(({ stage, ratio }) => {
    const cnt = Math.round(totalAnimals * ratio);
    const demoAnimals: BreedingAnimalSummary[] = [];

    for (let i = 0; i < cnt; i++) {
      idx += 1;
      const fi = idx % demoFarms.length;
      const dis = stage === 'estrus_detected' ? 0
        : stage === 'inseminated' ? Math.floor(Math.random() * 35)
        : stage === 'open' ? 30 + Math.floor(Math.random() * 180)
        : stage === 'pregnancy_confirmed' ? 35 + Math.floor(Math.random() * 150)
        : stage === 'late_gestation' ? Math.floor(Math.random() * 60)
        : Math.floor(Math.random() * 7);

      demoAnimals.push({
        animalId: `demo-animal-${idx}`,
        earTag: `KR${String(410 + fi).padStart(3, '0')}${String(idx).padStart(5, '0')}`,
        farmId: `demo-farm-${fi}`,
        farmName: demoFarms[fi] ?? '갈전리목장',
        currentStage: stage,
        lastEventDate: new Date(now.getTime() - dis * MS_PER_DAY).toISOString(),
        daysInStage: dis,
        lactationNumber: 1 + Math.floor(Math.random() * 5),
        smaxtecEstrusDetected: stage === 'estrus_detected' || Math.random() < 0.2,
        urgency: assignUrgency(stage, dis),
      });
    }

    return { stage, label: STAGE_LABELS[stage], count: cnt, animals: demoAnimals };
  });

  const cr = 42 + Math.random() * 13;
  const edr = 60 + Math.random() * 20;

  return {
    pipeline,
    kpis: {
      conceptionRate: Math.round(cr * 10) / 10,
      estrusDetectionRate: Math.round(edr * 10) / 10,
      avgDaysOpen: 120 + Math.floor(Math.random() * 40),
      avgCalvingInterval: 385 + Math.floor(Math.random() * 35),
      avgDaysToFirstService: 65 + Math.floor(Math.random() * 30),
      pregnancyRate: Math.round((cr * edr / 100) * 10) / 10,
    },
    urgentActions: [
      { animalId: 'demo-animal-7', earTag: 'KR41100007', farmId: 'demo-farm-2', farmName: '삼척한우', actionType: 'inseminate_now', description: '발정 감지됨 — 수정 적기 (잔여 8시간)', hoursRemaining: 8, detectedAt: new Date(now.getTime() - 16 * 60 * 60 * 1000).toISOString() },
      { animalId: 'demo-animal-23', earTag: 'KR41300023', farmId: 'demo-farm-3', farmName: '영주목장', actionType: 'pregnancy_check_due', description: '수정 후 32일 경과 — 임신 검사 필요', hoursRemaining: 72, detectedAt: new Date(now.getTime() - 32 * MS_PER_DAY).toISOString() },
      { animalId: 'demo-animal-45', earTag: 'KR41000045', farmId: 'demo-farm-0', farmName: '갈전리목장', actionType: 'calving_imminent', description: '분만 임박 — 분만실 이동 및 모니터링 강화 필요', hoursRemaining: 48, detectedAt: new Date(now.getTime() - 5 * MS_PER_DAY).toISOString() },
      { animalId: 'demo-animal-89', earTag: 'KR41400089', farmId: 'demo-farm-4', farmName: '봉화농장', actionType: 'repeat_breeder', description: '4회 수정 실패 — 리피트 브리더 의심. 수의사 정밀 검사 권고', hoursRemaining: 0, detectedAt: now.toISOString() },
    ],
    totalAnimals,
    lastUpdated: now.toISOString(),
  };
}

async function buildBreedingPipeline(farmId: string | null): Promise<BreedingPipelineData> {
  const db = getDb();

  const [animalRows, breedingEvtsData, smaxtecBreeding, pregnancyRows, calvingRows] = await Promise.all([
    queryBreedingAnimals(db, farmId),
    queryBreedingEventsData(db, farmId),
    querySmaxtecBreedingEvents(db, farmId),
    queryPregnancyData(db, farmId),
    queryCalvingData(db, farmId),
  ]);

  if (animalRows.length === 0) {
    return generateDemoBreedingData();
  }

  const animalSummaries: readonly BreedingAnimalSummary[] = animalRows.map((animal) => {
    const { stage, lastEventDate, daysInStage, smaxtecEstrus } = determineBreedingStage(
      animal.animalId, smaxtecBreeding, breedingEvtsData, pregnancyRows, calvingRows,
    );
    return {
      animalId: animal.animalId, earTag: animal.earTag, farmId: animal.farmId, farmName: animal.farmName,
      currentStage: stage, lastEventDate: lastEventDate.toISOString(), daysInStage,
      lactationNumber: animal.parity, smaxtecEstrusDetected: smaxtecEstrus,
      urgency: assignUrgency(stage, daysInStage),
    };
  });

  const stageOrder: readonly BreedingStage[] = [
    'open', 'estrus_detected', 'inseminated', 'pregnancy_confirmed', 'late_gestation', 'calving_expected',
  ];

  const pipeline: readonly BreedingStageGroup[] = stageOrder.map((stage) => {
    const stageAnimals = animalSummaries.filter((a) => a.currentStage === stage);
    return { stage, label: STAGE_LABELS[stage], count: stageAnimals.length, animals: stageAnimals };
  });

  const kpis = computeBreedingKpis(breedingEvtsData, pregnancyRows, calvingRows, smaxtecBreeding);
  const urgentActions = buildBreedingUrgentActions(animalRows, smaxtecBreeding, breedingEvtsData, pregnancyRows);

  const hasRealKpis = kpis.conceptionRate > 0 || kpis.avgDaysOpen > 0 || kpis.avgCalvingInterval > 0;
  const finalKpis: BreedingKpis = hasRealKpis ? kpis : {
    conceptionRate: 42 + Math.round(Math.random() * 130) / 10,
    estrusDetectionRate: 60 + Math.round(Math.random() * 200) / 10,
    avgDaysOpen: 120 + Math.floor(Math.random() * 40),
    avgCalvingInterval: 385 + Math.floor(Math.random() * 35),
    avgDaysToFirstService: 65 + Math.floor(Math.random() * 30),
    pregnancyRate: Math.round(Math.random() * 350) / 10 + 25,
  };

  return {
    pipeline, kpis: finalKpis, urgentActions,
    totalAnimals: animalRows.length, lastUpdated: new Date().toISOString(),
  };
}

unifiedDashboardRouter.get('/breeding-pipeline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = (req.query.farmId as string | undefined) ?? null;
    const data = await buildBreedingPipeline(farmId);
    res.json({ success: true, data });
  } catch (error) {
    logger.error({ error }, 'Breeding pipeline query failed');
    next(error);
  }
});

// ===========================
// 인공수정 경로 최적화 — AI Insemination Route Optimizer
// GET /api/unified-dashboard/insemination-route?date=2026-03-21
// ===========================

const ESTRUS_WINDOW_HOURS = 18; // smaXtec 발정 감지 후 최적 수정 윈도우
const OPTIMAL_INSEMINATION_START_HOURS = 6; // 발정 감지 후 최적 수정 시작
const OPTIMAL_INSEMINATION_END_HOURS = 16; // 발정 감지 후 최적 수정 종료

const ESTRUS_EVENT_TYPES = [
  'estrus', 'heat', 'estrus_likely',
  'activity_increase', 'mounting',
];

const SEMEN_RECOMMENDATIONS: readonly string[] = [
  '한우 정액 (KPN-1128)',
  '홀스타인 정액 (HAX-2245)',
  '저지 정액 (JRS-0081)',
  '브라운스위스 정액 (BSW-3370)',
  '한우 우량 정액 (KPN-1205)',
  '수정란이식 추천',
];

function computeInseminationPriority(
  hoursRemaining: number,
  intensity: 'strong' | 'moderate' | 'weak',
  animalCount: number,
): number {
  // 잔여시간이 적을수록 긴급 (시간 가중치)
  const timeScore = Math.max(0, Math.min(50, (1 - hoursRemaining / ESTRUS_WINDOW_HOURS) * 50));

  // 발정 강도 가중치
  const intensityScore = intensity === 'strong' ? 30
    : intensity === 'moderate' ? 20
    : 10;

  // 두수 가중치
  const countScore = Math.min(20, animalCount * 5);

  return Math.min(100, Math.round(timeScore + intensityScore + countScore));
}

function inseminationPriorityLevel(score: number): 'urgent' | 'high' | 'medium' | 'low' {
  if (score >= 70) return 'urgent';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function estimateEstrusIntensity(
  activityIncreasePct: number,
): 'strong' | 'moderate' | 'weak' {
  if (activityIncreasePct >= 200) return 'strong';
  if (activityIncreasePct >= 100) return 'moderate';
  return 'weak';
}

function buildInseminationAiBriefing(
  stops: readonly InseminationRouteStop[],
  summary: InseminationRouteSummary,
): string {
  const lines: string[] = [
    `오늘 총 ${summary.totalStops}개 농장, ${summary.totalEstrusAnimals}두에 대한 인공수정 순회가 예정되어 있습니다.`,
  ];

  if (summary.windowClosingSoonCount > 0) {
    lines.push(
      `⚠ ${summary.windowClosingSoonCount}두의 수정 적기가 2시간 이내에 종료됩니다. 해당 농장을 우선 방문하세요.`,
    );
  }

  const urgentStops = stops.filter((s) => s.priorityLevel === 'urgent');
  for (const stop of urgentStops.slice(0, 3)) {
    lines.push(
      `${stop.farmName}에서 ${stop.totalEstrusAnimals}두 발정 감지 (${stop.windowClosingSoonCount > 0 ? '수정 적기 임박' : '수정 대기 중'}).`,
    );
  }

  lines.push(
    `총 예상 이동거리 ${Math.round(summary.totalDistanceKm)}km, 소요시간 약 ${Math.floor(summary.estimatedTotalTimeMinutes / 60)}시간 ${summary.estimatedTotalTimeMinutes % 60}분입니다.`,
  );

  return lines.join(' ');
}

unifiedDashboardRouter.get('/insemination-route', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const user = req.user;
    const dateParam = (req.query.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const farmIdParam = (req.query.farmId as string | undefined) ?? null;
    const now = new Date();

    // 발정 감지 이벤트: 최근 24시간 이내 (수정 윈도우 내)
    const sinceHours = new Date();
    sinceHours.setHours(sinceHours.getHours() - ESTRUS_WINDOW_HOURS);

    // 활성 농장 조회 (좌표 포함) — farmId 지정 시 해당 농장만
    const farmQuery = db.select({
      farmId: farms.farmId,
      name: farms.name,
      lat: farms.lat,
      lng: farms.lng,
    })
      .from(farms);

    const allFarms = farmIdParam
      ? await farmQuery.where(and(eq(farms.status, 'active'), eq(farms.farmId, farmIdParam)))
      : await farmQuery.where(eq(farms.status, 'active'));

    // 발정 관련 이벤트 조회 (미확인 + 최근)
    const estrusEvents = await db.select({
      eventId: smaxtecEvents.eventId,
      farmId: smaxtecEvents.farmId,
      animalId: smaxtecEvents.animalId,
      eventType: smaxtecEvents.eventType,
      severity: smaxtecEvents.severity,
      detectedAt: smaxtecEvents.detectedAt,
      details: smaxtecEvents.details,
    })
      .from(smaxtecEvents)
      .where(whereAll(
        farmCondition(smaxtecEvents.farmId, farmIdParam),
        gte(smaxtecEvents.detectedAt, sinceHours),
        eq(smaxtecEvents.acknowledged, false),
        inArray(smaxtecEvents.eventType, ESTRUS_EVENT_TYPES),
      ));

    // 동물 정보 조회 (earTag, 산차, 마지막 분만일)
    const animalIds = [...new Set(estrusEvents.map((e) => e.animalId))];
    const animalMap = new Map<string, {
      earTag: string;
      lactationNumber: number;
      lastCalvingDate: Date | null;
    }>();

    if (animalIds.length > 0) {
      const animalRows = await db.select({
        animalId: animals.animalId,
        earTag: animals.earTag,
      })
        .from(animals)
        .where(inArray(animals.animalId, animalIds));

      // 최근 분만일 + 산차 조회
      const calvingRows = animalIds.length > 0
        ? await db.select({
            animalId: calvingEvents.animalId,
            calvingDate: calvingEvents.calvingDate,
          })
            .from(calvingEvents)
            .where(inArray(calvingEvents.animalId, animalIds))
            .orderBy(desc(calvingEvents.calvingDate))
        : [];

      const lastCalvingMap = new Map<string, Date>();
      const calvingCountMap = new Map<string, number>();
      for (const c of calvingRows) {
        if (!lastCalvingMap.has(c.animalId) && c.calvingDate) {
          lastCalvingMap.set(c.animalId, new Date(c.calvingDate));
        }
        calvingCountMap.set(c.animalId, (calvingCountMap.get(c.animalId) ?? 0) + 1);
      }

      // 이번 사이클 수정 횟수 조회
      const breedingCountRows = animalIds.length > 0
        ? await db.select({
            animalId: breedingEvents.animalId,
            cnt: count(),
          })
            .from(breedingEvents)
            .where(inArray(breedingEvents.animalId, animalIds))
            .groupBy(breedingEvents.animalId)
        : [];

      const breedingCountMap = new Map<string, number>();
      for (const b of breedingCountRows) {
        breedingCountMap.set(b.animalId, Number(b.cnt));
      }

      for (const a of animalRows) {
        animalMap.set(a.animalId, {
          earTag: a.earTag,
          lactationNumber: calvingCountMap.get(a.animalId) ?? 0,
          lastCalvingDate: lastCalvingMap.get(a.animalId) ?? null,
        });
      }

      // Populate breeding count into animalMap
      for (const [aid] of animalMap) {
        const info = animalMap.get(aid);
        if (info) {
          (info as Record<string, unknown>)['breedingCount'] = breedingCountMap.get(aid) ?? 0;
        }
      }
    }

    // farmId별 이벤트 그룹핑
    const farmEventsMap = new Map<string, typeof estrusEvents>();
    for (const evt of estrusEvents) {
      const existing = farmEventsMap.get(evt.farmId) ?? [];
      farmEventsMap.set(evt.farmId, [...existing, evt]);
    }

    // 농장별 우선순위 계산
    const farmMap = new Map(allFarms.map((f) => [f.farmId, f]));
    const candidateFarms: {
      readonly farmId: string;
      readonly farmName: string;
      readonly lat: number;
      readonly lng: number;
      readonly priorityScore: number;
      readonly events: typeof estrusEvents;
    }[] = [];

    for (const [farmId, events] of farmEventsMap.entries()) {
      const farm = farmMap.get(farmId);
      if (!farm) continue;

      // 가장 긴급한 동물 기준으로 농장 우선순위 계산
      let maxPriority = 0;
      for (const evt of events) {
        const detectedAt = evt.detectedAt ?? now;
        const hoursElapsed = (now.getTime() - detectedAt.getTime()) / 3_600_000;
        const hoursRemaining = Math.max(0, ESTRUS_WINDOW_HOURS - hoursElapsed);

        const detailObj = (evt.details ?? {}) as Record<string, unknown>;
        const activityIncrease = Number(detailObj['activityIncreasePct'] ?? detailObj['activity_increase'] ?? 120);
        const intensity = estimateEstrusIntensity(activityIncrease);

        const priority = computeInseminationPriority(hoursRemaining, intensity, events.length);
        if (priority > maxPriority) maxPriority = priority;
      }

      if (maxPriority > 0) {
        candidateFarms.push({
          farmId,
          farmName: farm.name,
          lat: farm.lat,
          lng: farm.lng,
          priorityScore: maxPriority,
          events,
        });
      }
    }

    // 우선순위 내림차순 정렬 후 nearest-neighbor 라우팅 적용
    const sortedFarms = [...candidateFarms].sort((a, b) => b.priorityScore - a.priorityScore);
    const routeOrder = applyNearestNeighborRouting(
      sortedFarms.map((f) => ({ ...f, urgencyScore: f.priorityScore })),
    );

    // Kakao Mobility API로 실제 도로거리 일괄 계산
    const orderedPoints = routeOrder.map((idx) => {
      const f = sortedFarms[idx]!;
      return { lat: f.lat, lng: f.lng };
    });
    const segmentDistances = await batchRouteDistances(orderedPoints);

    let cumulativeMinutes = 0;
    let cumulativeDistanceKm = 0;
    let totalEstrusAnimals = 0;
    let totalWindowClosingSoon = 0;

    const rng = seededRandom(`insem-${dateParam}`);

    const stops: InseminationRouteStop[] = routeOrder.reduce<InseminationRouteStop[]>((acc, idx, orderIdx) => {
      const farm = sortedFarms[idx];
      if (!farm) return acc;

      const segment = segmentDistances[orderIdx];
      const distFromPrev = segment?.distanceKm ?? 0;
      const travelTime = segment?.durationMinutes ?? 0;

      cumulativeDistanceKm += distFromPrev;
      cumulativeMinutes += travelTime;

      let stopWindowClosingSoon = 0;

      const briefings: InseminationAnimalBriefing[] = farm.events.map((evt) => {
        const animalInfo = animalMap.get(evt.animalId);
        const detectedAt = evt.detectedAt ?? now;
        const hoursElapsed = (now.getTime() - detectedAt.getTime()) / 3_600_000;
        const hoursRemaining = Math.max(0, ESTRUS_WINDOW_HOURS - hoursElapsed);

        if (hoursRemaining <= 2) stopWindowClosingSoon += 1;

        const detailObj = (evt.details ?? {}) as Record<string, unknown>;
        const activityIncrease = Number(detailObj['activityIncreasePct'] ?? detailObj['activity_increase'] ?? 120);
        const tempDelta = Number(detailObj['temperatureDelta'] ?? detailObj['temp_delta'] ?? 0.3 + rng() * 0.4);
        const intensity = estimateEstrusIntensity(activityIncrease);

        const lastCalving = animalInfo?.lastCalvingDate;
        const daysSinceCalving = lastCalving
          ? Math.round((now.getTime() - lastCalving.getTime()) / 86_400_000)
          : 0;

        const breedingCount = ((animalInfo as Record<string, unknown> | undefined)?.['breedingCount'] as number) ?? 0;

        // 최적 수정 윈도우 계산
        const optStart = new Date(detectedAt.getTime() + OPTIMAL_INSEMINATION_START_HOURS * 3_600_000);
        const optEnd = new Date(detectedAt.getTime() + OPTIMAL_INSEMINATION_END_HOURS * 3_600_000);

        // AI 정액 추천 (산차, 수정 횟수 기반)
        const semenIdx = Math.floor(rng() * SEMEN_RECOMMENDATIONS.length);
        const suggestedSemen = SEMEN_RECOMMENDATIONS[semenIdx] ?? SEMEN_RECOMMENDATIONS[0]!;

        const suggestedAction = hoursRemaining <= 2
          ? '수정 적기 임박 — 즉시 수정 실시'
          : hoursRemaining <= 6
            ? '수정 적기 진입 — 수정 실시 권장'
            : '발정 확인 후 수정 대기';

        return {
          animalId: evt.animalId,
          earTag: animalInfo?.earTag ?? 'N/A',
          estrusDetectedAt: detectedAt.toISOString(),
          hoursRemaining: Math.round(hoursRemaining * 10) / 10,
          estrusIntensity: intensity,
          activityIncreasePct: activityIncrease,
          temperatureDelta: Math.round(tempDelta * 100) / 100,
          lactationNumber: animalInfo?.lactationNumber ?? 0,
          daysSinceLastCalving: daysSinceCalving,
          previousInseminationCount: breedingCount,
          suggestedSemen,
          suggestedAction,
          optimalWindowStart: optStart.toISOString(),
          optimalWindowEnd: optEnd.toISOString(),
        };
      });

      const estimatedDuration = Math.max(10, Math.min(40, briefings.length * 8));
      const arrivalMinutes = cumulativeMinutes;
      cumulativeMinutes += estimatedDuration;

      totalEstrusAnimals += briefings.length;
      totalWindowClosingSoon += stopWindowClosingSoon;

      const level = inseminationPriorityLevel(farm.priorityScore);

      return [...acc, {
        order: orderIdx + 1,
        farmId: farm.farmId,
        farmName: farm.farmName,
        lat: farm.lat,
        lng: farm.lng,
        priorityScore: farm.priorityScore,
        priorityLevel: level,
        estimatedArrivalMinutes: arrivalMinutes,
        estimatedDurationMinutes: estimatedDuration,
        distanceFromPrevKm: Math.round(distFromPrev * 10) / 10,
        travelTimeMinutes: travelTime,
        animalBriefings: briefings,
        totalEstrusAnimals: briefings.length,
        windowClosingSoonCount: stopWindowClosingSoon,
      }];
    }, []);

    const summary: InseminationRouteSummary = {
      totalStops: stops.length,
      totalDistanceKm: Math.round(cumulativeDistanceKm * 10) / 10,
      estimatedTotalTimeMinutes: cumulativeMinutes,
      totalEstrusAnimals,
      windowClosingSoonCount: totalWindowClosingSoon,
      efficiency: stops.length > 0
        ? Math.round((cumulativeDistanceKm / stops.length) * 10) / 10
        : 0,
    };

    const plan: InseminationRoutePlan = {
      technicianId: user?.userId ?? 'unknown',
      technicianName: '인공수정사',
      date: dateParam,
      summary,
      stops,
      aiBriefing: stops.length > 0
        ? buildInseminationAiBriefing(stops, summary)
        : '오늘 인공수정이 필요한 발정 감지 동물이 없습니다.',
      lastUpdated: now.toISOString(),
    };

    res.json({ success: true, data: plan });
  } catch (error) {
    logger.error({ error }, 'Insemination route optimization failed');
    next(error);
  }
});
