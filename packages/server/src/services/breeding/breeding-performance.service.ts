// 번식 성과 분석 서비스 — 추이·농장비교·산차별 KPI
// BreedingKpiPage 3개 분석 탭용 데이터 제공

import { getDb } from '../../config/database.js';
import { animals, farms, smaxtecEvents, pregnancyChecks } from '../../db/schema.js';
import { eq, and, gte, inArray, isNull } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { computeCR, decisionsFromPregnancyChecks, decisionsFromSmaxtecPregnancyEvents } from '../metrics/fertility-service.js';
import type { MonthlyKpiTrend, FarmKpiComparison, ParityKpiGroup } from '@cowtalk/shared';

const MS_PER_DAY = 86_400_000;

// ===========================
// 1. 월별 KPI 추이
// ===========================

export async function getMonthlyTrends(farmId?: string, months = 6): Promise<readonly MonthlyKpiTrend[]> {
  const db = getDb();
  const now = new Date();

  // 월별 버킷 생성 (현재 달 포함)
  const buckets: Array<{ month: string; start: Date; end: Date }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    buckets.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      start: d,
      end: nextMonth,
    });
  }

  const sinceDate = buckets[0]?.start ?? now;

  // 활성 암소 조회
  const animalConditions = [eq(animals.status, 'active'), isNull(animals.deletedAt)];
  if (farmId) animalConditions.push(eq(animals.farmId, farmId));

  const allAnimals = await db
    .select({ animalId: animals.animalId, farmId: animals.farmId, sex: animals.sex })
    .from(animals)
    .where(and(...animalConditions));
  const femaleOnly = allAnimals.filter((a) => a.sex !== 'male');
  const animalIds = femaleOnly.map((a) => a.animalId);

  if (animalIds.length === 0) return buckets.map((b) => emptyTrend(b.month));

  // 이벤트 벌크 조회
  const allEvents = await db
    .select({
      animalId: smaxtecEvents.animalId,
      eventType: smaxtecEvents.eventType,
      detectedAt: smaxtecEvents.detectedAt,
      details: smaxtecEvents.details,
    })
    .from(smaxtecEvents)
    .where(and(
      inArray(smaxtecEvents.animalId, animalIds),
      gte(smaxtecEvents.detectedAt, sinceDate),
    ));

  // 임신감정 결과 (수동)
  const manualPreg = await db
    .select({ animalId: pregnancyChecks.animalId, result: pregnancyChecks.result, checkDate: pregnancyChecks.checkDate })
    .from(pregnancyChecks)
    .where(and(inArray(pregnancyChecks.animalId, animalIds), gte(pregnancyChecks.checkDate, sinceDate)));

  // 월별 KPI 계산
  const trends: MonthlyKpiTrend[] = buckets.map((bucket) => {
    const monthEvents = allEvents.filter((e) => {
      const t = new Date(e.detectedAt).getTime();
      return t >= bucket.start.getTime() && t < bucket.end.getTime();
    });
    const monthPreg = manualPreg.filter((p) => {
      const t = new Date(p.checkDate).getTime();
      return t >= bucket.start.getTime() && t < bucket.end.getTime();
    });

    return calcMonthKpis(bucket.month, monthEvents, monthPreg, animalIds.length);
  });

  logger.info({ months, farmId, dataPoints: trends.length }, '[BreedingPerformance] 월별 추이 산출');
  return trends;
}

function calcMonthKpis(
  month: string,
  events: ReadonlyArray<{ eventType: string; details: unknown; animalId: string }>,
  manualPreg: ReadonlyArray<{ result: string }>,
  totalFemales: number,
): MonthlyKpiTrend {
  // 수태율: fertility-service 단일 소스 (D1, BUG-001).
  // D2 정의: pregnant ÷ (pregnant + open|not_pregnant). pending 제외 — 이전 코드는 pending을 false로 분모에 포함시키던 버그가 있었음.
  const decisions = [
    ...decisionsFromSmaxtecPregnancyEvents(events),
    ...decisionsFromPregnancyChecks(manualPreg),
  ];
  const cr = computeCR(decisions);
  const conceptionRate = cr.rate ?? 0;

  // 발정탐지율
  const estrusCount = events.filter((e) => e.eventType === 'estrus' || e.eventType === 'heat').length;
  const expectedEstrus = Math.max(1, totalFemales * 0.6);
  const estrusDetectionRate = Math.min(100, Math.round((estrusCount / expectedEstrus) * 100));

  // 수정 이벤트 수
  const inseminationCount = events.filter((e) => e.eventType === 'insemination').length;

  // 평균공태일 / 분만간격: 월별 정밀 계산 미구현 — 0 반환(가짜 수치 노출 금지).
  // 프론트엔드는 0을 "데이터 없음"으로 표시. 정밀 계산은 breeding-pipeline.service 참조.
  const avgDaysOpen = 0;
  const avgCalvingInterval = 0;

  const sampleSize = cr.denominator + estrusCount + inseminationCount;

  return {
    month,
    conceptionRate,
    estrusDetectionRate,
    avgDaysOpen,
    avgCalvingInterval,
    sampleSize,
  };
}

function emptyTrend(month: string): MonthlyKpiTrend {
  return { month, conceptionRate: 0, estrusDetectionRate: 0, avgDaysOpen: 0, avgCalvingInterval: 0, sampleSize: 0 };
}

// ===========================
// 2. 농장별 KPI 비교
// ===========================

export async function getFarmComparison(limit = 10): Promise<readonly FarmKpiComparison[]> {
  const db = getDb();
  const now = new Date();
  const since365d = new Date(now.getTime() - 365 * MS_PER_DAY);

  // 활성 농장 + 암소 수
  const allAnimals = await db
    .select({ animalId: animals.animalId, farmId: animals.farmId, sex: animals.sex })
    .from(animals)
    .where(and(eq(animals.status, 'active'), isNull(animals.deletedAt)));

  const femaleAnimals = allAnimals.filter((a) => a.sex !== 'male');

  // 농장별 그룹핑
  const farmAnimalsMap = new Map<string, string[]>();
  for (const a of femaleAnimals) {
    const list = farmAnimalsMap.get(a.farmId) ?? [];
    farmAnimalsMap.set(a.farmId, [...list, a.animalId]);
  }

  // 2두 미만 농장 제외
  const farmIds = [...farmAnimalsMap.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .map(([fId]) => fId);

  if (farmIds.length === 0) return [];

  // 농장명
  const farmRows = await db
    .select({ farmId: farms.farmId, name: farms.name })
    .from(farms)
    .where(inArray(farms.farmId, farmIds));
  const farmNameMap = new Map(farmRows.map((f) => [f.farmId, f.name]));

  // 전체 이벤트 벌크
  const allAnimalIds = femaleAnimals.map((a) => a.animalId);
  const allEvents = await db
    .select({
      animalId: smaxtecEvents.animalId,
      eventType: smaxtecEvents.eventType,
      detectedAt: smaxtecEvents.detectedAt,
      details: smaxtecEvents.details,
    })
    .from(smaxtecEvents)
    .where(and(
      inArray(smaxtecEvents.animalId, allAnimalIds),
      gte(smaxtecEvents.detectedAt, since365d),
    ));

  // 임신감정 결과
  const pregResults = await db
    .select({ animalId: pregnancyChecks.animalId, result: pregnancyChecks.result })
    .from(pregnancyChecks)
    .where(and(inArray(pregnancyChecks.animalId, allAnimalIds), gte(pregnancyChecks.checkDate, since365d)));

  // 농장별 KPI 계산
  const results: FarmKpiComparison[] = farmIds.map((fId) => {
    const farmAnimalIds = new Set(farmAnimalsMap.get(fId) ?? []);
    const farmEvents = allEvents.filter((e) => farmAnimalIds.has(e.animalId));
    const farmPreg = pregResults.filter((p) => farmAnimalIds.has(p.animalId));

    // 수태율: fertility-service 단일 소스 (D1, BUG-001).
    const conceptionRate = computeCR([
      ...decisionsFromSmaxtecPregnancyEvents(farmEvents),
      ...decisionsFromPregnancyChecks(farmPreg),
    ]).rate ?? 0;

    // 발정탐지율
    const estrusN = farmEvents.filter((e) => e.eventType === 'estrus' || e.eventType === 'heat').length;
    const expected = Math.max(1, farmAnimalIds.size * 0.6);
    const estrusDetectionRate = Math.min(100, Math.round((estrusN / expected) * 100));

    // 간이 공태일/분만간격 — 정밀 계산은 추후
    const avgDaysOpen = 0;
    const avgCalvingInterval = 0;

    return {
      farmId: fId,
      farmName: farmNameMap.get(fId) ?? fId,
      animalCount: farmAnimalIds.size,
      conceptionRate,
      estrusDetectionRate,
      avgDaysOpen,
      avgCalvingInterval,
    };
  });

  // 수태율 내림차순, 상위 limit
  const sorted = [...results]
    .filter((r) => r.conceptionRate > 0 || r.estrusDetectionRate > 0)
    .sort((a, b) => b.conceptionRate - a.conceptionRate)
    .slice(0, limit);

  logger.info({ totalFarms: farmIds.length, returned: sorted.length }, '[BreedingPerformance] 농장 비교 산출');
  return sorted;
}

// ===========================
// 3. 산차별 KPI 분석
// ===========================

const PARITY_GROUPS: ReadonlyArray<{ label: string; range: readonly [number, number] }> = [
  { label: '미경산', range: [0, 0] },
  { label: '1산', range: [1, 1] },
  { label: '2산', range: [2, 2] },
  { label: '3산', range: [3, 3] },
  { label: '4산+', range: [4, 99] },
];

export async function getParityAnalysis(farmId?: string): Promise<readonly ParityKpiGroup[]> {
  const db = getDb();
  const now = new Date();
  const since365d = new Date(now.getTime() - 365 * MS_PER_DAY);

  const animalConditions = [eq(animals.status, 'active'), isNull(animals.deletedAt)];
  if (farmId) animalConditions.push(eq(animals.farmId, farmId));

  const allAnimals = await db
    .select({ animalId: animals.animalId, parity: animals.parity, sex: animals.sex })
    .from(animals)
    .where(and(...animalConditions));

  const femaleAnimals = allAnimals.filter((a) => a.sex !== 'male');
  const animalIds = femaleAnimals.map((a) => a.animalId);

  if (animalIds.length === 0) {
    return PARITY_GROUPS.map((g) => ({
      parityLabel: g.label,
      parityRange: g.range,
      animalCount: 0,
      conceptionRate: 0,
      estrusDetectionRate: 0,
      avgDaysOpen: 0,
      avgCalvingInterval: 0,
    }));
  }

  // 이벤트 벌크
  const allEvents = await db
    .select({
      animalId: smaxtecEvents.animalId,
      eventType: smaxtecEvents.eventType,
      details: smaxtecEvents.details,
    })
    .from(smaxtecEvents)
    .where(and(
      inArray(smaxtecEvents.animalId, animalIds),
      gte(smaxtecEvents.detectedAt, since365d),
    ));

  const pregResults = await db
    .select({ animalId: pregnancyChecks.animalId, result: pregnancyChecks.result })
    .from(pregnancyChecks)
    .where(and(inArray(pregnancyChecks.animalId, animalIds), gte(pregnancyChecks.checkDate, since365d)));

  const results: ParityKpiGroup[] = PARITY_GROUPS.map((group) => {
    const groupAnimalIds = new Set(
      femaleAnimals
        .filter((a) => {
          const p = a.parity ?? 0;
          return p >= group.range[0] && p <= group.range[1];
        })
        .map((a) => a.animalId),
    );

    if (groupAnimalIds.size === 0) {
      return {
        parityLabel: group.label,
        parityRange: group.range,
        animalCount: 0,
        conceptionRate: 0,
        estrusDetectionRate: 0,
        avgDaysOpen: 0,
        avgCalvingInterval: 0,
      };
    }

    const groupEvents = allEvents.filter((e) => groupAnimalIds.has(e.animalId));
    const groupPreg = pregResults.filter((p) => groupAnimalIds.has(p.animalId));

    // 수태율: fertility-service 단일 소스 (D1, BUG-001).
    const conceptionRate = computeCR([
      ...decisionsFromSmaxtecPregnancyEvents(groupEvents),
      ...decisionsFromPregnancyChecks(groupPreg),
    ]).rate ?? 0;

    // 발정탐지율
    const estrusN = groupEvents.filter((e) => e.eventType === 'estrus' || e.eventType === 'heat').length;
    const expected = Math.max(1, groupAnimalIds.size * 0.6);
    const estrusDetectionRate = Math.min(100, Math.round((estrusN / expected) * 100));

    return {
      parityLabel: group.label,
      parityRange: group.range,
      animalCount: groupAnimalIds.size,
      conceptionRate,
      estrusDetectionRate,
      avgDaysOpen: 0,
      avgCalvingInterval: 0,
    };
  });

  logger.info({ farmId, groups: results.map((r) => `${r.parityLabel}:${r.animalCount}`).join(' ') }, '[BreedingPerformance] 산차별 분석');
  return results;
}
