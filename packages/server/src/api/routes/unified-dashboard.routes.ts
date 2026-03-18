// 통합 대시보드 라우트 — smaXtec 레이아웃 기반 12개 위젯 데이터
// GET /api/unified-dashboard?farmId=xxx&period=7d|14d|30d
// farmId 미지정 → 전체 농장 통합 (146개)
// 알림/경고 → 오늘(24h) 기준, 차트 → period 기준

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import { getDb } from '../../config/database.js';
import {
  farms, animals, smaxtecEvents, breedingEvents,
  sensorDevices, sensorDailyAgg,
} from '../../db/schema.js';
import { eq, count, sql, and, gte, isNull, desc } from 'drizzle-orm';
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
} from '@cowtalk/shared';
import '../../types/express.d.js';

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

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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
    const today = todayStart();

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
        eq(smaxtecEvents.eventType, eventType),
        gte(smaxtecEvents.detectedAt, today),
      ))
      .orderBy(sql`${smaxtecEvents.detectedAt} DESC`)
      .limit(200);

    const items = rows.map((row) => ({
      eventId: row.eventId,
      farmId: row.farmId,
      farmName: row.farmName,
      animalId: row.animalId,
      earTag: row.earTag ?? '미등록',
      animalName: row.animalName ?? '',
      severity: row.severity,
      detectedAt: row.detectedAt?.toISOString() ?? '',
    }));

    res.json({ success: true, data: { eventType, total: items.length, items } });
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
  const cutoff = todayStart(); // 오늘 0시 이후

  const rows = await db.select({
    eventId: smaxtecEvents.eventId,
    eventType: smaxtecEvents.eventType,
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
    .limit(50);

  return rows.map((row) => ({
    eventId: row.eventId,
    eventType: row.eventType,
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
  today: Date,
): Promise<HerdOverview> {
  const [animalCount] = await db.select({ count: count() })
    .from(animals)
    .where(whereAll(farmCondition(animals.farmId, farmId), eq(animals.status, 'active')));

  // 센서: farmId 필터는 animals 조인으로
  const sensorQuery = farmId
    ? db.select({ count: count() })
        .from(sensorDevices)
        .innerJoin(animals, eq(sensorDevices.animalId, animals.animalId))
        .where(and(eq(sensorDevices.status, 'active'), isNull(sensorDevices.removeDate), eq(animals.farmId, farmId)))
    : db.select({ count: count() })
        .from(sensorDevices)
        .where(and(eq(sensorDevices.status, 'active'), isNull(sensorDevices.removeDate)));
  const [sensorCount] = await sensorQuery;

  // 금일 알림 (오늘 0시 이후)
  const [alertCount] = await db.select({ count: count() })
    .from(smaxtecEvents)
    .where(whereAll(farmCondition(smaxtecEvents.farmId, farmId), gte(smaxtecEvents.detectedAt, today)));

  // 금일 건강 이상
  const [healthCount] = await db.select({ count: count() })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, today),
      sql`${smaxtecEvents.eventType} IN ('health_warning', 'temperature_warning')`,
    ));

  return {
    totalAnimals: (animalCount?.count ?? 0) as number,
    sensorAttached: (sensorCount?.count ?? 0) as number,
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
  today: Date,
): Promise<readonly TodoItem[]> {
  // 오늘 발생 이벤트 유형별 카운트
  const eventCounts = await db.select({
    eventType: smaxtecEvents.eventType,
    count: count(),
  })
    .from(smaxtecEvents)
    .where(whereAll(farmCondition(smaxtecEvents.farmId, farmId), gte(smaxtecEvents.detectedAt, today)))
    .groupBy(smaxtecEvents.eventType);

  // 미확인 알림 (오늘)
  const [unackedCount] = await db.select({ count: count() })
    .from(smaxtecEvents)
    .where(whereAll(
      farmCondition(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, today),
      eq(smaxtecEvents.acknowledged, false),
    ));

  // 우선순위: 1.발정소 수정 2.아픈소 관리 3.분만 대비 4.기타
  // 목장에서 매일 가장 중요한 업무: 발정 개체 수정 + 아픈소 조기 관리
  const typeToTodo: Record<string, { label: string; category: string; icon: string; severity: TodoItem['severity']; priority: number }> = {
    estrus: { label: '🔴 발정 소 수정', category: 'fertility', icon: 'venus', severity: 'critical', priority: 0 },
    health_warning: { label: '🟠 아픈 소 관리', category: 'health', icon: 'heart-pulse', severity: 'high', priority: 1 },
    temperature_warning: { label: '🟠 발열 소 확인', category: 'health', icon: 'thermometer', severity: 'high', priority: 2 },
    calving: { label: '🔴 분만 준비', category: 'fertility', icon: 'baby', severity: 'critical', priority: 3 },
    rumination_warning: { label: '🟡 반추 이상 확인', category: 'feeding', icon: 'utensils', severity: 'medium', priority: 4 },
    activity_warning: { label: '🟡 활동 이상 확인', category: 'health', icon: 'activity', severity: 'medium', priority: 5 },
    drinking_warning: { label: '🟡 음수 이상 확인', category: 'feeding', icon: 'droplet', severity: 'medium', priority: 6 },
    feeding_warning: { label: '🟡 사양 이상 확인', category: 'feeding', icon: 'wheat', severity: 'medium', priority: 7 },
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
