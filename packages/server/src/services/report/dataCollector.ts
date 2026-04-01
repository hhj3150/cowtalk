// CowTalk 보고서용 데이터 수집기
// 실제 Drizzle ORM 스키마 기반 — smaxtecEvents, sensorDailyAgg, breedingEvents 등

import { getDb } from '../../config/database.js';
import {
  farms,
  animals,
  smaxtecEvents,
  sensorDevices,
  sensorDailyAgg,
  breedingEvents,
  pregnancyChecks,
  calvingEvents,
  healthEvents,
} from '../../db/schema.js';
import { eq, and, gte, lt, lte, count, sql, desc, isNull } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import type { ReportType } from './config.js';

export interface ReportParams {
  readonly farmId?: string;
  readonly traceNo?: string;
  readonly animalId?: string;
  readonly date?: string;
  readonly year?: number;
  readonly month?: number;
  readonly days?: number;
  readonly alarmType?: string;
}

export interface ReportData {
  readonly reportMeta: {
    readonly type: ReportType;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

type Collector = (params: ReportParams) => Promise<ReportData>;

const collectors: Readonly<Record<string, Collector>> = {
  farm_daily: collectFarmDaily,
  farm_monthly: collectFarmMonthly,
  herd_health: collectHerdHealth,
  animal_detail: collectAnimalDetail,
  sensor_alert: collectSensorAlerts,
  breeding: collectBreeding,
  heat_detection: collectHeatDetection,
  custom: collectCustom,
};

export async function collectReportData(reportType: string, params: ReportParams = {}): Promise<ReportData> {
  const collector = collectors[reportType];
  if (!collector) {
    throw new Error(`Unknown report type: ${reportType}`);
  }
  return collector(params);
}

// ── 농장 일일 현황 ──
async function collectFarmDaily({ farmId, date }: ReportParams): Promise<ReportData> {
  const db = getDb();
  const targetDate = date ?? new Date().toISOString().split('T')[0]!;
  const dayStart = new Date(`${targetDate}T00:00:00Z`);
  const dayEnd = new Date(`${targetDate}T23:59:59Z`);

  const [farmRows, animalRows, eventRows, deviceRows] = await Promise.all([
    db.select().from(farms).where(eq(farms.farmId, farmId!)),

    db.select({
      total: count(),
      milking: sql<number>`count(*) filter (where ${animals.lactationStatus} = 'milking')`,
      dry: sql<number>`count(*) filter (where ${animals.lactationStatus} = 'dry')`,
      active: sql<number>`count(*) filter (where ${animals.status} = 'active')`,
    }).from(animals).where(
      and(eq(animals.farmId, farmId!), isNull(animals.deletedAt)),
    ),

    db.select({
      eventType: smaxtecEvents.eventType,
      cnt: count(),
    }).from(smaxtecEvents).where(
      and(
        eq(smaxtecEvents.farmId, farmId!),
        gte(smaxtecEvents.detectedAt, dayStart),
        lte(smaxtecEvents.detectedAt, dayEnd),
      ),
    ).groupBy(smaxtecEvents.eventType),

    db.select({
      total: count(),
      active: sql<number>`count(*) filter (where ${sensorDevices.status} = 'active')`,
      inactive: sql<number>`count(*) filter (where ${sensorDevices.status} != 'active')`,
    }).from(sensorDevices)
      .innerJoin(animals, eq(sensorDevices.animalId, animals.animalId))
      .where(eq(animals.farmId, farmId!)),
  ]);

  return {
    reportMeta: {
      type: 'farm_daily',
      farmName: farmRows[0]?.name ?? farmId,
      date: targetDate,
    },
    farmInfo: farmRows[0] ?? {},
    animalCount: animalRows[0] ?? {},
    eventsSummary: eventRows,
    sensorStatus: deviceRows[0] ?? {},
  };
}

// ── 농장 월간 종합 ──
async function collectFarmMonthly({ farmId, year, month }: ReportParams): Promise<ReportData> {
  const db = getDb();
  const y = year ?? new Date().getFullYear();
  const m = month ?? new Date().getMonth() + 1;
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 1);

  const [farmRows, eventsByType, dailyEvents, topAlertAnimals] = await Promise.all([
    db.select().from(farms).where(eq(farms.farmId, farmId!)),

    db.select({
      eventType: smaxtecEvents.eventType,
      cnt: count(),
    }).from(smaxtecEvents).where(
      and(
        eq(smaxtecEvents.farmId, farmId!),
        gte(smaxtecEvents.detectedAt, monthStart),
        lt(smaxtecEvents.detectedAt, monthEnd),
      ),
    ).groupBy(smaxtecEvents.eventType),

    db.select({
      date: sql<string>`${smaxtecEvents.detectedAt}::date`,
      cnt: count(),
    }).from(smaxtecEvents).where(
      and(
        eq(smaxtecEvents.farmId, farmId!),
        gte(smaxtecEvents.detectedAt, monthStart),
        lt(smaxtecEvents.detectedAt, monthEnd),
      ),
    ).groupBy(sql`${smaxtecEvents.detectedAt}::date`)
      .orderBy(sql`${smaxtecEvents.detectedAt}::date`),

    db.select({
      earTag: animals.earTag,
      name: animals.name,
      alertCount: count(),
    }).from(smaxtecEvents)
      .innerJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .where(
        and(
          eq(smaxtecEvents.farmId, farmId!),
          gte(smaxtecEvents.detectedAt, monthStart),
          lt(smaxtecEvents.detectedAt, monthEnd),
        ),
      )
      .groupBy(animals.earTag, animals.name)
      .orderBy(desc(count()))
      .limit(10),
  ]);

  return {
    reportMeta: {
      type: 'farm_monthly',
      farmName: farmRows[0]?.name ?? farmId,
      period: `${String(y)}년 ${String(m)}월`,
    },
    eventsByType,
    dailyEvents,
    topAlertAnimals,
  };
}

// ── 우군 건강 분석 ──
async function collectHerdHealth({ farmId, days = 30 }: ReportParams): Promise<ReportData> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000);

  const farmAnimalIds = db.select({ id: animals.animalId })
    .from(animals)
    .where(and(eq(animals.farmId, farmId!), isNull(animals.deletedAt)));

  const [tempDist, activityTrend, healthAlarms] = await Promise.all([
    db.select({
      range: sql<string>`case
        when ${sensorDailyAgg.avg} < 38.0 then '저체온 (<38.0°C)'
        when ${sensorDailyAgg.avg} between 38.0 and 39.5 then '정상 (38.0-39.5°C)'
        else '고체온 (>39.5°C)'
      end`,
      cnt: count(),
    }).from(sensorDailyAgg).where(
      and(
        sql`${sensorDailyAgg.animalId} in (${farmAnimalIds})`,
        eq(sensorDailyAgg.metricType, 'temperature'),
        sql`${sensorDailyAgg.date} >= ${since.toISOString().split('T')[0]}`,
      ),
    ).groupBy(sql`case
      when ${sensorDailyAgg.avg} < 38.0 then '저체온 (<38.0°C)'
      when ${sensorDailyAgg.avg} between 38.0 and 39.5 then '정상 (38.0-39.5°C)'
      else '고체온 (>39.5°C)'
    end`),

    db.select({
      date: sensorDailyAgg.date,
      avgActivity: sql<number>`round(avg(${sensorDailyAgg.avg})::numeric, 1)`,
    }).from(sensorDailyAgg).where(
      and(
        sql`${sensorDailyAgg.animalId} in (${farmAnimalIds})`,
        eq(sensorDailyAgg.metricType, 'activity'),
        sql`${sensorDailyAgg.date} >= ${since.toISOString().split('T')[0]}`,
      ),
    ).groupBy(sensorDailyAgg.date)
      .orderBy(sensorDailyAgg.date),

    db.select({
      earTag: animals.earTag,
      name: animals.name,
      eventType: smaxtecEvents.eventType,
      severity: smaxtecEvents.severity,
      detectedAt: smaxtecEvents.detectedAt,
    }).from(smaxtecEvents)
      .innerJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .where(
        and(
          eq(smaxtecEvents.farmId, farmId!),
          gte(smaxtecEvents.detectedAt, since),
          sql`${smaxtecEvents.eventType} in ('health_warning', 'temperature_warning', 'temperature_high', 'rumination_warning')`,
        ),
      )
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(50),
  ]);

  return {
    reportMeta: { type: 'herd_health', farmId, days },
    tempDistribution: tempDist,
    activityTrend,
    healthAlarms,
  };
}

// ── 개체별 상세 ──
async function collectAnimalDetail({ traceNo, animalId: paramAnimalId }: ReportParams): Promise<ReportData> {
  const db = getDb();

  // traceNo 또는 animalId로 조회
  const animalRows = traceNo
    ? await db.select().from(animals).where(eq(animals.traceId, traceNo))
    : paramAnimalId
      ? await db.select().from(animals).where(eq(animals.animalId, paramAnimalId))
      : [];

  const animal = animalRows[0];
  if (!animal) {
    return {
      reportMeta: { type: 'animal_detail', traceNo: traceNo ?? paramAnimalId ?? 'unknown', error: '개체를 찾을 수 없습니다' },
    };
  }

  const aid = animal.animalId;
  const since7d = new Date(Date.now() - 7 * 86_400_000);
  const since30d = new Date(Date.now() - 30 * 86_400_000);

  const [recentEvents, sensorTrend, breedingHistory, healthHistory] = await Promise.all([
    db.select().from(smaxtecEvents)
      .where(and(eq(smaxtecEvents.animalId, aid), gte(smaxtecEvents.detectedAt, since30d)))
      .orderBy(desc(smaxtecEvents.detectedAt)).limit(20),

    db.select({
      date: sensorDailyAgg.date,
      metricType: sensorDailyAgg.metricType,
      avg: sensorDailyAgg.avg,
      min: sensorDailyAgg.min,
      max: sensorDailyAgg.max,
    }).from(sensorDailyAgg)
      .where(and(eq(sensorDailyAgg.animalId, aid), sql`${sensorDailyAgg.date} >= ${since7d.toISOString().split('T')[0]}`))
      .orderBy(sensorDailyAgg.date),

    db.select().from(breedingEvents)
      .where(eq(breedingEvents.animalId, aid))
      .orderBy(desc(breedingEvents.eventDate)).limit(10),

    db.select().from(healthEvents)
      .where(eq(healthEvents.animalId, aid))
      .orderBy(desc(healthEvents.eventDate)).limit(10),
  ]);

  return {
    reportMeta: { type: 'animal_detail', traceNo: animal.traceId ?? aid },
    animalInfo: animal,
    recentEvents,
    sensorTrend,
    breedingHistory,
    healthHistory,
  };
}

// ── 센서 알람 분석 ──
async function collectSensorAlerts({ farmId, days = 30 }: ReportParams): Promise<ReportData> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000);

  const conditions = farmId
    ? and(eq(smaxtecEvents.farmId, farmId), gte(smaxtecEvents.detectedAt, since))
    : gte(smaxtecEvents.detectedAt, since);

  const [summary, timeline] = await Promise.all([
    db.select({
      eventType: smaxtecEvents.eventType,
      total: count(),
    }).from(smaxtecEvents).where(conditions!)
      .groupBy(smaxtecEvents.eventType)
      .orderBy(desc(count())),

    db.select({
      date: sql<string>`${smaxtecEvents.detectedAt}::date`,
      eventType: smaxtecEvents.eventType,
      cnt: count(),
    }).from(smaxtecEvents).where(conditions!)
      .groupBy(sql`${smaxtecEvents.detectedAt}::date`, smaxtecEvents.eventType)
      .orderBy(sql`${smaxtecEvents.detectedAt}::date`),
  ]);

  return {
    reportMeta: { type: 'sensor_alert', farmId, days },
    summary,
    timeline,
  };
}

// ── 번식 성적 ──
async function collectBreeding({ farmId, year }: ReportParams): Promise<ReportData> {
  const db = getDb();
  const y = year ?? new Date().getFullYear();
  const yearStart = new Date(y, 0, 1);
  const yearEnd = new Date(y + 1, 0, 1);

  const [inseminations, calvings, pregnancyResults] = await Promise.all([
    db.select({
      month: sql<number>`extract(month from ${breedingEvents.eventDate})`,
      cnt: count(),
    }).from(breedingEvents).where(
      and(
        eq(breedingEvents.farmId, farmId!),
        eq(breedingEvents.type, 'insemination'),
        gte(breedingEvents.eventDate, yearStart),
        lt(breedingEvents.eventDate, yearEnd),
      ),
    ).groupBy(sql`extract(month from ${breedingEvents.eventDate})`)
      .orderBy(sql`extract(month from ${breedingEvents.eventDate})`),

    db.select({
      month: sql<number>`extract(month from ${calvingEvents.calvingDate})`,
      cnt: count(),
    }).from(calvingEvents)
      .innerJoin(animals, eq(calvingEvents.animalId, animals.animalId))
      .where(
        and(
          eq(animals.farmId, farmId!),
          gte(calvingEvents.calvingDate, yearStart),
          lt(calvingEvents.calvingDate, yearEnd),
        ),
      ).groupBy(sql`extract(month from ${calvingEvents.calvingDate})`)
        .orderBy(sql`extract(month from ${calvingEvents.calvingDate})`),

    db.select({
      result: pregnancyChecks.result,
      cnt: count(),
    }).from(pregnancyChecks)
      .innerJoin(animals, eq(pregnancyChecks.animalId, animals.animalId))
      .where(
        and(
          eq(animals.farmId, farmId!),
          gte(pregnancyChecks.checkDate, yearStart),
          lt(pregnancyChecks.checkDate, yearEnd),
        ),
      ).groupBy(pregnancyChecks.result),
  ]);

  return {
    reportMeta: { type: 'breeding', farmId, year: y },
    inseminationsByMonth: inseminations,
    calvingsByMonth: calvings,
    pregnancyResults,
  };
}

// ── 발정 탐지 보고 ──
async function collectHeatDetection({ farmId, days = 30 }: ReportParams): Promise<ReportData> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000);

  const heatEvents = await db.select({
    earTag: animals.earTag,
    name: animals.name,
    detectedAt: smaxtecEvents.detectedAt,
    confidence: smaxtecEvents.confidence,
    severity: smaxtecEvents.severity,
  }).from(smaxtecEvents)
    .innerJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
    .where(
      and(
        eq(smaxtecEvents.farmId, farmId!),
        gte(smaxtecEvents.detectedAt, since),
        sql`${smaxtecEvents.eventType} in ('estrus', 'estrus_dnb', 'heat')`,
      ),
    )
    .orderBy(desc(smaxtecEvents.detectedAt));

  return {
    reportMeta: { type: 'heat_detection', farmId, days },
    heatEvents,
    totalDetected: heatEvents.length,
  };
}

// ── 자유 요청 ──
async function collectCustom(params: ReportParams): Promise<ReportData> {
  const db = getDb();
  const data: Record<string, unknown> = { reportMeta: { type: 'custom' as const } };

  try {
    if (params.farmId) {
      const farmRows = await db.select().from(farms).where(eq(farms.farmId, params.farmId));
      data['farmInfo'] = farmRows[0] ?? {};

      const animalCount = await db.select({ total: count() })
        .from(animals)
        .where(and(eq(animals.farmId, params.farmId), isNull(animals.deletedAt)));
      data['animalCount'] = animalCount[0]?.total ?? 0;
    }
    if (params.traceNo) {
      const animalRows = await db.select().from(animals).where(eq(animals.traceId, params.traceNo));
      data['animalInfo'] = animalRows[0] ?? {};
    }
  } catch (err) {
    logger.warn({ err }, '[Report] Custom data collection partial failure');
  }

  return data as ReportData;
}
