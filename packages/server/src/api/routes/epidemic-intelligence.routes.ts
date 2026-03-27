// 전염병 지능형 분석 API — 다중 농장 건강 알람 패턴 상관 분석
// GET /api/epidemic-intelligence/intelligence — 역학 지능 데이터
// GET /api/epidemic-intelligence/farm-health-scores — 농장별 건강 점수

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../../lib/logger.js';
import { getDb } from '../../config/database.js';
import { farms, smaxtecEvents } from '../../db/schema.js';
import { eq, count, sql, and, gte, inArray } from 'drizzle-orm';
import type {
  EpidemicRiskLevel,
  TrendDirection,
  HealthGrade,
  Prediction24h,
  EpidemicCluster,
  EpidemicClusterFarm,
  AlarmTypeStat,
  NationalSummary,
  TimelinePoint,
  EscalationInfo,
  EpidemicIntelligenceData,
  FarmHealthScore,
  FarmHealthFactors,
} from '@cowtalk/shared';

export const epidemicIntelligenceRouter = Router();

epidemicIntelligenceRouter.use(authenticate);

// 농장 그룹 farmIds 파싱 미들웨어
import { AsyncLocalStorage } from 'node:async_hooks';
const epidemicFarmIdsStorage = new AsyncLocalStorage<readonly string[]>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

epidemicIntelligenceRouter.use((req: Request, _res: Response, next: NextFunction) => {
  const farmIdsParam = req.query.farmIds as string | undefined;
  const farmId = req.query.farmId as string | undefined;
  let ids: readonly string[] = [];
  if (farmIdsParam) ids = farmIdsParam.split(',').filter((id) => UUID_RE.test(id));
  else if (farmId && farmId.includes(',')) ids = farmId.split(',').filter((id) => UUID_RE.test(id));
  else if (farmId && UUID_RE.test(farmId)) ids = [farmId];
  epidemicFarmIdsStorage.run(ids, () => next());
});

function getEpidemicFarmFilter(): ReturnType<typeof inArray> | undefined {
  const ids = epidemicFarmIdsStorage.getStore();
  if (ids && ids.length > 0) return inArray(farms.farmId, [...ids]);
  return undefined;
}

// ===========================
// 상수
// ===========================

// ─── 역학 감시 대상 알람 타입 ───
// 1차 지표: 체온 상승 (전염성 질병의 최초 생체 신호)
// 2차 지표: 반추 감소 (체온 상승 후 2~4일 뒤 동반 발현 → 질병 진행 확인)
// 근거: smaXtec 연구 — "체온은 모든 파라미터 중 가장 먼저 변화하며,
//        반추 감소는 체온 상승 후 평균 2~4일 뒤 나타남"
// 제외: 활동량, 발정, 분만, 음수, 수정 → 전염성 질병 역학과 무관

/** 역학 감시 1차 지표 — 발열 */
const EPIDEMIC_PRIMARY_TYPE = 'temperature_high' as const;
/** 역학 감시 2차 지표 — 반추 감소 (동반 시 질병 진행 확인) */
const EPIDEMIC_SECONDARY_TYPE = 'rumination_decrease' as const;

// temperature_low는 역학 감시에서 제외 (전염성 질병 지표가 아닌 환경 요인)

const CLUSTER_RADIUS_DEG = 0.5; // ~50km

// ─── 감시 기준: 전체 두수 대비 체온상승 개체 비율 (%) ───
const SURVEILLANCE_THRESHOLDS = {
  /** 관심 대상: 두수의 5% 이상 체온상승 */
  ANOMALY_RATE: 0.05,
  /** 주의 대상: 두수의 10% 이상 체온상승 */
  WARNING_RATE: 0.10,
  /** 경계 대상: 두수의 15% 이상 체온상승 */
  CRITICAL_RATE: 0.15,
} as const;

/**
 * 체온+반추 동반 가중치:
 * 동일 개체에서 temperature_high와 rumination_decrease가 동시 발생 시
 * 해당 개체는 1.5배 가중치로 계산 (질병 진행 확인 신호)
 */
const COMORBIDITY_WEIGHT = 1.5;

const HOURS_48 = 48;
const HOURS_24 = 24;
const HOURS_12 = 12;
const DAYS_7 = 7;

// ===========================
// 유틸
// ===========================

type DbInstance = ReturnType<typeof getDb>;

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function assignGrade(score: number): HealthGrade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function assignPrediction(trend: TrendDirection, score: number): Prediction24h {
  if (score >= 80 && trend !== 'declining') return 'safe';
  if (score >= 60) return 'watch';
  if (score >= 40 || trend === 'declining') return 'alert';
  return 'danger';
}

function clampScore(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value * 100) / 100));
}

// ===========================
// 데이터 조회 함수
// ===========================

interface FarmInfo {
  readonly farmId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly headCount: number;
}

interface HourlyAlarm {
  readonly farmId: string;
  readonly hour: string;
  readonly eventType: string;
  readonly alarmCount: number;
}

async function queryActiveFarms(db: DbInstance): Promise<readonly FarmInfo[]> {
  const rows = await db
    .select({
      farmId: farms.farmId,
      name: farms.name,
      lat: farms.lat,
      lng: farms.lng,
      headCount: farms.currentHeadCount,
    })
    .from(farms)
    .where(and(eq(farms.status, 'active'), getEpidemicFarmFilter()) ?? eq(farms.status, 'active'));

  return rows.map((r) => ({
    farmId: r.farmId,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    headCount: r.headCount,
  }));
}

async function queryHealthAlarms48h(db: DbInstance): Promise<readonly HourlyAlarm[]> {
  const since = hoursAgo(HOURS_48);

  // 체온상승(1차) + 반추감소(2차)만 조회 — 역학 감시 전용
  const rows = await db
    .select({
      farmId: smaxtecEvents.farmId,
      hour: sql<string>`to_char(${smaxtecEvents.detectedAt}, 'YYYY-MM-DD"T"HH24":00:00Z"')`,
      eventType: smaxtecEvents.eventType,
      alarmCount: count(smaxtecEvents.eventId),
    })
    .from(smaxtecEvents)
    .where(
      and(
        gte(smaxtecEvents.detectedAt, since),
        sql`${smaxtecEvents.eventType} IN ('temperature_high','rumination_decrease')`,
        getEpidemicFarmFilter() as ReturnType<typeof gte> | undefined,
      ),
    )
    .groupBy(
      smaxtecEvents.farmId,
      sql`to_char(${smaxtecEvents.detectedAt}, 'YYYY-MM-DD"T"HH24":00:00Z"')`,
      smaxtecEvents.eventType,
    );

  return rows.map((r) => ({
    farmId: r.farmId,
    hour: r.hour,
    eventType: r.eventType,
    alarmCount: Number(r.alarmCount),
  }));
}

// 농장별 이상 개체 수 (고유 동물 기준)
interface FarmAffectedAnimals {
  readonly farmId: string;
  readonly uniqueAnimals: number;
}

async function queryAffectedAnimals48h(db: DbInstance): Promise<readonly FarmAffectedAnimals[]> {
  const since = hoursAgo(HOURS_48);

  // 체온상승 개체만 카운트 (역학 감시 1차 지표)
  const rows = await db
    .select({
      farmId: smaxtecEvents.farmId,
      uniqueAnimals: sql<number>`COUNT(DISTINCT ${smaxtecEvents.animalId})`,
    })
    .from(smaxtecEvents)
    .where(
      and(
        gte(smaxtecEvents.detectedAt, since),
        sql`${smaxtecEvents.eventType} = 'temperature_high'`,
      ),
    )
    .groupBy(smaxtecEvents.farmId);

  return rows.map((r) => ({
    farmId: r.farmId,
    uniqueAnimals: Number(r.uniqueAnimals),
  }));
}

// 체온+반추 동반 발현 개체 수 (가중치 적용용)
interface FarmComorbidAnimals {
  readonly farmId: string;
  readonly comorbidCount: number;
}

async function queryComorbidAnimals48h(db: DbInstance): Promise<readonly FarmComorbidAnimals[]> {
  const sinceStr = hoursAgo(HOURS_48).toISOString();

  // 동일 개체에서 temperature_high AND rumination_decrease 모두 발생한 개체 수
  const rows = await db.execute<{ farm_id: string; comorbid_count: string }>(sql`
    SELECT farm_id, COUNT(*) AS comorbid_count
    FROM (
      SELECT animal_id, farm_id
      FROM smaxtec_events
      WHERE detected_at >= ${sinceStr}::timestamptz
        AND event_type = 'temperature_high'
        AND animal_id IS NOT NULL
      INTERSECT
      SELECT animal_id, farm_id
      FROM smaxtec_events
      WHERE detected_at >= ${sinceStr}::timestamptz
        AND event_type = 'rumination_decrease'
        AND animal_id IS NOT NULL
    ) comorbid
    GROUP BY farm_id
  `);

  return (rows as unknown as { farm_id: string; comorbid_count: string }[]).map((r) => ({
    farmId: r.farm_id,
    comorbidCount: Number(r.comorbid_count),
  }));
}

async function queryAlarms7d(db: DbInstance): Promise<readonly HourlyAlarm[]> {
  const since = daysAgo(DAYS_7);

  const rows = await db
    .select({
      farmId: smaxtecEvents.farmId,
      hour: sql<string>`to_char(${smaxtecEvents.detectedAt}, 'YYYY-MM-DD"T"HH24":00:00Z"')`,
      eventType: smaxtecEvents.eventType,
      alarmCount: count(smaxtecEvents.eventId),
    })
    .from(smaxtecEvents)
    .where(
      and(
        gte(smaxtecEvents.detectedAt, since),
        sql`${smaxtecEvents.eventType} IN ('temperature_high','rumination_decrease')`,
        getEpidemicFarmFilter() as ReturnType<typeof gte> | undefined,
      ),
    )
    .groupBy(
      smaxtecEvents.farmId,
      sql`to_char(${smaxtecEvents.detectedAt}, 'YYYY-MM-DD"T"HH24":00:00Z"')`,
      smaxtecEvents.eventType,
    );

  return rows.map((r) => ({
    farmId: r.farmId,
    hour: r.hour,
    eventType: r.eventType,
    alarmCount: Number(r.alarmCount),
  }));
}

// ===========================
// 분석 함수
// ===========================

interface FarmAlarmStats {
  readonly farmId: string;
  readonly totalAlarms: number;
  readonly tempAlarms: number;        // 체온상승 알람 수
  readonly ruminationAlarms: number;  // 반추감소 알람 수
  readonly comorbidCount: number;     // 체온+반추 동반 개체 수
  readonly healthAlarmRate: number;
  readonly tempAnomalyRate: number;   // 체온상승 개체 비율 (핵심 역학 지표)
  readonly affectedAnimalRate: number;  // 가중치 적용 이상 개체 비율
  readonly hourlyTrend: TrendDirection;
  readonly dominantType: string;
}

function computeFarmAlarmStats(
  farmInfo: FarmInfo,
  alarms: readonly HourlyAlarm[],
  affectedAnimalsMap?: ReadonlyMap<string, number>,
  comorbidAnimalsMap?: ReadonlyMap<string, number>,
): FarmAlarmStats {
  const farmAlarms = alarms.filter((a) => a.farmId === farmInfo.farmId);

  const totalAlarms = farmAlarms.reduce((sum, a) => sum + a.alarmCount, 0);
  const tempAlarms = farmAlarms
    .filter((a) => a.eventType === EPIDEMIC_PRIMARY_TYPE)
    .reduce((sum, a) => sum + a.alarmCount, 0);
  const ruminationAlarms = farmAlarms
    .filter((a) => a.eventType === EPIDEMIC_SECONDARY_TYPE)
    .reduce((sum, a) => sum + a.alarmCount, 0);

  const headCount = Math.max(farmInfo.headCount, 1);

  // 체온상승 고유 개체 수 (역학 감시 핵심 지표)
  const feverAnimals = affectedAnimalsMap?.get(farmInfo.farmId) ?? 0;
  const tempAnomalyRate = feverAnimals / headCount;

  // 체온+반추 동반 개체 수 (질병 진행 확인 → 가중치 적용)
  const comorbidCount = comorbidAnimalsMap?.get(farmInfo.farmId) ?? 0;
  // 가중 이상 개체 비율: 체온만 = 1.0배, 체온+반추 동반 = 1.5배
  const feverOnlyAnimals = Math.max(0, feverAnimals - comorbidCount);
  const weightedAffected = feverOnlyAnimals + (comorbidCount * COMORBIDITY_WEIGHT);
  const affectedAnimalRate = weightedAffected / headCount;

  const healthAlarmRate = totalAlarms / headCount;

  // Hourly trend: compare last 12h vs previous 12h (체온상승만 기준)
  const now = Date.now();
  const tempFarmAlarms = farmAlarms.filter((a) => a.eventType === EPIDEMIC_PRIMARY_TYPE);
  const recent12hAlarms = tempFarmAlarms
    .filter((a) => new Date(a.hour).getTime() > now - HOURS_12 * 60 * 60 * 1000)
    .reduce((sum, a) => sum + a.alarmCount, 0);
  const prev12hAlarms = tempFarmAlarms
    .filter((a) => {
      const t = new Date(a.hour).getTime();
      return t > now - HOURS_24 * 60 * 60 * 1000 && t <= now - HOURS_12 * 60 * 60 * 1000;
    })
    .reduce((sum, a) => sum + a.alarmCount, 0);

  const hourlyTrend: TrendDirection =
    recent12hAlarms > prev12hAlarms * 1.2
      ? 'rising'
      : recent12hAlarms < prev12hAlarms * 0.8
        ? 'declining'
        : 'stable';

  // 역학 감시의 dominantType은 항상 체온 또는 반추
  const dominantType = tempAlarms >= ruminationAlarms
    ? EPIDEMIC_PRIMARY_TYPE
    : EPIDEMIC_SECONDARY_TYPE;

  return {
    farmId: farmInfo.farmId,
    totalAlarms,
    tempAlarms,
    ruminationAlarms,
    comorbidCount,
    healthAlarmRate,
    tempAnomalyRate,
    affectedAnimalRate,
    hourlyTrend,
    dominantType,
  };
}

interface ClusterCandidate {
  readonly center: { readonly lat: number; readonly lng: number };
  readonly farms: readonly FarmInfo[];
  readonly stats: readonly FarmAlarmStats[];
}

function buildRegionalClusters(
  allFarms: readonly FarmInfo[],
  allStats: readonly FarmAlarmStats[],
): readonly ClusterCandidate[] {
  const statMap = new Map(allStats.map((s) => [s.farmId, s]));
  const assigned = new Set<string>();
  const clusters: ClusterCandidate[] = [];

  // Group farms by proximity (lat/lng within CLUSTER_RADIUS_DEG)
  for (const anchor of allFarms) {
    if (assigned.has(anchor.farmId)) continue;

    const nearby = allFarms.filter((f) => {
      if (assigned.has(f.farmId)) return false;
      const dLat = Math.abs(f.lat - anchor.lat);
      const dLng = Math.abs(f.lng - anchor.lng);
      return dLat <= CLUSTER_RADIUS_DEG && dLng <= CLUSTER_RADIUS_DEG;
    });

    if (nearby.length < 2) continue;

    // Check if any farms in cluster have anomalies
    const clusterStats = nearby
      .map((f) => statMap.get(f.farmId))
      .filter((s): s is FarmAlarmStats => s !== undefined && s.healthAlarmRate > 0);

    if (clusterStats.length === 0) continue;

    const centerLat = nearby.reduce((s, f) => s + f.lat, 0) / nearby.length;
    const centerLng = nearby.reduce((s, f) => s + f.lng, 0) / nearby.length;

    for (const f of nearby) {
      assigned.add(f.farmId);
    }

    clusters.push({
      center: { lat: centerLat, lng: centerLng },
      farms: nearby,
      stats: clusterStats,
    });
  }

  return clusters;
}

function determineClusterRisk(stats: readonly FarmAlarmStats[]): EpidemicRiskLevel {
  // 이상 개체 비율 기준 (두수 대비 %)
  const anomalousFarms = stats.filter((s) => s.affectedAnimalRate >= SURVEILLANCE_THRESHOLDS.ANOMALY_RATE);
  const warningFarms = stats.filter((s) => s.affectedAnimalRate >= SURVEILLANCE_THRESHOLDS.WARNING_RATE);
  const criticalFarms = stats.filter((s) => s.affectedAnimalRate >= SURVEILLANCE_THRESHOLDS.CRITICAL_RATE);
  const doublingFarms = stats.filter((s) => s.hourlyTrend === 'rising' && s.affectedAnimalRate >= SURVEILLANCE_THRESHOLDS.WARNING_RATE);

  if (criticalFarms.length >= 3 || doublingFarms.length >= 2) return 'critical';
  if (warningFarms.length >= 3 || (anomalousFarms.length >= 3 && warningFarms.length >= 1)) return 'high';
  if (anomalousFarms.length >= 2) return 'moderate';
  return 'low';
}

function computeRiskScore(clusters: readonly EpidemicCluster[]): number {
  if (clusters.length === 0) return 0;

  const levelScores: Record<EpidemicRiskLevel, number> = {
    critical: 90,
    high: 70,
    moderate: 45,
    low: 15,
  };

  const maxClusterScore = Math.max(
    ...clusters.map((c) => levelScores[c.riskLevel]),
  );

  const clusterCountBonus = Math.min(10, clusters.length * 2);
  return Math.min(100, maxClusterScore + clusterCountBonus);
}

function buildRecommendation(riskLevel: EpidemicRiskLevel, hasComorbid: boolean): string {
  const comorbidNote = hasComorbid
    ? ' 체온상승+반추감소 동반 개체 확인 — 질병 진행 가능성 높음.'
    : '';

  switch (riskLevel) {
    case 'critical':
      return `긴급: 다수 농장에서 발열 개체 15%+ 동시 발생. 즉시 방역 조치 및 수의사 파견 필요.${comorbidNote}`;
    case 'high':
      return `주의: 발열 개체 비율이 인접 농장 간 확산 패턴. 격리 조치 및 모니터링 강화 권고.${comorbidNote}`;
    case 'moderate':
      return `관찰: 발열 개체 5%+ 농장 증가 추세. 해당 지역 농장 추가 점검 권고.${comorbidNote}`;
    default:
      return `정상 범위. 발열 개체 간헐적 발생. 정기 모니터링 유지.`;
  }
}

function buildTimeline(alarms: readonly HourlyAlarm[], allFarms: readonly FarmInfo[]): readonly TimelinePoint[] {
  const hourMap = new Map<string, { alarmCount: number; farmIds: Set<string> }>();

  for (const a of alarms) {
    const existing = hourMap.get(a.hour);
    if (existing) {
      existing.alarmCount += a.alarmCount;
      existing.farmIds.add(a.farmId);
    } else {
      hourMap.set(a.hour, { alarmCount: a.alarmCount, farmIds: new Set([a.farmId]) });
    }
  }

  const totalFarms = Math.max(allFarms.length, 1);

  return [...hourMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, data]) => ({
      hour,
      alarmCount: data.alarmCount,
      farmCount: data.farmIds.size,
      riskScore: Math.min(100, Math.round((data.farmIds.size / totalFarms) * 100 * 3)),
    }));
}

function determineEscalation(
  _overallRisk: EpidemicRiskLevel,
  clusters: readonly EpidemicCluster[],
): EscalationInfo {
  const criticalClusters = clusters.filter((c) => c.riskLevel === 'critical');
  const highClusters = clusters.filter((c) => c.riskLevel === 'high' || c.riskLevel === 'critical');

  if (criticalClusters.length >= 2) {
    return {
      level: 'national',
      reason: `${criticalClusters.length}개 지역에서 동시 긴급 경보 발생`,
      suggestedActions: [
        '국가 방역 본부 즉시 보고',
        '해당 지역 전체 이동제한 검토',
        '긴급 역학조사팀 파견',
        '전국 농장 일제 점검 시행',
      ],
    };
  }

  if (highClusters.length >= 1) {
    return {
      level: 'regional',
      reason: `${highClusters.length}개 클러스터에서 높은 위험도 감지`,
      suggestedActions: [
        '해당 지역 방역 강화',
        '인접 농장 예방적 모니터링',
        '수의사 긴급 점검 요청',
        '이동 이력 추적 조사',
      ],
    };
  }

  return {
    level: 'farm',
    reason: '개별 농장 수준의 이상 징후',
    suggestedActions: [
      '해당 농장 자체 점검 실시',
      '이상 개체 격리 관찰',
      '센서 데이터 추이 모니터링',
    ],
  };
}

// ===========================
// GET /intelligence
// ===========================

epidemicIntelligenceRouter.get('/intelligence', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const [allFarms, alarms48h, affectedAnimals, comorbidAnimals] = await Promise.all([
      queryActiveFarms(db),
      queryHealthAlarms48h(db),
      queryAffectedAnimals48h(db),
      queryComorbidAnimals48h(db),
    ]);

    // 농장별 체온상승 개체 수 맵
    const affectedAnimalsMap = new Map(affectedAnimals.map((a) => [a.farmId, a.uniqueAnimals]));
    // 농장별 체온+반추 동반 개체 수 맵
    const comorbidAnimalsMap = new Map(comorbidAnimals.map((a) => [a.farmId, a.comorbidCount]));

    // Per-farm stats (체온 중심 역학 지표)
    const farmStats = allFarms.map((f) => computeFarmAlarmStats(f, alarms48h, affectedAnimalsMap, comorbidAnimalsMap));

    // Regional clustering
    const clusterCandidates = buildRegionalClusters(allFarms, farmStats);

    let clusterIndex = 0;
    const clusters: readonly EpidemicCluster[] = clusterCandidates.map((cc) => {
      clusterIndex += 1;
      const riskLevel = determineClusterRisk(cc.stats);

      const anomalousFarms = cc.stats.filter((s) => s.affectedAnimalRate >= SURVEILLANCE_THRESHOLDS.ANOMALY_RATE);

      // 역학 감시에서 dominantAlarmType은 항상 체온상승 (1차 지표)
      const dominantAlarmType = EPIDEMIC_PRIMARY_TYPE;
      const hasComorbid = cc.stats.some((s) => s.comorbidCount > 0);

      // Trend: majority of anomalous farms
      const risingCount = anomalousFarms.filter((s) => s.hourlyTrend === 'rising').length;
      const decliningCount = anomalousFarms.filter((s) => s.hourlyTrend === 'declining').length;
      const trend: TrendDirection =
        risingCount > decliningCount ? 'rising' : decliningCount > risingCount ? 'declining' : 'stable';

      // First detected: earliest alarm hour in this cluster's farms
      const clusterFarmIds = new Set(cc.farms.map((f) => f.farmId));
      const clusterAlarms = alarms48h.filter((a) => clusterFarmIds.has(a.farmId));
      const earliest = clusterAlarms
        .map((a) => a.hour)
        .sort()
        .at(0) ?? new Date().toISOString();

      // Spread velocity: anomalous farms / days since first detection
      const hoursSinceFirst = Math.max(1, (Date.now() - new Date(earliest).getTime()) / (60 * 60 * 1000));
      const spreadVelocity = Math.round((anomalousFarms.length / (hoursSinceFirst / 24)) * 10) / 10;

      const affectedFarms: readonly EpidemicClusterFarm[] = cc.farms.map((f) => {
        const stat = cc.stats.find((s) => s.farmId === f.farmId);
        return {
          farmId: f.farmId,
          name: f.name,
          lat: f.lat,
          lng: f.lng,
          healthAlarmRate: stat?.healthAlarmRate ?? 0,
          tempAnomalyRate: stat?.tempAnomalyRate ?? 0,
          headCount: f.headCount,
          alarmCount: stat?.tempAlarms ?? 0,
          feverCount: stat?.tempAlarms ?? 0,
          comorbidCount: stat?.comorbidCount ?? 0,
        };
      });

      return {
        clusterId: `cluster-${clusterIndex}`,
        center: cc.center,
        radius: CLUSTER_RADIUS_DEG * 111, // approx km
        riskLevel,
        affectedFarms,
        dominantAlarmType,
        trend,
        firstDetected: earliest,
        estimatedSpreadVelocity: spreadVelocity,
        recommendation: buildRecommendation(riskLevel, hasComorbid),
      };
    });

    // Overall risk
    const riskScore = computeRiskScore(clusters);
    const overallRiskLevel: EpidemicRiskLevel =
      riskScore >= 80 ? 'critical' : riskScore >= 55 ? 'high' : riskScore >= 30 ? 'moderate' : 'low';

    // National summary (체온상승 기준)
    const farmsWithAnomalies = farmStats.filter((s) => s.tempAnomalyRate >= SURVEILLANCE_THRESHOLDS.ANOMALY_RATE).length;

    // 체온상승 / 반추감소 각각 집계
    const feverAlarms48h = alarms48h
      .filter((a) => a.eventType === EPIDEMIC_PRIMARY_TYPE)
      .reduce((sum, a) => sum + a.alarmCount, 0);
    const ruminationAlarms48h = alarms48h
      .filter((a) => a.eventType === EPIDEMIC_SECONDARY_TYPE)
      .reduce((sum, a) => sum + a.alarmCount, 0);
    const totalComorbid = comorbidAnimals.reduce((sum, a) => sum + a.comorbidCount, 0);

    const topAlarmTypes: readonly AlarmTypeStat[] = [
      { type: 'temperature_high', count: feverAlarms48h },
      { type: 'rumination_decrease', count: ruminationAlarms48h },
      { type: '체온+반추 동반', count: totalComorbid },
    ].filter((t) => t.count > 0);

    // 24h trend (체온상승 알람만)
    const now = Date.now();
    const feverAlarms = alarms48h.filter((a) => a.eventType === EPIDEMIC_PRIMARY_TYPE);
    const last24hAlarms = feverAlarms
      .filter((a) => new Date(a.hour).getTime() > now - HOURS_24 * 60 * 60 * 1000)
      .reduce((s, a) => s + a.alarmCount, 0);
    const prev24hAlarms = feverAlarms
      .filter((a) => new Date(a.hour).getTime() <= now - HOURS_24 * 60 * 60 * 1000)
      .reduce((s, a) => s + a.alarmCount, 0);
    const last24hTrend: TrendDirection =
      last24hAlarms > prev24hAlarms * 1.2 ? 'rising' : last24hAlarms < prev24hAlarms * 0.8 ? 'declining' : 'stable';

    const nationalSummary: NationalSummary = {
      totalFarmsMonitored: allFarms.length,
      farmsWithAnomalies,
      anomalyRate: allFarms.length > 0 ? Math.round((farmsWithAnomalies / allFarms.length) * 10000) / 100 : 0,
      topAlarmTypes,
      last24hTrend,
    };

    const timeline = buildTimeline(alarms48h, allFarms);
    const escalation = determineEscalation(overallRiskLevel, clusters);

    const data: EpidemicIntelligenceData = {
      overallRiskLevel,
      riskScore,
      clusters,
      nationalSummary,
      timeline,
      escalation,
    };

    res.json({ success: true, data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error, message: msg }, 'Epidemic intelligence query failed');
    // DB 미연결 등 초기 상태면 빈 데이터 반환 (500 방지)
    if (msg.includes('connect') || msg.includes('relation') || msg.includes('does not exist') || msg.includes('ECONNREFUSED')) {
      res.json({
        success: true,
        data: {
          overallRiskLevel: 'low' as EpidemicRiskLevel,
          riskScore: 0,
          clusters: [],
          nationalSummary: {
            totalFarmsMonitored: 0,
            farmsWithAnomalies: 0,
            anomalyRate: 0,
            topAlarmTypes: [],
            last24hTrend: 'stable' as TrendDirection,
          },
          timeline: [],
          escalation: {
            level: 'farm',
            reason: '데이터 조회 중 오류 발생',
            suggestedActions: ['시스템 연결 상태를 확인하세요'],
          },
        } satisfies EpidemicIntelligenceData,
      });
      return;
    }
    next(error);
  }
});

// ===========================
// GET /farm-health-scores
// ===========================

epidemicIntelligenceRouter.get('/farm-health-scores', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const [allFarms, alarms48h, alarms7d, affectedAnimals, comorbidAnimals] = await Promise.all([
      queryActiveFarms(db),
      queryHealthAlarms48h(db),
      queryAlarms7d(db),
      queryAffectedAnimals48h(db),
      queryComorbidAnimals48h(db),
    ]);

    const affectedAnimalsMap = new Map(affectedAnimals.map((a) => [a.farmId, a.uniqueAnimals]));
    const comorbidAnimalsMap = new Map(comorbidAnimals.map((a) => [a.farmId, a.comorbidCount]));
    const farmStats48h = allFarms.map((f) => computeFarmAlarmStats(f, alarms48h, affectedAnimalsMap, comorbidAnimalsMap));
    const farmStats7d = allFarms.map((f) => computeFarmAlarmStats(f, alarms7d));

    // Build clusters for epidemiological factor
    const clusterCandidates = buildRegionalClusters(allFarms, farmStats48h);
    const clusterRiskByFarm = new Map<string, EpidemicRiskLevel>();

    for (const cc of clusterCandidates) {
      const risk = determineClusterRisk(cc.stats);
      for (const f of cc.farms) {
        const existing = clusterRiskByFarm.get(f.farmId);
        if (!existing || riskOrder(risk) > riskOrder(existing)) {
          clusterRiskByFarm.set(f.farmId, risk);
        }
      }
    }

    const scores: FarmHealthScore[] = allFarms.map((farm) => {
      const stat48h = farmStats48h.find((s) => s.farmId === farm.farmId);
      const stat7d = farmStats7d.find((s) => s.farmId === farm.farmId);
      const clusterRisk = clusterRiskByFarm.get(farm.farmId) ?? 'low';

      const headCount = Math.max(farm.headCount, 1);

      // Temperature factor (0-30)
      const tempRate = (stat48h?.tempAlarms ?? 0) / headCount;
      const tempScore = clampScore(30 * (1 - Math.min(tempRate / 0.15, 1)), 30);

      // Rumination factor (0-25)
      const ruminationRate = (stat48h?.ruminationAlarms ?? 0) / headCount;
      const ruminationScore = clampScore(25 * (1 - Math.min(ruminationRate / 0.15, 1)), 25);

      // Comorbidity factor (0-20): 체온+반추 동반 개체 비율
      const comorbidRate = (stat48h?.comorbidCount ?? 0) / headCount;
      const activityScore = clampScore(20 * (1 - Math.min(comorbidRate / 0.10, 1)), 20);

      // Historical factor (0-15): 7-day trend
      const recent3dAlarms = alarms48h
        .filter((a) => a.farmId === farm.farmId)
        .reduce((s, a) => s + a.alarmCount, 0);
      const total7dAlarms = (stat7d?.totalAlarms ?? 0);
      const older4dAlarms = Math.max(0, total7dAlarms - recent3dAlarms);

      let historicalTrend: 'improving' | 'stable' | 'declining' = 'stable';
      if (total7dAlarms > 0) {
        // Normalize to per-day: recent ~2 days vs older ~5 days
        const recentPerDay = recent3dAlarms / 2;
        const olderPerDay = older4dAlarms / 5;
        if (recentPerDay < olderPerDay * 0.8) historicalTrend = 'improving';
        else if (recentPerDay > olderPerDay * 1.2) historicalTrend = 'declining';
      }

      const historicalScore = clampScore(
        historicalTrend === 'improving' ? 15 : historicalTrend === 'stable' ? 10 : 3,
        15,
      );

      // Epidemiological factor (0-10)
      const epiScoreMap: Record<EpidemicRiskLevel, number> = {
        low: 10,
        moderate: 6,
        high: 3,
        critical: 0,
      };
      const epiScore = clampScore(epiScoreMap[clusterRisk], 10);

      const healthScore = Math.round(tempScore + ruminationScore + activityScore + historicalScore + epiScore);

      // Overall trend from 48h alarm stats (inverted: alarm rising = health declining)
      const trend: TrendDirection = stat48h?.hourlyTrend === 'rising'
        ? 'declining'
        : stat48h?.hourlyTrend === 'declining'
          ? 'rising'
          : 'stable';

      const factors: FarmHealthFactors = {
        temperature: { score: tempScore, max: 30, alarmRate: Math.round(tempRate * 10000) / 100 },
        rumination: { score: ruminationScore, max: 25, alarmRate: Math.round(ruminationRate * 10000) / 100 },
        activity: { score: activityScore, max: 20, alarmRate: Math.round(comorbidRate * 10000) / 100 },
        historical: { score: historicalScore, max: 15, trend: historicalTrend },
        epidemiological: { score: epiScore, max: 10, clusterRisk },
      };

      return {
        farmId: farm.farmId,
        name: farm.name,
        lat: farm.lat,
        lng: farm.lng,
        headCount: farm.headCount,
        healthScore,
        grade: assignGrade(healthScore),
        factors,
        trend,
        prediction24h: assignPrediction(trend, healthScore),
      };
    });

    // Sort by score ascending (worst first)
    const sorted = [...scores].sort((a, b) => a.healthScore - b.healthScore);

    res.json({ success: true, data: sorted });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error, message: msg }, 'Farm health scores query failed');
    if (msg.includes('connect') || msg.includes('relation') || msg.includes('does not exist') || msg.includes('ECONNREFUSED')) {
      res.json({ success: true, data: [] });
      return;
    }
    next(error);
  }
});

// ===========================
// 헬퍼
// ===========================

function riskOrder(level: EpidemicRiskLevel): number {
  const order: Record<EpidemicRiskLevel, number> = { low: 0, moderate: 1, high: 2, critical: 3 };
  return order[level];
}

// ===========================
// GET /drilldown/:farmId — 농장별 발열 개체 드릴다운
// ===========================

epidemicIntelligenceRouter.get('/drilldown/:farmId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;
    const sinceStr = hoursAgo(HOURS_48).toISOString();

    // 해당 농장의 체온상승 + 반추감소 이벤트가 있는 개체 조회
    // DISTINCT ON으로 동일 개체+이벤트타입+시간 중복 제거 (DB 적재 중복 방지)
    const rows = await db.execute<{
      animal_id: string | null;
      ear_tag: string | null;
      animal_name: string | null;
      event_type: string;
      detected_at: Date | null;
      severity: string | null;
    }>(sql`
      SELECT DISTINCT ON (e.animal_id, e.event_type, e.detected_at)
        e.animal_id,
        a.ear_tag,
        a.name AS animal_name,
        e.event_type,
        e.detected_at,
        e.severity
      FROM smaxtec_events e
      LEFT JOIN animals a ON e.animal_id = a.animal_id
      WHERE e.farm_id = ${farmId}
        AND e.detected_at >= ${sinceStr}::timestamptz
        AND e.event_type IN ('temperature_high', 'rumination_decrease')
      ORDER BY e.animal_id, e.event_type, e.detected_at DESC
    `) as unknown as {
      animal_id: string | null;
      ear_tag: string | null;
      animal_name: string | null;
      event_type: string;
      detected_at: Date | null;
      severity: string | null;
    }[];

    // 개체별로 그룹핑 (발열 여부, 반추감소 동반 여부)
    const animalMap = new Map<string, {
      animalId: string;
      earTag: string;
      animalName: string;
      hasFever: boolean;
      hasRuminationDrop: boolean;
      latestDetectedAt: string;
      severity: string;
      eventCount: number;
    }>();

    for (const row of rows) {
      const id = row.animal_id ?? 'unknown';
      const existing = animalMap.get(id);

      if (!existing) {
        animalMap.set(id, {
          animalId: id,
          earTag: row.ear_tag ?? '미등록',
          animalName: row.animal_name ?? '',
          hasFever: row.event_type === EPIDEMIC_PRIMARY_TYPE,
          hasRuminationDrop: row.event_type === EPIDEMIC_SECONDARY_TYPE,
          latestDetectedAt: row.detected_at instanceof Date ? row.detected_at.toISOString() : String(row.detected_at ?? ''),
          severity: row.severity ?? 'warning',
          eventCount: 1,
        });
      } else {
        if (row.event_type === EPIDEMIC_PRIMARY_TYPE) existing.hasFever = true;
        if (row.event_type === EPIDEMIC_SECONDARY_TYPE) existing.hasRuminationDrop = true;
        existing.eventCount += 1;
      }
    }

    // 정렬: 동반 발현 > 발열만 > 반추만, 이벤트 수 내림차순
    const animalList = [...animalMap.values()].sort((a, b) => {
      const aScore = (a.hasFever && a.hasRuminationDrop ? 3 : a.hasFever ? 2 : 1);
      const bScore = (b.hasFever && b.hasRuminationDrop ? 3 : b.hasFever ? 2 : 1);
      if (bScore !== aScore) return bScore - aScore;
      return b.eventCount - a.eventCount;
    });

    // 농장 정보
    const farmRows = await db
      .select({ name: farms.name, headCount: farms.currentHeadCount })
      .from(farms)
      .where(eq(farms.farmId, farmId))
      .limit(1);

    const farmName = farmRows[0]?.name ?? '알 수 없음';
    const headCount = farmRows[0]?.headCount ?? 0;
    const feverCount = animalList.filter((a) => a.hasFever).length;
    const comorbidCount = animalList.filter((a) => a.hasFever && a.hasRuminationDrop).length;

    res.json({
      success: true,
      data: {
        farmId,
        farmName,
        headCount,
        feverCount,
        comorbidCount,
        feverRate: headCount > 0 ? Math.round((feverCount / headCount) * 10000) / 100 : 0,
        animals: animalList,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Epidemic drilldown query failed');
    next(error);
  }
});
