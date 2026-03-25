// 방역관 전용 대시보드 서비스
// 6개 KPI + 위험 등급 + TOP5 위험 농장 + 24h 발열 추이 + 7일 DSI 추이
// 기존 earlyDetection 서비스 재활용

import { getDb } from '../../config/database.js';
import { farms, animals, sensorMeasurements, alerts, smaxtecEvents } from '../../db/schema.js';
import { eq, gte, and, desc, count, sql, inArray } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { ALERT_THRESHOLDS } from '@cowtalk/shared';

const FEVER_EVENT_TYPES = ['temperature_high', 'health_103', 'health_104', 'health_308', 'health_309'] as const;

// ===========================
// 타입
// ===========================

export type RiskLevel = 'green' | 'yellow' | 'orange' | 'red';

export interface QuarantineKpi {
  readonly totalAnimals: number;           // 감시 두수
  readonly sensorRate: number;             // 센서 장착률 0-1
  readonly feverAnimals: number;           // 발열 두수 (실시간)
  readonly clusterFarms: number;           // 집단 발열 농장 수
  readonly legalDiseaseSuspects: number;   // 법정전염병 의심 건수
  readonly riskLevel: RiskLevel;           // 위험 등급
  readonly feverRate: number;              // 발열률 0-1
}

export interface RiskFarm {
  readonly farmId: string;
  readonly farmName: string;
  readonly healthAlertCount: number;  // 전체 건강 알람 (번식 제외)
  readonly feverCount: number;
  readonly ruminationCount: number;
  readonly otherHealthCount: number;
  readonly groupRate: number;         // 집단 발생 비율 (이상두수/전체두수)
  readonly clusterAlert: boolean;
  readonly legalSuspect: boolean;
  readonly riskScore: number;         // 0-100
  readonly lat: number;
  readonly lng: number;
}

export interface HourlyFeverPoint {
  readonly hour: string;   // ISO 시각 (시 단위)
  readonly count: number;
}

export interface DsiDayPoint {
  readonly date: string;   // YYYY-MM-DD
  readonly avgDsi: number; // 0-100
}

export interface QuarantineDashboardData {
  readonly kpi: QuarantineKpi;
  readonly top5RiskFarms: readonly RiskFarm[];
  readonly hourlyFever24h: readonly HourlyFeverPoint[];
  readonly dsi7Days: readonly DsiDayPoint[];
  readonly activeAlerts: readonly ActiveAlert[];
  readonly computedAt: string;
}

export interface ActiveAlert {
  readonly alertId: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly alertType: string;
  readonly priority: string;
  readonly title: string;
  readonly createdAt: string;
}

// ===========================
// 위험 등급 계산
// ===========================

function calcRiskLevel(
  feverRate: number,
  clusterFarms: number,
  legalSuspects: number,
): RiskLevel {
  // 🔴 심각: 발열률 10%+ 또는 법정전염병 의심 80%+ 또는 확진
  if (feverRate >= 0.10 || legalSuspects >= 1) return 'red';
  // 🟠 경계: 발열률 5~10% 또는 집단 발열 2건+
  if (feverRate >= 0.05 || clusterFarms >= 2) return 'orange';
  // 🟡 주의: 발열률 2~5% 또는 집단 발열 1건
  if (feverRate >= 0.02 || clusterFarms >= 1) return 'yellow';
  return 'green';
}

// ===========================
// 발열 두수 집계 (최근 6시간)
// ===========================

interface FarmFeverInfo {
  readonly farmId: string;
  readonly feverCount: number;
  readonly animalIds: string[];
}

async function fetchFeverByFarm(since: Date): Promise<Map<string, FarmFeverInfo>> {
  const db = getDb();

  // 최근 24시간 발열 이벤트 — smaxtecEvents 기반
  const rows = await db
    .select({
      animalId: smaxtecEvents.animalId,
      farmId: smaxtecEvents.farmId,
    })
    .from(smaxtecEvents)
    .where(
      and(
        inArray(smaxtecEvents.eventType, [...FEVER_EVENT_TYPES]),
        gte(smaxtecEvents.detectedAt, since),
      ),
    )
    .groupBy(smaxtecEvents.animalId, smaxtecEvents.farmId);

  const result = new Map<string, FarmFeverInfo>();
  for (const row of rows) {
    const existing = result.get(row.farmId);
    if (existing) {
      result.set(row.farmId, {
        farmId: row.farmId,
        feverCount: existing.feverCount + 1,
        animalIds: [...existing.animalIds, row.animalId],
      });
    } else {
      result.set(row.farmId, {
        farmId: row.farmId,
        feverCount: 1,
        animalIds: [row.animalId],
      });
    }
  }
  return result;
}

// ===========================
// 농장별 건강 알람 집계 (번식 제외, 메인 대시보드와 동일 기준)
// ===========================

// 번식 이벤트 제외 목록 — queryFarmRanking()과 동일
const EXCLUDED_BREEDING_TYPES = [
  'estrus', 'estrus_dnb', 'heat', 'insemination', 'pregnancy_result', 'pregnancy_check',
  'no_insemination', 'calving_detection', 'calving_confirmation', 'dry_off', 'abort',
  'fertility_warning', 'activity_increase',
] as const;

interface FarmHealthAlertInfo {
  readonly farmId: string;
  readonly totalAlerts: number;
  readonly feverCount: number;
  readonly ruminationCount: number;
  readonly otherCount: number;
  readonly animalIds: readonly string[];
}

async function fetchHealthAlertsByFarm(since: Date): Promise<Map<string, FarmHealthAlertInfo>> {
  const db = getDb();

  const rows = await db
    .select({
      farmId: smaxtecEvents.farmId,
      eventType: smaxtecEvents.eventType,
      animalId: smaxtecEvents.animalId,
    })
    .from(smaxtecEvents)
    .where(
      and(
        gte(smaxtecEvents.detectedAt, since),
        sql`${smaxtecEvents.eventType} NOT IN (${sql.raw(EXCLUDED_BREEDING_TYPES.map((t) => `'${t}'`).join(','))})`,
      ),
    )
    .groupBy(smaxtecEvents.farmId, smaxtecEvents.eventType, smaxtecEvents.animalId);

  const result = new Map<string, { farmId: string; fever: number; rumination: number; other: number; animalSet: Set<string> }>();
  for (const row of rows) {
    const existing = result.get(row.farmId) ?? { farmId: row.farmId, fever: 0, rumination: 0, other: 0, animalSet: new Set<string>() };
    const isFever = row.eventType.includes('temperature');
    const isRumination = row.eventType.includes('rumination');
    if (isFever) existing.fever++;
    else if (isRumination) existing.rumination++;
    else existing.other++;
    existing.animalSet.add(row.animalId);
    result.set(row.farmId, existing);
  }

  return new Map(
    Array.from(result.entries()).map(([id, v]) => [id, {
      farmId: v.farmId,
      totalAlerts: v.fever + v.rumination + v.other,
      feverCount: v.fever,
      ruminationCount: v.rumination,
      otherCount: v.other,
      animalIds: Array.from(v.animalSet),
    }]),
  );
}

// ===========================
// 24시간 시간별 발열 추이
// ===========================

async function fetchHourlyFever24h(): Promise<readonly HourlyFeverPoint[]> {
  const db = getDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      hour: sql<string>`date_trunc('hour', ${smaxtecEvents.detectedAt})::text`,
      cnt: count(smaxtecEvents.animalId).as('cnt'),
    })
    .from(smaxtecEvents)
    .where(
      and(
        inArray(smaxtecEvents.eventType, [...FEVER_EVENT_TYPES]),
        gte(smaxtecEvents.detectedAt, since24h),
      ),
    )
    .groupBy(sql`date_trunc('hour', ${smaxtecEvents.detectedAt})`)
    .orderBy(sql`date_trunc('hour', ${smaxtecEvents.detectedAt})`);

  return rows.map((r) => ({ hour: r.hour, count: Number(r.cnt) }));
}

// ===========================
// 7일 DSI 평균 추이 (단순화: 발열률 기반)
// ===========================

async function fetchDsi7Days(): Promise<readonly DsiDayPoint[]> {
  const db = getDb();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const threshold = ALERT_THRESHOLDS.temperature.high;

  const rows = await db
    .select({
      day: sql<string>`date_trunc('day', ${sensorMeasurements.timestamp})::text`,
      avgTemp: sql<number>`avg(${sensorMeasurements.value})`,
      maxTemp: sql<number>`max(${sensorMeasurements.value})`,
    })
    .from(sensorMeasurements)
    .where(
      and(
        eq(sensorMeasurements.metricType, 'temperature'),
        gte(sensorMeasurements.timestamp, since7d),
      ),
    )
    .groupBy(sql`date_trunc('day', ${sensorMeasurements.timestamp})`)
    .orderBy(sql`date_trunc('day', ${sensorMeasurements.timestamp})`);

  return rows.map((r) => {
    // DSI 추정: 체온 평균이 threshold 초과하는 정도를 0-100 스케일
    const tempDelta = Math.max(0, Number(r.maxTemp) - threshold);
    const dsi = Math.min(Math.round(tempDelta * 20), 100);
    return { date: r.day.slice(0, 10), avgDsi: dsi };
  });
}

// ===========================
// 활성 경보 목록
// ===========================

async function fetchActiveAlerts(): Promise<readonly ActiveAlert[]> {
  const db = getDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // alerts 테이블 우선, 없으면 smaxtecEvents high/critical 기반
  const alertRows = await db
    .select({
      alertId: alerts.alertId,
      farmId: alerts.farmId,
      farmName: farms.name,
      alertType: alerts.alertType,
      priority: alerts.priority,
      title: alerts.title,
      createdAt: alerts.createdAt,
    })
    .from(alerts)
    .innerJoin(farms, eq(alerts.farmId, farms.farmId))
    .where(sql`${alerts.status} IN ('new', 'acknowledged')`)
    .orderBy(desc(alerts.createdAt))
    .limit(20);

  if (alertRows.length > 0) {
    return alertRows.map((r) => ({
      alertId: r.alertId,
      farmId: r.farmId,
      farmName: r.farmName,
      alertType: r.alertType,
      priority: r.priority,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // alerts 테이블이 비어 있으면 smaxtecEvents 기반으로 대체
  const rows = await db
    .select({
      eventId: smaxtecEvents.eventId,
      farmId: smaxtecEvents.farmId,
      farmName: farms.name,
      eventType: smaxtecEvents.eventType,
      severity: smaxtecEvents.severity,
      detectedAt: smaxtecEvents.detectedAt,
    })
    .from(smaxtecEvents)
    .innerJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
    .where(
      and(
        gte(smaxtecEvents.detectedAt, since24h),
        sql`${smaxtecEvents.severity} IN ('high', 'critical')`,
      ),
    )
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(20);

  return rows.map((r) => ({
    alertId: r.eventId,
    farmId: r.farmId,
    farmName: r.farmName,
    alertType: r.eventType,
    priority: r.severity === 'critical' ? 'critical' : 'high',
    title: `${r.eventType} 이벤트 — ${r.farmName}`,
    createdAt: r.detectedAt.toISOString(),
  }));
}

// ===========================
// 센서 장착 농장 수
// ===========================

async function fetchSensorStats(): Promise<{ sensored: number; total: number; totalAnimals: number; sensoredAnimals: number }> {
  const db = getDb();

  const totalRow = await db
    .select({ cnt: count(farms.farmId), heads: sql<number>`sum(${farms.currentHeadCount})` })
    .from(farms)
    .where(eq(farms.status, 'active'));

  // 센서 있는 개체 카운트
  const sensoredRow = await db
    .select({ cnt: count(animals.animalId) })
    .from(animals)
    .where(
      and(
        eq(animals.status, 'active'),
        sql`${animals.currentDeviceId} is not null`,
      ),
    );

  const totalAnimalsRow = await db
    .select({ cnt: count(animals.animalId) })
    .from(animals)
    .where(eq(animals.status, 'active'));

  const total = Number(totalRow[0]?.cnt ?? 0);
  const totalAnimals = Number(totalAnimalsRow[0]?.cnt ?? 0);
  const sensoredAnimals = Number(sensoredRow[0]?.cnt ?? 0);

  return { sensored: total, total, totalAnimals, sensoredAnimals };
}

// ===========================
// 메인: getQuarantineDashboard
// ===========================

export async function getQuarantineDashboard(): Promise<QuarantineDashboardData> {
  try {
    const db = getDb();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [sensorStats, feverByFarm, healthByFarm, hourlyFever24h, dsi7Days, activeAlerts, allFarms] =
      await Promise.all([
        fetchSensorStats(),
        fetchFeverByFarm(since24h),
        fetchHealthAlertsByFarm(since24h),
        fetchHourlyFever24h(),
        fetchDsi7Days(),
        fetchActiveAlerts(),
        db.select({
          farmId: farms.farmId,
          farmName: farms.name,
          headCount: farms.currentHeadCount,
          lat: farms.lat,
          lng: farms.lng,
        }).from(farms).where(eq(farms.status, 'active')),
      ]);

    const totalAnimals = sensorStats.totalAnimals;
    const sensorRate = totalAnimals > 0 ? sensorStats.sensoredAnimals / totalAnimals : 0;
    const feverAnimals = Array.from(feverByFarm.values()).reduce((s, f) => s + f.feverCount, 0);
    const feverRate = totalAnimals > 0 ? feverAnimals / totalAnimals : 0;

    // 집단 발열: 3두+ 발열 농장
    const clusterFarms = Array.from(feverByFarm.values()).filter((f) => f.feverCount >= 3).length;

    // 법정전염병 의심: 우선순위 critical 경보 수
    const legalSuspects = activeAlerts.filter((a) => a.priority === 'critical').length;

    const riskLevel = calcRiskLevel(feverRate, clusterFarms, legalSuspects);

    // TOP5 위험 농장 — 메인 대시보드 farm-health-scores와 동일한 5요인 공식
    // healthScore = 체온(30) + 반추(25) + 동반(20) + 추세(15) + 역학(10) = 100점 만점
    // riskScore = 100 - healthScore (위험할수록 높음)
    const top5RiskFarms: RiskFarm[] = allFarms
      .map((f) => {
        const health = healthByFarm.get(f.farmId);
        const healthAlertCount = health?.totalAlerts ?? 0;
        const feverCount = health?.feverCount ?? 0;
        const ruminationCount = health?.ruminationCount ?? 0;
        const otherHealthCount = health?.otherCount ?? 0;
        const uniqueAnimals = health?.animalIds.length ?? 0;
        const headCount = Math.max(f.headCount, 1);

        // 집단 발생 비율
        const groupRate = headCount > 0 ? uniqueAnimals / headCount : 0;
        const clusterAlert = groupRate >= 0.10 || uniqueAnimals >= 3;
        const legalSuspect = activeAlerts.some(
          (a) => a.farmId === f.farmId && a.priority === 'critical',
        );

        // 5요인 건강점수 (메인 대시보드 동일 공식)
        const tempRate = feverCount / headCount;
        const tempScore = Math.round(30 * (1 - Math.min(tempRate / 0.15, 1)));
        const rumRate = ruminationCount / headCount;
        const rumScore = Math.round(25 * (1 - Math.min(rumRate / 0.15, 1)));
        const comorbidRate = groupRate;
        const actScore = Math.round(20 * (1 - Math.min(comorbidRate / 0.10, 1)));
        const epiScore = legalSuspect ? 0 : clusterAlert ? 3 : 10;
        const healthScore = tempScore + rumScore + actScore + 10 + epiScore; // 추세 10 (기본 stable)

        const riskScore = 100 - healthScore;

        return {
          farmId: f.farmId,
          farmName: f.farmName,
          healthAlertCount,
          feverCount,
          ruminationCount,
          otherHealthCount,
          groupRate,
          clusterAlert,
          legalSuspect,
          riskScore,
          lat: f.lat,
          lng: f.lng,
        };
      })
      .filter((f) => f.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5);

    return {
      kpi: {
        totalAnimals,
        sensorRate,
        feverAnimals,
        clusterFarms,
        legalDiseaseSuspects: legalSuspects,
        riskLevel,
        feverRate,
      },
      top5RiskFarms,
      hourlyFever24h,
      dsi7Days,
      activeAlerts,
      computedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.error({ err }, '[QuarantineDashboard] 조회 실패');
    throw err;
  }
}

// ===========================
// 당일 업무 큐
// ===========================

export type ActionStatus = 'pending' | 'dispatched' | 'phone_confirmed' | 'monitoring' | 'completed';
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ActionQueueItem {
  readonly actionId: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly type: 'legal_disease' | 'cluster_fever' | 'individual_fever' | 'scheduled';
  readonly priority: ActionPriority;
  readonly title: string;
  readonly description: string;
  readonly status: ActionStatus;
  readonly createdAt: string;
}

export async function getActionQueue(): Promise<readonly ActionQueueItem[]> {
  const db = getDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      alertId: alerts.alertId,
      farmId: alerts.farmId,
      farmName: farms.name,
      alertType: alerts.alertType,
      priority: alerts.priority,
      title: alerts.title,
      status: alerts.status,
      createdAt: alerts.createdAt,
    })
    .from(alerts)
    .innerJoin(farms, eq(alerts.farmId, farms.farmId))
    .where(
      and(
        gte(alerts.createdAt, since24h),
        sql`${alerts.status} in ('new', 'acknowledged')`,
      ),
    )
    .orderBy(desc(alerts.createdAt))
    .limit(50);

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  const items: ActionQueueItem[] = rows.map((r) => {
    const type: ActionQueueItem['type'] =
      r.priority === 'critical' ? 'legal_disease' :
      r.alertType === 'cluster_fever' ? 'cluster_fever' :
      r.alertType === 'fever' ? 'individual_fever' :
      'scheduled';

    const actionStatus: ActionStatus =
      r.status === 'new' ? 'pending' :
      r.status === 'acknowledged' ? 'monitoring' :
      'completed';

    return {
      actionId: r.alertId,
      farmId: r.farmId,
      farmName: r.farmName,
      type,
      priority: (r.priority as ActionPriority) ?? 'low',
      title: r.title,
      description: `${r.alertType} 경보 — 현장 확인 필요`,
      status: actionStatus,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return items.sort(
    (a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9),
  );
}
