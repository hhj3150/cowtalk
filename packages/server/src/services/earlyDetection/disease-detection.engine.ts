// DSI (Disease Suspicion Index) 0-100 종합 스코어
// 체온 40점 + 반추 25점 + 활동 20점 + 복합보너스 15점
// DSI >= 70 → 역학 경보 트리거

import { getDb } from '../../config/database.js';
import { sensorDailyAgg, sensorMeasurements } from '../../db/schema.js';
import { eq, gte, and, desc } from 'drizzle-orm';
import { evaluate as evaluateTemp } from './temperature-profile.service.js';
import { logger } from '../../lib/logger.js';
import { ALERT_THRESHOLDS } from '@cowtalk/shared';

// ===========================
// 타입
// ===========================

export interface DSIResult {
  readonly animalId: string;
  readonly dsi: number;              // 0-100
  readonly grade: 'normal' | 'watch' | 'warning' | 'danger';
  readonly tempScore: number;        // 0-40
  readonly ruminationScore: number;  // 0-25
  readonly activityScore: number;    // 0-20
  readonly bonusScore: number;       // 0-15
  readonly tempLevel: number | null;
  readonly triggerEpidemicAlert: boolean;  // DSI >= 70
  readonly computedAt: string;
}

// ===========================
// DSI 등급
// ===========================

function getDsiGrade(dsi: number): DSIResult['grade'] {
  if (dsi >= 70) return 'danger';
  if (dsi >= 50) return 'warning';
  if (dsi >= 30) return 'watch';
  return 'normal';
}

// ===========================
// 최근 센서 데이터 조회
// ===========================

interface RecentSensorData {
  readonly tempCurrent: number | null;
  readonly tempRecent2h: readonly number[];
  readonly ruminationDeltaPct: number | null;   // vs 7일 평균
  readonly activityDeltaPct: number | null;      // vs 7일 평균
}

async function fetchRecentSensorData(animalId: string): Promise<RecentSensorData> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 최근 2시간 체온 측정값
  const recentTempRows = await getDb().select({ value: sensorMeasurements.value, ts: sensorMeasurements.timestamp })
    .from(sensorMeasurements)
    .where(and(
      eq(sensorMeasurements.animalId, animalId),
      eq(sensorMeasurements.metricType, 'temperature'),
      gte(sensorMeasurements.timestamp, twoHoursAgo),
    ))
    .orderBy(sensorMeasurements.timestamp)
    .limit(20);

  const tempRecent2h = recentTempRows.map((r) => r.value);
  const tempCurrent: number | null = tempRecent2h.length > 0 ? (tempRecent2h[tempRecent2h.length - 1] ?? null) : null;

  // 7일 반추/활동 평균 (daily_agg)
  const dailyRows = await getDb().select({
    metricType: sensorDailyAgg.metricType,
    avg: sensorDailyAgg.avg,
  })
    .from(sensorDailyAgg)
    .where(and(
      eq(sensorDailyAgg.animalId, animalId),
      gte(sensorDailyAgg.date, sevenDaysAgo.toISOString().slice(0, 10)),
    ));

  // 오늘 최신 값
  const todayRows = await getDb().select({ value: sensorMeasurements.value, metricType: sensorMeasurements.metricType })
    .from(sensorMeasurements)
    .where(and(
      eq(sensorMeasurements.animalId, animalId),
      gte(sensorMeasurements.timestamp, new Date(Date.now() - 24 * 60 * 60 * 1000)),
    ))
    .orderBy(desc(sensorMeasurements.timestamp))
    .limit(50);

  const latestByMetric = new Map<string, number>();
  for (const row of todayRows) {
    if (!latestByMetric.has(row.metricType)) {
      latestByMetric.set(row.metricType, row.value);
    }
  }

  // 7일 평균 집계
  const avgByMetric = new Map<string, { sum: number; count: number }>();
  for (const row of dailyRows) {
    const existing = avgByMetric.get(row.metricType) ?? { sum: 0, count: 0 };
    avgByMetric.set(row.metricType, { sum: existing.sum + row.avg, count: existing.count + 1 });
  }

  const calcDelta = (metric: string): number | null => {
    const latest = latestByMetric.get(metric);
    const agg = avgByMetric.get(metric);
    if (latest == null || !agg || agg.count === 0 || agg.sum === 0) return null;
    const avg = agg.sum / agg.count;
    if (avg === 0) return null;
    return ((latest - avg) / avg) * 100;
  };

  return {
    tempCurrent,
    tempRecent2h,
    ruminationDeltaPct: calcDelta('rumination'),
    activityDeltaPct: calcDelta('activity'),
  };
}

// ===========================
// 체온 점수 (0-40)
// ===========================

async function calcTempScore(
  animalId: string,
  sensorData: RecentSensorData,
): Promise<{ score: number; level: number | null }> {
  if (sensorData.tempCurrent == null) return { score: 0, level: null };

  try {
    const result = await evaluateTemp(animalId, sensorData.tempCurrent, sensorData.tempRecent2h);
    let score = 0;
    const level = result.level;

    if (level === 3) score = 40;
    else if (level === 2) score = 28;
    else if (level === 1) score = 15;
    else {
      // 기저선 대비 델타 비례 점수 (0-10)
      const delta = Math.max(result.delta, 0);
      score = Math.min(delta * 10, 10);
    }

    // 급상승 보너스
    if (result.rapidRise) score = Math.min(score + 5, 40);

    return { score: Math.round(score), level };
  } catch (err) {
    logger.warn({ err, animalId }, '[DSI] temp score failed');
    // 폴백: 절대값 기반
    const t = sensorData.tempCurrent;
    let score = 0;
    let level: number | null = null;
    if (t >= 40.0) { score = 40; level = 3; }
    else if (t >= 39.5) { score = 28; level = 2; }
    else if (t >= ALERT_THRESHOLDS.temperature.high) { score = 15; level = 1; }
    return { score, level };
  }
}

// ===========================
// 반추 점수 (0-25)
// ===========================

function calcRuminationScore(deltaPct: number | null): number {
  if (deltaPct == null) return 0;
  // 감소가 클수록 점수 높음
  if (deltaPct <= -50) return 25;
  if (deltaPct <= -40) return 20;
  if (deltaPct <= -30) return 15;
  if (deltaPct <= -20) return 8;
  if (deltaPct <= -10) return 3;
  return 0;
}

// ===========================
// 활동 점수 (0-20)
// ===========================

function calcActivityScore(deltaPct: number | null): number {
  if (deltaPct == null) return 0;
  // 감소(질병 시) 또는 급증(발정 아닌 비정상) 모두 점수
  const absDelta = Math.abs(deltaPct);
  if (absDelta >= 50) return 20;
  if (absDelta >= 35) return 15;
  if (absDelta >= 20) return 8;
  if (absDelta >= 10) return 3;
  return 0;
}

// ===========================
// 복합 보너스 (0-15)
// ===========================

function calcBonusScore(
  tempScore: number,
  ruminationScore: number,
  activityScore: number,
  ruminationDeltaPct: number | null,
  activityDeltaPct: number | null,
): number {
  // 체온 + 반추 동시 이상 → 강한 질병 신호
  const tempAbnormal = tempScore >= 15;
  const ruminationAbnormal = ruminationScore >= 8;
  const activityAbnormal = activityScore >= 8;

  let bonus = 0;
  if (tempAbnormal && ruminationAbnormal) bonus += 10;
  if (tempAbnormal && activityAbnormal) bonus += 5;
  if (ruminationDeltaPct != null && activityDeltaPct != null &&
    ruminationDeltaPct < -20 && activityDeltaPct < -20) bonus += 5;

  return Math.min(bonus, 15);
}

// ===========================
// 메인: calculateDSI
// ===========================

export async function calculateDSI(animalId: string): Promise<DSIResult> {
  const sensorData = await fetchRecentSensorData(animalId);

  const [{ score: tempScore, level: tempLevel }] = await Promise.all([
    calcTempScore(animalId, sensorData),
  ]);

  const ruminationScore = calcRuminationScore(sensorData.ruminationDeltaPct);
  const activityScore = calcActivityScore(sensorData.activityDeltaPct);
  const bonusScore = calcBonusScore(tempScore, ruminationScore, activityScore, sensorData.ruminationDeltaPct, sensorData.activityDeltaPct);

  const dsi = Math.min(tempScore + ruminationScore + activityScore + bonusScore, 100);

  return {
    animalId,
    dsi,
    grade: getDsiGrade(dsi),
    tempScore,
    ruminationScore,
    activityScore,
    bonusScore,
    tempLevel,
    triggerEpidemicAlert: dsi >= 70,
    computedAt: new Date().toISOString(),
  };
}
