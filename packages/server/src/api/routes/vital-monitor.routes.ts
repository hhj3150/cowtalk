// 체온 + 반추 정밀 모니터링 라우트 — 전염성 질병 조기경보 핵심
// GET /api/vital-monitor?farmId=xxx&days=30

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import { getDb } from '../../config/database.js';
import { smaxtecEvents, animals, farms } from '../../db/schema.js';
import { eq, sql, and, gte, desc } from 'drizzle-orm';
import type {
  VitalMonitorData,
  VitalTimelinePoint,
  VitalAggregation,
  VitalAnomaly,
  VitalEvent,
  VitalSummary,
} from '@cowtalk/shared';

export const vitalMonitorRouter = Router();
vitalMonitorRouter.use(authenticate);

// ── 상수 ──

const TEMP_EVENT_TYPES = ['temperature_high', 'temperature_low'];
const RUM_EVENT_TYPES = ['rumination_decrease', 'rumination_warning'];
const ALL_VITAL_TYPES = [...TEMP_EVENT_TYPES, ...RUM_EVENT_TYPES];

const EVENT_LABELS: Readonly<Record<string, string>> = {
  temperature_high: '체온 상승',
  temperature_low: '체온 하강',
  rumination_decrease: '반추 감소',
  rumination_warning: '반추 이상',
  health_general: '건강 종합',
  clinical_condition: '임상 증상',
  calving_detection: '분만 감지',
  estrus: '발정',
  activity_decrease: '활동 감소',
};

// ── 메인 엔드포인트 ──

vitalMonitorRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.query.farmId as string | undefined;
    const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
    const fromDate = new Date(Date.now() - days * 86_400_000);

    const farmCondition = farmId
      ? eq(smaxtecEvents.farmId, farmId)
      : undefined;

    // SQL IN 절 빌드 (Drizzle sql 템플릿 호환)
    const vitalTypeList = sql.join(ALL_VITAL_TYPES.map((t) => sql`${t}`), sql`, `);
    const farmFilter = farmId ? sql`AND farm_id = ${farmId}` : sql``;
    const farmFilterE = farmId ? sql`AND e.farm_id = ${farmId}` : sql``;

    // 1) 일별 체온/반추 이벤트 집계
    const dailyRows = await db.execute(sql`
      SELECT
        detected_at::date AS date,
        event_type,
        COUNT(*) AS cnt,
        COUNT(DISTINCT animal_id) AS animal_cnt,
        AVG((details->>'value')::float) FILTER (WHERE details->>'value' IS NOT NULL) AS avg_val,
        MIN((details->>'value')::float) FILTER (WHERE details->>'value' IS NOT NULL) AS min_val,
        MAX((details->>'value')::float) FILTER (WHERE details->>'value' IS NOT NULL) AS max_val,
        STDDEV((details->>'value')::float) FILTER (WHERE details->>'value' IS NOT NULL) AS std_val
      FROM smaxtec_events
      WHERE event_type IN (${vitalTypeList})
        AND detected_at >= ${fromDate.toISOString()}
        ${farmFilter}
      GROUP BY detected_at::date, event_type
      ORDER BY date
    `);

    // 2) 개체별 이상치 (편차 기반)
    const anomalyRows = await db.execute(sql`
      WITH herd_avg AS (
        SELECT
          event_type,
          AVG((details->>'value')::float) AS avg_val,
          STDDEV((details->>'value')::float) AS std_val
        FROM smaxtec_events
        WHERE event_type IN (${vitalTypeList})
          AND detected_at >= ${fromDate.toISOString()}
          AND details->>'value' IS NOT NULL
          ${farmFilter}
        GROUP BY event_type
      )
      SELECT
        e.animal_id,
        a.ear_tag,
        e.detected_at::date AS date,
        e.event_type,
        (e.details->>'value')::float AS value,
        h.avg_val AS herd_avg,
        ABS((e.details->>'value')::float - h.avg_val) / NULLIF(h.std_val, 0) AS z_score
      FROM smaxtec_events e
      JOIN animals a ON a.animal_id = e.animal_id
      JOIN herd_avg h ON h.event_type = e.event_type
      WHERE e.event_type IN (${vitalTypeList})
        AND e.detected_at >= ${fromDate.toISOString()}
        AND e.details->>'value' IS NOT NULL
        ${farmFilterE}
        AND ABS((e.details->>'value')::float - h.avg_val) / NULLIF(h.std_val, 0) > 1.5
      ORDER BY z_score DESC NULLS LAST
      LIMIT 50
    `);

    // 3) 관련 이벤트 마커 (체온+반추 외 건강/번식 이벤트 포함)
    const eventRows = await db.select({
      eventId: smaxtecEvents.eventId,
      eventType: smaxtecEvents.eventType,
      detectedAt: smaxtecEvents.detectedAt,
      severity: smaxtecEvents.severity,
      animalId: smaxtecEvents.animalId,
      earTag: animals.earTag,
    })
      .from(smaxtecEvents)
      .innerJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .where(and(
        farmCondition,
        gte(smaxtecEvents.detectedAt, fromDate),
        sql`${smaxtecEvents.severity} IN ('high', 'critical')`,
      ))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(100);

    // 4) 농장명 조회
    let farmName: string | null = null;
    if (farmId) {
      const [farm] = await db.select({ name: farms.name })
        .from(farms)
        .where(eq(farms.farmId, farmId));
      farmName = farm?.name ?? null;
    }

    // ── 데이터 조립 ──

    const timeline = buildTimeline(dailyRows as unknown as DailyRow[], days, fromDate);
    const anomalies = buildAnomalies(anomalyRows as unknown as AnomalyRow[]);
    const events = buildEvents(eventRows);
    const summary = buildSummary(timeline, anomalies);

    const result: VitalMonitorData = {
      farmId: farmId ?? null,
      farmName,
      period: {
        from: fromDate.toISOString(),
        to: new Date().toISOString(),
        days,
      },
      timeline,
      anomalies,
      events,
      summary,
    };

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, 'Vital monitor query failed');
    next(error);
  }
});

// ── 타임라인 빌드 ──

interface DailyRow {
  readonly date: string;
  readonly event_type: string;
  readonly cnt: string;
  readonly animal_cnt: string;
  readonly avg_val: string | null;
  readonly min_val: string | null;
  readonly max_val: string | null;
  readonly std_val: string | null;
}

function buildTimeline(rows: readonly DailyRow[], days: number, fromDate: Date): readonly VitalTimelinePoint[] {
  // 날짜 맵 초기화 (빈 날짜도 포함)
  const dateMap = new Map<string, { temp: VitalAggregation; rumination: VitalAggregation; eventCount: number }>();

  for (let i = 0; i < days; i++) {
    const d = new Date(fromDate.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    dateMap.set(key, {
      temp: emptyAgg(),
      rumination: emptyAgg(),
      eventCount: 0,
    });
  }

  for (const row of rows) {
    const dateKey = String(row.date).slice(0, 10);
    const entry = dateMap.get(dateKey);
    if (!entry) continue;

    const agg: VitalAggregation = {
      avg: safeNum(row.avg_val),
      min: safeNum(row.min_val),
      max: safeNum(row.max_val),
      stddev: safeNum(row.std_val),
      anomalyCount: 0,
      sampleCount: Number(row.cnt),
    };

    if (TEMP_EVENT_TYPES.includes(row.event_type)) {
      dateMap.set(dateKey, { ...entry, temp: agg, eventCount: entry.eventCount + Number(row.cnt) });
    } else if (RUM_EVENT_TYPES.includes(row.event_type)) {
      dateMap.set(dateKey, { ...entry, rumination: agg, eventCount: entry.eventCount + Number(row.cnt) });
    }
  }

  const result: VitalTimelinePoint[] = [];
  for (const [date, val] of dateMap) {
    result.push({ date, ...val });
  }
  return result;
}

// ── 이상치 빌드 ──

interface AnomalyRow {
  readonly animal_id: string;
  readonly ear_tag: string;
  readonly date: string;
  readonly event_type: string;
  readonly value: number;
  readonly herd_avg: number;
  readonly z_score: number | null;
}

function buildAnomalies(rows: readonly AnomalyRow[]): readonly VitalAnomaly[] {
  return rows.map((row) => ({
    animalId: row.animal_id,
    earTag: row.ear_tag ?? '미등록',
    date: String(row.date).slice(0, 10),
    metric: TEMP_EVENT_TYPES.includes(row.event_type) ? 'temp' as const : 'rumination' as const,
    value: round2(row.value),
    herdAvg: round2(row.herd_avg),
    deviation: round2(row.z_score ?? 0),
    severity: (row.z_score ?? 0) > 2.5 ? 'critical' as const : 'warning' as const,
  }));
}

// ── 이벤트 빌드 ──

function buildEvents(rows: readonly {
  eventId: string;
  eventType: string;
  detectedAt: Date | null;
  severity: string;
  animalId: string;
  earTag: string | null;
}[]): readonly VitalEvent[] {
  return rows.map((row) => ({
    eventId: row.eventId,
    eventType: row.eventType,
    label: EVENT_LABELS[row.eventType] ?? row.eventType,
    detectedAt: row.detectedAt?.toISOString() ?? '',
    severity: row.severity,
    earTag: row.earTag ?? '미등록',
    animalId: row.animalId,
  }));
}

// ── 요약 빌드 ──

function buildSummary(
  timeline: readonly VitalTimelinePoint[],
  anomalies: readonly VitalAnomaly[],
): VitalSummary {
  const recent7 = timeline.slice(-7);
  const previous7 = timeline.slice(-14, -7);

  const recentTempAvg = avgOf(recent7.map((t) => t.temp.avg).filter((v) => v > 0));
  const prevTempAvg = avgOf(previous7.map((t) => t.temp.avg).filter((v) => v > 0));
  const recentRumAvg = avgOf(recent7.map((t) => t.rumination.avg).filter((v) => v > 0));
  const prevRumAvg = avgOf(previous7.map((t) => t.rumination.avg).filter((v) => v > 0));

  const tempTrend = getTrend(recentTempAvg, prevTempAvg);
  const ruminationTrend = getTrend(prevRumAvg, recentRumAvg); // 반추는 감소가 나쁨 → 역방향

  const criticalAnomalies = anomalies.filter((a) => a.severity === 'critical').length;
  const totalAnomalies = anomalies.length;

  const riskLevel = criticalAnomalies > 10
    ? 'critical' as const
    : criticalAnomalies > 3
      ? 'warning' as const
      : totalAnomalies > 10
        ? 'caution' as const
        : 'normal' as const;

  return {
    avgTemp: round2(recentTempAvg),
    avgRumination: round2(recentRumAvg),
    tempTrend,
    ruminationTrend,
    totalAnomalies,
    criticalAnomalies,
    riskLevel,
  };
}

// ── 유틸 ──

function emptyAgg(): VitalAggregation {
  return { avg: 0, min: 0, max: 0, stddev: 0, anomalyCount: 0, sampleCount: 0 };
}

function safeNum(val: string | null | undefined): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return Number.isFinite(n) ? round2(n) : 0;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function avgOf(arr: readonly number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function getTrend(current: number, previous: number): 'rising' | 'falling' | 'stable' {
  if (previous === 0) return 'stable';
  const change = (current - previous) / previous;
  if (change > 0.05) return 'rising';
  if (change < -0.05) return 'falling';
  return 'stable';
}
