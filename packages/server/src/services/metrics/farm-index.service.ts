// Farm Intelligence Index — "오늘의 목장 점수" 계산
//
// 정직성 원칙: 각 축은 실데이터로만 계산하고, 부족하면 null('—').
// 종합은 가용 축 평균 + coverage 노출. 축마다 reasons(실데이터 인용)를 반환한다.
// 점수화 함수는 순수 — 단위 테스트 대상.

import { getDb } from '../../config/database.js';
import { farms, animals, smaxtecEvents, milkRecords, farmProfitEntries, farmIndexSnapshots } from '../../db/schema.js';
import { and, eq, gte, inArray, isNotNull, isNull, sql, count, desc } from 'drizzle-orm';
import { getBreedingPipeline } from '../breeding/breeding-pipeline.service.js';
import { logger } from '../../lib/logger.js';
import type { FarmIntelligenceIndex, FarmIndexAxis, FarmIndexGrade, FarmIndexTrendPoint } from '@cowtalk/shared';

const MS_PER_DAY = 86_400_000;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ===========================
// 축별 점수화 (순수 함수)
// ===========================

/** 건강: 최근 7일 심각·높음 알람 비율. 0% → 100점, 두수의 25% 이상 → 0점 */
export function scoreHealth(input: { alertedAnimals7d: number; headCount: number }): FarmIndexAxis {
  if (input.headCount <= 0) {
    return { key: 'health', label: '건강', score: null, status: 'data_insufficient', reasons: ['활성 두수 없음'] };
  }
  const rate = input.alertedAnimals7d / input.headCount;
  const score = Math.round(clamp(100 - rate * 400, 0, 100));
  return {
    key: 'health',
    label: '건강',
    score,
    status: 'ok',
    reasons: [
      `최근 7일 심각·높음 알람 개체 ${input.alertedAnimals7d}두 / ${input.headCount}두 (${Math.round(rate * 100)}%)`,
    ],
  };
}

/** 번식: 수태율(CR) 기반. CR null(표본 부족) → 축 자체 null */
export function scoreBreeding(input: { conceptionRate: number | null; estrusDetectionRate?: number }): FarmIndexAxis {
  if (input.conceptionRate == null) {
    return {
      key: 'breeding', label: '번식', score: null, status: 'data_insufficient',
      reasons: ['수태율 표본 부족 — 수정·임신감정 기록 축적 중'],
    };
  }
  // 낙농 수태율 40%+ 우수 기준 — CR 45%에서 만점 포화
  const score = Math.round(clamp((input.conceptionRate / 45) * 100, 0, 100));
  const reasons = [`수태율 ${input.conceptionRate.toFixed(1)}% (우수 기준 40%+)`];
  if (input.estrusDetectionRate != null) reasons.push(`발정탐지율 ${input.estrusDetectionRate.toFixed(0)}%`);
  return { key: 'breeding', label: '번식', score, status: 'ok', reasons };
}

/** 모니터링: 센서 장착률 (실측 커버리지) */
export function scoreMonitoring(input: { sensorAttached: number; headCount: number }): FarmIndexAxis {
  if (input.headCount <= 0) {
    return { key: 'monitoring', label: '모니터링', score: null, status: 'data_insufficient', reasons: ['활성 두수 없음'] };
  }
  const pct = clamp((input.sensorAttached / input.headCount) * 100, 0, 100);
  return {
    key: 'monitoring',
    label: '모니터링',
    score: Math.round(pct),
    status: 'ok',
    reasons: [`위내센서 장착 ${input.sensorAttached}/${input.headCount}두 (${Math.round(pct)}%)`],
  };
}

/** 생산성: 유량 '기록 커버리지' 기반 (유량 수준 평가는 개체별 기준선 확보 후) */
export function scoreProductivity(input: { recordedAnimals7d: number; headCount: number; avgYieldL: number | null }): FarmIndexAxis {
  if (input.recordedAnimals7d <= 0) {
    return {
      key: 'productivity', label: '생산성', score: null, status: 'data_insufficient',
      reasons: ['최근 7일 유량 기록 없음 — 빠른기록/팅커벨로 착유량을 기록하면 활성화됩니다'],
    };
  }
  const coverage = clamp((input.recordedAnimals7d / Math.max(1, input.headCount)) * 100, 0, 100);
  const reasons = [`유량 기록 개체 ${input.recordedAnimals7d}/${input.headCount}두 (기록 커버리지 ${Math.round(coverage)}%)`];
  if (input.avgYieldL != null) reasons.push(`평균 ${input.avgYieldL}L/일 — 유량 수준 평가는 개체 기준선 확보 후 도입`);
  return { key: 'productivity', label: '생산성', score: Math.round(coverage), status: 'ok', reasons };
}

/** 경제성: 최근 3개월 손익 기록 기반 마진. 기록 없으면 null */
export function scoreEconomy(input: { totalRevenue: number; totalCost: number; months: number }): FarmIndexAxis {
  if (input.months <= 0 || input.totalRevenue <= 0) {
    return {
      key: 'economy', label: '경제성', score: null, status: 'data_insufficient',
      reasons: ['손익 기록 없음 — 월별 수입·지출을 기록하면 활성화됩니다'],
    };
  }
  const margin = (input.totalRevenue - input.totalCost) / input.totalRevenue; // -∞ ~ 1
  // 마진 0% → 50점, 30%+ → 100점, -30% 이하 → 0점
  const score = Math.round(clamp(50 + (margin / 0.3) * 50, 0, 100));
  return {
    key: 'economy',
    label: '경제성',
    score,
    status: 'ok',
    reasons: [
      `최근 ${input.months}개월 수입 ${Math.round(input.totalRevenue / 10_000).toLocaleString('ko-KR')}만원 · ` +
      `지출 ${Math.round(input.totalCost / 10_000).toLocaleString('ko-KR')}만원 (마진 ${(margin * 100).toFixed(1)}%)`,
    ],
  };
}

/** 종합: 가용 축 평균 + 등급. 가용 축 0개면 null */
export function combineAxes(axes: readonly FarmIndexAxis[]): { overall: number | null; grade: FarmIndexGrade | null; coverage: { available: number; total: number } } {
  const available = axes.filter((a) => a.score != null);
  const coverage = { available: available.length, total: axes.length };
  if (available.length === 0) return { overall: null, grade: null, coverage };
  const overall = Math.round(available.reduce((s, a) => s + (a.score ?? 0), 0) / available.length);
  const grade: FarmIndexGrade = overall >= 85 ? 'A' : overall >= 70 ? 'B' : overall >= 55 ? 'C' : 'D';
  return { overall, grade, coverage };
}

// ===========================
// 로더
// ===========================

export async function getFarmIntelligenceIndex(farmId: string): Promise<FarmIntelligenceIndex | null> {
  const db = getDb();
  const since7dTs = new Date(Date.now() - 7 * MS_PER_DAY);
  const since7dStr = since7dTs.toISOString().slice(0, 10);

  const [farm] = await db
    .select({ farmId: farms.farmId, name: farms.name })
    .from(farms)
    .where(eq(farms.farmId, farmId))
    .limit(1);
  if (!farm) return null;

  // 두수 + 센서 장착
  const [counts] = await db
    .select({
      headCount: count(),
      sensorAttached: sql<number>`count(*) filter (where ${animals.currentDeviceId} is not null)`,
    })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active'), isNull(animals.deletedAt)));
  const headCount = Number(counts?.headCount ?? 0);
  const sensorAttached = Number(counts?.sensorAttached ?? 0);

  // 최근 7일 심각·높음 알람 개체 수 (distinct)
  const [alertRow] = await db
    .select({ alerted: sql<number>`count(distinct ${smaxtecEvents.animalId})` })
    .from(smaxtecEvents)
    .where(and(
      eq(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, since7dTs),
      inArray(smaxtecEvents.severity, ['critical', 'high']),
      isNotNull(smaxtecEvents.animalId),
    ));
  const alertedAnimals7d = Number(alertRow?.alerted ?? 0);

  // 번식 KPI (기존 단일 계산원 재사용)
  let conceptionRate: number | null = null;
  let estrusDetectionRate: number | undefined;
  try {
    const pipeline = await getBreedingPipeline(farmId);
    conceptionRate = pipeline.kpis.conceptionRate;
    estrusDetectionRate = pipeline.kpis.estrusDetectionRate;
  } catch (err) {
    logger.warn({ err, farmId }, '[FarmIndex] 번식 KPI 로딩 실패 — 번식 축 제외');
  }

  // 최근 7일 유량 기록 (해당 농장 개체)
  const [milkRow] = await db
    .select({
      recordedAnimals: sql<number>`count(distinct ${milkRecords.animalId})`,
      avgYield: sql<number>`avg(${milkRecords.yield})`,
    })
    .from(milkRecords)
    .innerJoin(animals, eq(milkRecords.animalId, animals.animalId))
    .where(and(eq(animals.farmId, farmId), gte(milkRecords.date, since7dStr)));
  const recordedAnimals7d = Number(milkRow?.recordedAnimals ?? 0);
  const avgYieldL = milkRow?.avgYield != null ? Math.round(Number(milkRow.avgYield) * 10) / 10 : null;

  // 최근 3개월 손익 기록
  const profitRows = await db
    .select()
    .from(farmProfitEntries)
    .where(eq(farmProfitEntries.farmId, farmId))
    .orderBy(desc(farmProfitEntries.period))
    .limit(3);
  const totalRevenue = profitRows.reduce(
    (s, r) => s + r.revenueMilk + r.revenueCalves + r.revenueSubsidies + r.revenueCullSales + r.revenueOther, 0);
  const totalCost = profitRows.reduce(
    (s, r) => s + r.costFeed + r.costVet + r.costBreeding + r.costLabor + r.costFacility + r.costOther, 0);

  const axes: FarmIndexAxis[] = [
    scoreHealth({ alertedAnimals7d, headCount }),
    scoreBreeding({ conceptionRate, estrusDetectionRate }),
    scoreMonitoring({ sensorAttached, headCount }),
    scoreProductivity({ recordedAnimals7d, headCount, avgYieldL }),
    scoreEconomy({ totalRevenue, totalCost, months: profitRows.length }),
  ];

  const { overall, grade, coverage } = combineAxes(axes);

  return {
    farmId: farm.farmId,
    farmName: farm.name,
    overall,
    grade,
    coverage,
    axes,
    generatedAt: new Date().toISOString(),
  };
}

// ===========================
// 일별 스냅샷 (24h 배치) + 추이 조회
// ===========================

/** 전 활성 농장의 오늘자 지수를 스냅샷 (같은 날짜는 갱신 — 하루 1행) */
export async function snapshotFarmIndexes(): Promise<{ snapped: number; failed: number }> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const activeFarms = await db
    .select({ farmId: farms.farmId })
    .from(farms)
    .where(and(eq(farms.status, 'active'), isNull(farms.deletedAt)));

  let snapped = 0;
  let failed = 0;
  for (const f of activeFarms) {
    try {
      const index = await getFarmIntelligenceIndex(f.farmId);
      if (!index) continue;
      await db
        .insert(farmIndexSnapshots)
        .values({
          farmId: f.farmId,
          date: today,
          overall: index.overall,
          grade: index.grade,
          coverageAvailable: index.coverage.available,
          coverageTotal: index.coverage.total,
          axes: index.axes,
        })
        .onConflictDoUpdate({
          target: [farmIndexSnapshots.farmId, farmIndexSnapshots.date],
          set: {
            overall: index.overall,
            grade: index.grade,
            coverageAvailable: index.coverage.available,
            coverageTotal: index.coverage.total,
            axes: index.axes,
          },
        });
      snapped++;
    } catch (err) {
      failed++;
      logger.warn({ err, farmId: f.farmId }, '[FarmIndex] 스냅샷 실패 — 다음 농장 계속');
    }
  }
  logger.info({ snapped, failed, date: today }, '[FarmIndex] 일별 스냅샷 완료');
  return { snapped, failed };
}

/** 최근 N일 지수 추이 (실측 스냅샷만 — 보간·합성 없음) */
export async function getFarmIndexTrend(farmId: string, days = 30): Promise<readonly FarmIndexTrendPoint[]> {
  const db = getDb();
  const sinceStr = new Date(Date.now() - Math.min(days, 180) * MS_PER_DAY).toISOString().slice(0, 10);
  const rows = await db
    .select({
      date: farmIndexSnapshots.date,
      overall: farmIndexSnapshots.overall,
      coverageAvailable: farmIndexSnapshots.coverageAvailable,
    })
    .from(farmIndexSnapshots)
    .where(and(eq(farmIndexSnapshots.farmId, farmId), gte(farmIndexSnapshots.date, sinceStr)))
    .orderBy(farmIndexSnapshots.date);
  return rows.map((r) => ({ date: r.date, overall: r.overall, coverageAvailable: r.coverageAvailable }));
}
