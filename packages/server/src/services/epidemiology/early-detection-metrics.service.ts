// 조기감지 성과 지표 서비스
// 평균 조기감지 시간, 예방 두수, 경제 절감 효과 계산
// 데모: 실제 경보 이력 기반 집계 + 현실적 추정값

import { getDb } from '../../config/database.js';
import { alerts, farms, sovereignAlarmLabels } from '../../db/schema.js';
import { gte, eq, sql, count } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

// ===========================
// 타입
// ===========================

export interface EarlyDetectionMetrics {
  readonly monthlyStats: MonthlyStats;
  readonly yearlyStats: YearlyStats;
  readonly recentCases: readonly DetectionCase[];
  readonly comparisonScenario: ComparisonScenario;
  readonly computedAt: string;
}

export interface MonthlyStats {
  readonly month: string;                         // YYYY-MM
  readonly totalDetections: number;               // 이번 달 조기감지 건수
  readonly avgLeadTimeHours: number;              // 평균 조기감지 시간(시간)
  readonly preventedAnimals: number;              // 예방 살처분 두수
  readonly economicSavingsKrw: number;            // 절감 경제효과 (원)
  readonly falsePositiveRate: number | null;      // 오탐률 0-1 (레이블 표본 부족 시 null)
  readonly truePositiveRate: number | null;       // 정탐률 0-1 (레이블 표본 부족 시 null)
}

export interface YearlyStats {
  readonly year: number;
  readonly totalDetections: number;
  readonly totalPreventedAnimals: number;
  readonly totalEconomicSavingsKrw: number;
  readonly avgLeadTimeHours: number;
  readonly monthlyTrend: readonly { month: string; detections: number; savingsKrw: number }[];
}

export interface DetectionCase {
  readonly alertId: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly detectedAt: string;           // CowTalk 감지 시각
  readonly reportedAt: string | null;    // 농장주 신고 시각 (없으면 없음)
  readonly leadTimeHours: number | null; // 감지 선행 시간
  readonly outcome: 'true_positive' | 'false_positive' | 'pending';
  readonly diseaseName: string | null;
  readonly preventedAnimals: number;
}

export interface ComparisonScenario {
  readonly withCowTalk: {
    readonly avgResponseHours: number;
    readonly estimatedSpreadAnimals: number;
  };
  readonly withoutCowTalk: {
    readonly avgResponseHours: number;
    readonly estimatedSpreadAnimals: number;
  };
  readonly savedAnimals: number;
  readonly savedEconomicKrw: number;
}

// ===========================
// 상수
// ===========================

// 두당 평균 경제 가치 (홀스타인 성우 기준)
const AVG_ANIMAL_VALUE_KRW = 3_000_000;

// 조기감지 없을 때 평균 신고까지 소요 시간 (선행 연구 기반)
const BASELINE_REPORT_HOURS = 36;

// CowTalk 평균 감지 시간 (센서 이상감지 → 경보)
const COWTALK_DETECT_HOURS = 2;

// 시간당 전파 추정 두수 (FMD 기준)
const SPREAD_PER_HOUR = 0.5;

// ===========================
// 실제 경보 통계 집계
// ===========================

async function fetchAlertStats(sinceDate: Date): Promise<{
  total: number;
  criticalCount: number;
  farms: readonly string[];
}> {
  const db = getDb();

  const rows = await db
    .select({
      cnt: count(alerts.alertId),
      critical: sql<number>`count(*) filter (where ${alerts.priority} = 'critical')`,
    })
    .from(alerts)
    .where(gte(alerts.createdAt, sinceDate));

  const farmRows = await db
    .select({ farmId: alerts.farmId })
    .from(alerts)
    .where(gte(alerts.createdAt, sinceDate))
    .groupBy(alerts.farmId);

  return {
    total: Number(rows[0]?.cnt ?? 0),
    criticalCount: Number(rows[0]?.critical ?? 0),
    farms: farmRows.map((r) => r.farmId),
  };
}

// ===========================
// 최근 감지 사례 목록
// ===========================

async function fetchRecentCases(): Promise<readonly DetectionCase[]> {
  const db = getDb();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      alertId: alerts.alertId,
      farmId: alerts.farmId,
      farmName: farms.name,
      alertType: alerts.alertType,
      priority: alerts.priority,
      createdAt: alerts.createdAt,
      status: alerts.status,
    })
    .from(alerts)
    .innerJoin(farms, eq(alerts.farmId, farms.farmId))
    .where(gte(alerts.createdAt, since30d))
    .orderBy(sql`${alerts.createdAt} desc`)
    .limit(30);

  return rows.map((r) => {
    // 리드타임은 농장주 신고 시각(reportedAt) 실데이터 확보 전까지 null — 합성 분포 표시 금지
    const outcome: DetectionCase['outcome'] =
      r.status === 'acknowledged' ? 'true_positive' : 'pending';

    return {
      alertId: r.alertId,
      farmId: r.farmId,
      farmName: r.farmName,
      detectedAt: r.createdAt.toISOString(),
      reportedAt: null,
      leadTimeHours: null,
      outcome,
      diseaseName: null,
      preventedAnimals: 0,
    };
  });
}

// ===========================
// 메인: getEarlyDetectionMetrics
// ===========================

export async function getEarlyDetectionMetrics(): Promise<EarlyDetectionMetrics> {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [monthlyAlerts, yearlyAlerts, recentCases] = await Promise.all([
      fetchAlertStats(startOfMonth),
      fetchAlertStats(startOfYear),
      fetchRecentCases(),
    ]);

    // 오탐/정탐률 — sovereign_alarm_labels 실측 (표본 10 미만이면 null = '—')
    const MIN_LABEL_SAMPLES = 10;
    const labelDb = getDb();
    const [labelCounts] = await labelDb
      .select({
        confirmed: sql<number>`count(*) filter (where ${sovereignAlarmLabels.verdict} in ('confirmed', 'modified'))`,
        falsePositive: sql<number>`count(*) filter (where ${sovereignAlarmLabels.verdict} = 'false_positive')`,
      })
      .from(sovereignAlarmLabels);
    const confirmedN = Number(labelCounts?.confirmed ?? 0);
    const falsePositiveN = Number(labelCounts?.falsePositive ?? 0);
    const labeledTotal = confirmedN + falsePositiveN;
    const labelRates = labeledTotal >= MIN_LABEL_SAMPLES
      ? {
          truePositiveRate: confirmedN / labeledTotal,
          falsePositiveRate: falsePositiveN / labeledTotal,
        }
      : { truePositiveRate: null, falsePositiveRate: null };

    // 월간 통계
    const monthlyDetections = monthlyAlerts.total;
    const avgLeadTimeHours = BASELINE_REPORT_HOURS - COWTALK_DETECT_HOURS;  // ~34시간 절약
    const preventedMonthly = Math.round(monthlyDetections * avgLeadTimeHours * SPREAD_PER_HOUR * 0.3);
    const monthlyStats: MonthlyStats = {
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      totalDetections: monthlyDetections,
      avgLeadTimeHours,
      preventedAnimals: preventedMonthly,
      economicSavingsKrw: preventedMonthly * AVG_ANIMAL_VALUE_KRW,
      falsePositiveRate: labelRates.falsePositiveRate,
      truePositiveRate: labelRates.truePositiveRate,
    };

    // 연간 통계 — 월별 추이 (alerts 실측 월별 집계, 난수 분배 금지)
    const yearlyDetections = yearlyAlerts.total;
    const totalPreventedYearly = Math.round(yearlyDetections * avgLeadTimeHours * SPREAD_PER_HOUR * 0.3);

    const db = getDb();
    const monthlyRows = await db
      .select({
        month: sql<string>`to_char(${alerts.createdAt}, 'YYYY-MM')`,
        detections: count(alerts.alertId),
      })
      .from(alerts)
      .where(gte(alerts.createdAt, startOfYear))
      .groupBy(sql`to_char(${alerts.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${alerts.createdAt}, 'YYYY-MM')`);
    const detectionsByMonth = new Map(monthlyRows.map((r) => [r.month, Number(r.detections)]));
    const monthlyTrend = Array.from({ length: now.getMonth() + 1 }, (_, i) => {
      const m = `${now.getFullYear()}-${String(i + 1).padStart(2, '0')}`;
      const detections = detectionsByMonth.get(m) ?? 0;
      const prevented = Math.round(detections * avgLeadTimeHours * SPREAD_PER_HOUR * 0.3);
      return { month: m, detections, savingsKrw: prevented * AVG_ANIMAL_VALUE_KRW };
    });

    const yearlyStats: YearlyStats = {
      year: now.getFullYear(),
      totalDetections: yearlyDetections,
      totalPreventedAnimals: totalPreventedYearly,
      totalEconomicSavingsKrw: totalPreventedYearly * AVG_ANIMAL_VALUE_KRW,
      avgLeadTimeHours,
      monthlyTrend,
    };

    // 비교 시나리오
    const savedAnimals = Math.round(yearlyDetections * avgLeadTimeHours * SPREAD_PER_HOUR * 0.3);
    const comparisonScenario: ComparisonScenario = {
      withCowTalk: {
        avgResponseHours: COWTALK_DETECT_HOURS,
        estimatedSpreadAnimals: Math.round(yearlyDetections * COWTALK_DETECT_HOURS * SPREAD_PER_HOUR),
      },
      withoutCowTalk: {
        avgResponseHours: BASELINE_REPORT_HOURS,
        estimatedSpreadAnimals: Math.round(yearlyDetections * BASELINE_REPORT_HOURS * SPREAD_PER_HOUR),
      },
      savedAnimals,
      savedEconomicKrw: savedAnimals * AVG_ANIMAL_VALUE_KRW,
    };

    return {
      monthlyStats,
      yearlyStats,
      recentCases,
      comparisonScenario,
      computedAt: now.toISOString(),
    };
  } catch (err) {
    logger.error({ err }, '[EarlyDetectionMetrics] 조회 실패');
    throw err;
  }
}
