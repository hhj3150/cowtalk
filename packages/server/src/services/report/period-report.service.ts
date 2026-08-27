// 기간 보고서 집계 — 주간/월간/분기/성과 보고서가 공유하는 단일 집계 경로
//
// 원래 이 로직은 /reports/farm/:farmId/monthly 라우트 안에 있었다. 주간·분기 보고서를 붙이면서
// 라우트 밖으로 꺼냈다 — 기간만 다르고 계산은 같기 때문이다. 월간 라우트는 이 함수를 호출하며
// 응답 형태는 그대로 유지된다 (비파괴).
//
// 정직성 원칙(기존 로직에서 이어짐):
// - 표본이 없으면 0이 아니라 null (수태율·알람 정확도)
// - 유량·마진은 기록이 있을 때만 계산 (추정 단가는 산식을 항상 동봉)
// - 알람 정확도는 이 농장·이 기간의 실제 레이블 10건 이상일 때만

import { getDb } from '../../config/database.js';
import {
  farms,
  animals,
  smaxtecEvents,
  breedingEvents,
  sensorDevices,
  milkRecords,
  treatments,
  healthEvents,
  decisionActions,
  feedback,
  feedPrograms,
  farmMilkSummary,
} from '../../db/schema.js';
import { eq, and, count, gte, lt, sql, inArray } from 'drizzle-orm';
import { getEconomicParamValues } from '../economics/economic-params.service.js';
import { computeMilkPricePerL, computeTieredRevenue } from '@cowtalk/shared';
import { ratioPct } from '../../lib/metrics-clamp.js';
import { computeCR, decisionsFromBreedingEventCounts } from '../metrics/fertility-service.js';
import { kstDateStr } from './period.js';

export const EVENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  estrus: '발정',
  estrus_dnb: '발정(DNB)',
  heat: '발정',
  health_warning: '건강 경고',
  health_general: '건강 주의',
  temperature_warning: '체온 이상',
  temperature_high: '고체온',
  temperature_low: '저체온',
  calving: '분만',
  calving_detection: '분만 징후',
  calving_confirmation: '분만 확인',
  calving_waiting: '분만 대기',
  rumination_warning: '반추 이상',
  rumination_decrease: '반추 저하',
  activity_warning: '활동 이상',
  activity_decrease: '활동량 저하',
  activity_increase: '활동량 증가',
  drinking_warning: '음수 이상',
  drinking_decrease: '음수 저하',
  feeding_warning: '사양 이상',
  insemination: '수정',
  pregnancy_check: '임신 감정',
  fertility_warning: '재발정',
  no_insemination: '미수정',
  dry_off: '건유 전환',
  clinical_condition: '임상 이상',
  abortion: '유산',
  management: '관리',
};

// 건강 이벤트 카테고리 — 질병 유형별 집계용
export const HEALTH_EVENT_TYPES: Readonly<Record<string, string>> = {
  temperature_high: '고체온',
  temperature_low: '저체온',
  temperature_warning: '체온이상',
  rumination_warning: '반추이상',
  rumination_decrease: '반추저하',
  clinical_condition: '임상이상',
  health_warning: '건강경고',
  health_general: '건강주의',
  drinking_warning: '음수이상',
  drinking_decrease: '음수저하',
  activity_decrease: '활동저하',
};


export interface BuildPeriodReportInput {
  readonly farmId: string;
  /** 기간 시작 (포함) */
  readonly start: Date;
  /** 기간 끝 (미포함) */
  readonly end: Date;
  /** 코멘트·제목에 쓰이는 기간 표기 ("2026-08 월간", "8월 3주차") */
  readonly periodTitle: string;
}

export interface PeriodReportSensor {
  readonly sensorCoverage: number;
  /** null = 레이블 10건 미만 (집계 불가) */
  readonly alertAccuracy: number | null;
  readonly alertAccuracyLabels: number;
  /** 이 기간에 새로 삽입된 볼루스 수 (sensor_devices 의 삽입일 기준) */
  readonly installedInPeriod: number;
  /** 이 기간에 새로 등록된 개체 중 센서 보유 두수 (smaXtec 동기화 경로 — 삽입일 미상) */
  readonly newSensorAnimalsInPeriod: number;
  /** 기간 종료 시점 기준 활성 볼루스 수 */
  readonly activeDevices: number;
}

export interface PeriodPerformance {
  readonly earlyDetection: {
    readonly healthAlertCount: number;
    readonly ackedCount: number;
    readonly treatmentCount: number;
  };
  readonly decisionsCompleted: number;
  readonly milk: {
    readonly recordedDays: number;
    readonly animalsWithRecords: number;
    readonly totalYieldL: number;
    readonly avgYieldPerRecordL: number | null;
    readonly avgFatPct: number | null;
    readonly avgProteinPct: number | null;
    readonly avgLactosePct: number | null;
    readonly avgSccThousand: number | null;
    /** individual = 개체 기록, herd_summary = 우군(벌크탱크) 기록 */
    readonly source: 'individual' | 'herd_summary';
  };
  /** 유량 기록이 없으면 null — 없는 수입을 만들어내지 않는다 */
  readonly economics: {
    readonly milkRevenueEstimateKrw: number;
    readonly priceKrwPerL: number;
    readonly priceFormula: string;
    readonly feedCostPerHeadDayKrw: number | null;
    readonly marginPerHeadDayKrw: number | null;
    readonly estimated: true;
  } | null;
}

export interface PeriodReport {
  readonly farmId: string;
  readonly farmName: string;
  readonly periodTitle: string;
  readonly summary: {
    readonly totalAnimals: number;
    readonly sensorAttached: number;
    readonly totalAlerts: number;
    readonly alertsByType: readonly { type: string; label: string; count: number }[];
  };
  readonly breeding: BreedingMetrics;
  readonly health: HealthSummary;
  readonly sensor: PeriodReportSensor;
  readonly performance: PeriodPerformance;
  readonly aiComment: string;
}

/**
 * 농장·기간 단위 집계. 농장이 없으면 null (라우트가 404 로 변환).
 * 기간은 어떤 길이든 받는다 — 주 7일, 한 달, 한 분기, 파일럿 누적 전체.
 */
export async function buildPeriodReport(input: BuildPeriodReportInput): Promise<PeriodReport | null> {
  const db = getDb();
  const { farmId, start, end, periodTitle } = input;

  const [farm] = await db
    .select({ farmId: farms.farmId, name: farms.name })
    .from(farms)
    .where(eq(farms.farmId, farmId));

  if (!farm) return null;

  // ── 2. 동물 수 + 센서 장착 수 (병렬) ──
  const [animalCountResult, deviceIdCountResult, sensorDeviceCountResult, monthEvents] = await Promise.all([
    db
      .select({ total: count() })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active'))),

    // 센서 장착 수는 두 소스를 함께 본다:
    //   animals.current_device_id — smaXtec 동기화가 실제로 채우는 값 (전 서비스 공통 기준)
    //   sensor_devices           — 삽입 이력을 가진 장치 테이블 (수기 등록·이력 추적용)
    // 과거 이 보고서는 sensor_devices 만 셌는데, 동기화 경로가 그 테이블을 채우지 않아
    // 커버리지가 늘 0%로 나오고 "센서 추가 설치를 권장합니다" 코멘트가 매달 붙었다.
    db
      .select({
        byDevice: sql<number>`count(*) filter (where ${animals.currentDeviceId} is not null and ${animals.currentDeviceId} != '')`,
      })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active'))),

    db
      .select({ total: count() })
      .from(sensorDevices)
      .innerJoin(animals, eq(sensorDevices.animalId, animals.animalId))
      .where(
        and(
          eq(animals.farmId, farmId),
          eq(animals.status, 'active'),
          eq(sensorDevices.status, 'active'),
        ),
      ),

    db
      .select({
        eventType: smaxtecEvents.eventType,
        cnt: count(),
      })
      .from(smaxtecEvents)
      .where(
        and(
          eq(smaxtecEvents.farmId, farmId),
          gte(smaxtecEvents.detectedAt, start),
          lt(smaxtecEvents.detectedAt, end),
        ),
      )
      .groupBy(smaxtecEvents.eventType),
  ]);

  const totalAnimals = animalCountResult[0]?.total ?? 0;
  // 두 소스 중 큰 값 — 한쪽만 채워진 환경에서도 실제 장착 두수를 과소보고하지 않는다
  const sensorAttached = Math.max(
    Number(deviceIdCountResult[0]?.byDevice ?? 0),
    Number(sensorDeviceCountResult[0]?.total ?? 0),
  );

  // ── 3. 이벤트 유형별 집계 ──
  const totalAlerts = monthEvents.reduce((sum, e) => sum + e.cnt, 0);

  const alertsByType = monthEvents
    .map((e) => ({
      type: e.eventType,
      label: EVENT_TYPE_LABELS[e.eventType] ?? e.eventType,
      count: e.cnt,
    }))
    .sort((a, b) => b.count - a.count);

  // ── 4. 번식 성적 ──
  const breedingData = await computeBreedingMetrics(db, farmId, start, end, monthEvents);

  // ── 5. 건강 요약 ──
  const healthData = computeHealthSummary(monthEvents);

  // ── 6. 센서 지표 ──
  const sensorCoverage = totalAnimals > 0
    ? Math.round((sensorAttached / totalAnimals) * 100)
    : 0;

  // 알람 정확도: 이 농장·이 달 이벤트에 붙은 실제 피드백 레이블만 사용.
  // 표본 10건 미만이면 null(집계 불가) — 하드코딩 홍보 수치 금지 (정직성 원칙).
  const [labelRows] = await db
    .select({
      tp: sql<number>`count(*) filter (where ${feedback.feedbackType} not in ('alert_false_positive','disease_excluded'))::int`,
      fp: sql<number>`count(*) filter (where ${feedback.feedbackType} in ('alert_false_positive','disease_excluded'))::int`,
    })
    .from(feedback)
    .innerJoin(smaxtecEvents, eq(feedback.alertId, smaxtecEvents.eventId))
    .where(and(
      eq(smaxtecEvents.farmId, farmId),
      gte(smaxtecEvents.detectedAt, start),
      lt(smaxtecEvents.detectedAt, end),
    ));
  const labeled = Number(labelRows?.tp ?? 0) + Number(labelRows?.fp ?? 0);
  const alertAccuracy = labeled >= 10
    ? Math.round((Number(labelRows?.tp ?? 0) / labeled) * 100)
    : null;

  // ── 6.5 파일럿 성과 집계 (전부 실측 — 표본 수 항상 동봉) ──
  const healthTypeList = Object.keys(HEALTH_EVENT_TYPES);
  const [ackedHealthRows, treatmentRows, decisionsRows, milkRows, econParams, feedRows] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(smaxtecEvents)
      .where(and(
        eq(smaxtecEvents.farmId, farmId),
        gte(smaxtecEvents.detectedAt, start),
        lt(smaxtecEvents.detectedAt, end),
        inArray(smaxtecEvents.eventType, healthTypeList),
        eq(smaxtecEvents.acknowledged, true),
      )),
    db
      .select({ cnt: count() })
      .from(treatments)
      .innerJoin(healthEvents, eq(treatments.healthEventId, healthEvents.eventId))
      .innerJoin(animals, eq(healthEvents.animalId, animals.animalId))
      .where(and(
        eq(animals.farmId, farmId),
        gte(treatments.administeredAt, start),
        lt(treatments.administeredAt, end),
      )),
    db
      .select({ cnt: count() })
      .from(decisionActions)
      .where(and(
        eq(decisionActions.farmId, farmId),
        gte(decisionActions.actedAt, start),
        lt(decisionActions.actedAt, end),
      )),
    db
      .select({
        totalYieldL: sql<number>`coalesce(sum(${milkRecords.yield}), 0)::float`,
        recordCount: sql<number>`count(*)::int`,
        recordedDays: sql<number>`count(distinct ${milkRecords.date})::int`,
        animalsWithRecords: sql<number>`count(distinct ${milkRecords.animalId})::int`,
        avgFat: sql<number | null>`avg(${milkRecords.fat})::float`,
        avgProtein: sql<number | null>`avg(${milkRecords.protein})::float`,
        avgScc: sql<number | null>`avg(${milkRecords.scc})::float`,
      })
      .from(milkRecords)
      .innerJoin(animals, eq(milkRecords.animalId, animals.animalId))
      .where(and(
        eq(animals.farmId, farmId),
        gte(milkRecords.date, kstDateStr(start)),
        lt(milkRecords.date, kstDateStr(end)),
      )),
    getEconomicParamValues(farmId),
    db
      .select({ dailyCostPerHead: feedPrograms.dailyCostPerHead })
      .from(feedPrograms)
      .where(and(
        eq(feedPrograms.farmId, farmId),
        eq(feedPrograms.isActive, true),
        eq(feedPrograms.targetGroup, 'lactating'),
      ))
      .limit(1),
  ]);

  // 우군(벌크탱크) 일별 기록 — 개체 기록이 없어도 월 집계 가능, 실기록 단가는 추정보다 우선
  const summaryRows = await db
    .select()
    .from(farmMilkSummary)
    .where(and(
      eq(farmMilkSummary.farmId, farmId),
      gte(farmMilkSummary.date, kstDateStr(start)),
      lt(farmMilkSummary.date, kstDateStr(end)),
    ));

  const healthAlertCount = monthEvents
    .filter((e) => e.eventType in HEALTH_EVENT_TYPES)
    .reduce((s, e) => s + e.cnt, 0);
  const milk = milkRows[0] ?? {
    totalYieldL: 0, recordCount: 0, recordedDays: 0, animalsWithRecords: 0,
    avgFat: null, avgProtein: null, avgScc: null,
  };
  // 개체 기록 집계
  let totalYieldL = Number(milk.totalYieldL);
  const recordCount = Number(milk.recordCount);
  let avgFat = milk.avgFat != null ? Math.round(Number(milk.avgFat) * 100) / 100 : null;
  let avgProtein = milk.avgProtein != null ? Math.round(Number(milk.avgProtein) * 100) / 100 : null;
  let avgScc = milk.avgScc != null ? Math.round(Number(milk.avgScc)) : null;

  // 우군 기록 집계 — 개체 기록이 없으면 우군 기록으로 월 총량·유성분을 채운다
  const avgOf = (vals: (number | null)[]): number | null => {
    const nums = vals.filter((v): v is number => v != null && Number.isFinite(v));
    return nums.length > 0 ? Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 100) / 100 : null;
  };
  const summaryTotalL = summaryRows.reduce((s, r) => {
    if (r.totalYieldL != null) return s + r.totalYieldL;
    if (r.avgYieldPerCowL != null && r.milkingCount != null) return s + r.avgYieldPerCowL * r.milkingCount;
    return s;
  }, 0);
  let milkSource: 'individual' | 'herd_summary' = 'individual';
  if (totalYieldL === 0 && summaryTotalL > 0) {
    totalYieldL = summaryTotalL;
    milkSource = 'herd_summary';
    avgFat = avgFat ?? avgOf(summaryRows.map((r) => r.avgFat));
    avgProtein = avgProtein ?? avgOf(summaryRows.map((r) => r.avgProtein));
    avgScc = avgScc ?? (avgOf(summaryRows.map((r) => r.avgScc)) != null ? Math.round(avgOf(summaryRows.map((r) => r.avgScc))!) : null);
  }
  const avgLactose = avgOf(summaryRows.map((r) => r.avgLactose));
  // 실기록 유대단가 — 기록이 있으면 추정 대신 우선 적용 (목장별 단가: 납유/유기농/직접가공)
  const recordedPrice = avgOf(summaryRows.map((r) => r.priceKrwPerL));

  // 유대단가 — 실기록(우군 기록의 단가)이 있으면 그 값을, 없으면
  // 파라미터 기반 추정 (기본가 + 유지방 가감 + 체세포 1등급 가산)
  const estimatedPrice = computeMilkPricePerL({
    basePriceKrwPerL: econParams.milk_price_krw_per_l,
    fatAdjustKrwPer01Pct: econParams.milk_fat_adjust_krw_per_01pct,
    sccGrade1BonusKrwPerL: econParams.scc_grade1_bonus_krw_per_l,
    avgFatPct: avgFat,
    avgSccThousand: avgScc,
  });
  // 3단 유대 (쿼터/초과/자체가공) — 우군 기록이 있고, 쿼터량이 설정됐거나
  // 자체가공 물량이 기록된 경우 일별로 배분 계산. 단일 단가 기록이 최우선.
  const tiered = summaryRows.length > 0 && recordedPrice == null &&
    (econParams.daily_quota_l > 0 || summaryRows.some((r) => (r.selfProcessedYieldL ?? 0) > 0))
    ? computeTieredRevenue({
        days: summaryRows.map((r) => ({
          totalL: r.totalYieldL ?? ((r.avgYieldPerCowL != null && r.milkingCount != null) ? r.avgYieldPerCowL * r.milkingCount : 0),
          selfL: r.selfProcessedYieldL,
        })),
        dailyQuotaL: econParams.daily_quota_l,
        quotaPriceKrwPerL: econParams.milk_quota_price_krw_per_l,
        surplusPriceKrwPerL: econParams.milk_surplus_price_krw_per_l,
        selfPriceKrwPerL: econParams.milk_self_price_krw_per_l,
      })
    : null;

  const milkPrice = recordedPrice != null
    ? { pricePerL: recordedPrice, formula: `실기록 단가 ${recordedPrice.toLocaleString()}원/L (우군 기록 ${summaryRows.filter((r) => r.priceKrwPerL != null).length}일 평균)` }
    : tiered != null
      ? { pricePerL: tiered.avgPricePerL, formula: tiered.formula }
      : estimatedPrice;
  const tieredRevenueKrw = tiered?.revenueKrw ?? null;

  const performance = {
    earlyDetection: {
      healthAlertCount,
      ackedCount: Number(ackedHealthRows[0]?.cnt ?? 0),
      treatmentCount: Number(treatmentRows[0]?.cnt ?? 0),
    },
    decisionsCompleted: Number(decisionsRows[0]?.cnt ?? 0),
    milk: {
      recordedDays: milkSource === 'herd_summary' ? summaryRows.length : Number(milk.recordedDays),
      animalsWithRecords: Number(milk.animalsWithRecords),
      totalYieldL: Math.round(totalYieldL),
      avgYieldPerRecordL: recordCount > 0 ? Math.round((Number(milk.totalYieldL) / recordCount) * 10) / 10 : null,
      avgFatPct: avgFat,
      avgProteinPct: avgProtein,
      avgLactosePct: avgLactose,
      avgSccThousand: avgScc,
      /** individual = 개체 기록, herd_summary = 우군(벌크탱크) 기록 */
      source: milkSource,
    },
    economics: totalYieldL > 0
      ? (() => {
          // 두당 평균 유량 — 개체 기록 우선, 없으면 우군 기록의 두당 평균
          const avgYieldPerRecordL = recordCount > 0
            ? Number(milk.totalYieldL) / recordCount
            : avgOf(summaryRows.map((r) => r.avgYieldPerCowL));
          const feedCostPerHeadDayKrw = feedRows[0]?.dailyCostPerHead ?? null;
          // 두당 일 마진 = 두당 평균 유량 × 유대단가 − 착유우 배합 두당 일 사료비
          // 유량 기록과 착유우 배합이 모두 있을 때만 계산 (없으면 null — 과장 금지)
          const marginPerHeadDayKrw =
            avgYieldPerRecordL != null && feedCostPerHeadDayKrw != null
              ? Math.round(avgYieldPerRecordL * milkPrice.pricePerL - feedCostPerHeadDayKrw)
              : null;
          return {
            // 3단 배분 수입(쿼터/초과/자체가공) 우선, 아니면 기록 유량 × 유대단가
            milkRevenueEstimateKrw: tieredRevenueKrw ?? Math.round(totalYieldL * milkPrice.pricePerL),
            priceKrwPerL: milkPrice.pricePerL,
            priceFormula: milkPrice.formula,
            feedCostPerHeadDayKrw,
            marginPerHeadDayKrw,
            estimated: true as const,
          };
        })()
      : null,
  };

  // ── 7. AI 코멘트 ──
  const aiComment = buildAiComment({
    farmName: farm.name,
    periodTitle,
    totalAnimals,
    totalAlerts,
    sensorCoverage,
    breedingData,
    healthData,
    alertsByType,
  });

  // ── 8. 이 기간의 센서 증가 (증두·추가 삽입이 보고서에 드러나야 한다) ──
  // 두 경로를 따로 센다 — 합치면 무엇을 센 것인지 알 수 없게 된다:
  //   installedInPeriod        sensor_devices 에 삽입일이 기록된 볼루스 (정확)
  //   newSensorAnimalsInPeriod 이 기간에 새로 등록된 개체 중 센서를 가진 두수
  //                            (smaXtec 동기화 경로 — 삽입일 자체는 알 수 없다)
  const [installedRows, newSensorAnimalRows] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(sensorDevices)
      .innerJoin(animals, eq(sensorDevices.animalId, animals.animalId))
      .where(
        and(
          eq(animals.farmId, farmId),
          gte(sensorDevices.installDate, start),
          lt(sensorDevices.installDate, end),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(animals)
      .where(
        and(
          eq(animals.farmId, farmId),
          gte(animals.createdAt, start),
          lt(animals.createdAt, end),
          sql`${animals.currentDeviceId} is not null and ${animals.currentDeviceId} != ''`,
        ),
      ),
  ]);

  return {
    farmId: farm.farmId,
    farmName: farm.name,
    periodTitle,
    summary: {
      totalAnimals,
      sensorAttached,
      totalAlerts,
      alertsByType,
    },
    breeding: breedingData,
    health: healthData,
    sensor: {
      sensorCoverage,
      alertAccuracy, // null = 레이블 10건 미만 (집계 불가)
      alertAccuracyLabels: labeled,
      installedInPeriod: Number(installedRows[0]?.cnt ?? 0),
      newSensorAnimalsInPeriod: Number(newSensorAnimalRows[0]?.cnt ?? 0),
      activeDevices: sensorAttached,
    },
    performance,
    aiComment,
  };
}

// ── 번식 지표 계산 ──

export interface BreedingMetrics {
  readonly conceptionRate: number | null;  // null = 데이터 부족 (D5)
  readonly conceptionRateDisplay: string;  // "—" 또는 "83.0%"
  readonly conceptionRateStatus: 'ok' | 'data_insufficient';
  readonly avgDaysOpen: number;
  readonly calvingInterval: number;
  readonly estrusDetectionRate: number;
  readonly inseminationCount: number;
  readonly conceptionPerService: number;
}

async function computeBreedingMetrics(
  db: ReturnType<typeof getDb>,
  farmId: string,
  start: Date,
  end: Date,
  monthEvents: readonly { eventType: string; cnt: number }[],
): Promise<BreedingMetrics> {
  // smaXtec 이벤트에서 발정/수정 카운트
  const estrusCount = monthEvents
    .filter((e) => e.eventType === 'estrus' || e.eventType === 'estrus_dnb' || e.eventType === 'heat')
    .reduce((sum, e) => sum + e.cnt, 0);

  const inseminationFromEvents = monthEvents
    .filter((e) => e.eventType === 'insemination')
    .reduce((sum, e) => sum + e.cnt, 0);

  // breeding_events 테이블에서 수정/임검 데이터 보충
  const breedingRows = await db
    .select({
      type: breedingEvents.type,
      cnt: count(),
    })
    .from(breedingEvents)
    .innerJoin(animals, eq(breedingEvents.animalId, animals.animalId))
    .where(
      and(
        eq(animals.farmId, farmId),
        gte(breedingEvents.eventDate, start),
        lt(breedingEvents.eventDate, end),
      ),
    )
    .groupBy(breedingEvents.type);

  const inseminationDB = breedingRows.find((r) => r.type === 'insemination')?.cnt ?? 0;
  const inseminationCount = Math.max(inseminationFromEvents, inseminationDB);

  // 수태율: fertility-service 단일 소스 (D1, BUG-001). null = 데이터 부족 (D5).
  const cr = computeCR(decisionsFromBreedingEventCounts(breedingRows));

  // 발정감지율: (발정 감지 / 발정 가능 두수) × 100
  const totalCows = await db
    .select({ cnt: count() })
    .from(animals)
    .where(
      and(
        eq(animals.farmId, farmId),
        eq(animals.status, 'active'),
        eq(animals.sex, 'female'),
      ),
    );

  const femaleCows = totalCows[0]?.cnt ?? 0;
  // 한 사이클(21일) 기준 60% 발정 기대치. breeding-pipeline.service.ts와 동일.
  const expectedEstrus = Math.max(1, femaleCows * 0.6);
  const estrusDetectionRate = ratioPct(estrusCount, expectedEstrus);

  // avgDaysOpen / calvingInterval / conceptionPerService 정밀 계산 미구현 — 가짜 수치 대신 0 반환.
  // 프론트엔드는 0을 "데이터 없음"으로 표시해야 함. (Math.random() 기반 모킹 제거됨)
  return {
    conceptionRate: cr.rate,
    conceptionRateDisplay: cr.displayValue,
    conceptionRateStatus: cr.status,
    avgDaysOpen: 0,
    calvingInterval: 0,
    estrusDetectionRate,
    inseminationCount,
    conceptionPerService: 0,
  };
}

// ── 건강 요약 ──

export interface HealthSummary {
  readonly diseaseByType: readonly { type: string; count: number }[];
  readonly mortalityCount: number;
  readonly cullingCount: number;
}

function computeHealthSummary(
  monthEvents: readonly { eventType: string; cnt: number }[],
): HealthSummary {
  const diseaseByType = monthEvents
    .filter((e) => e.eventType in HEALTH_EVENT_TYPES)
    .map((e) => ({
      type: HEALTH_EVENT_TYPES[e.eventType] ?? e.eventType,
      count: e.cnt,
    }))
    .sort((a, b) => b.count - a.count);

  // 폐사/도태는 별도 이벤트 또는 동물 상태 변경에서 집계
  const mortalityCount = monthEvents
    .filter((e) => e.eventType === 'mortality' || e.eventType === 'death')
    .reduce((sum, e) => sum + e.cnt, 0);

  const cullingCount = monthEvents
    .filter((e) => e.eventType === 'culling' || e.eventType === 'cull')
    .reduce((sum, e) => sum + e.cnt, 0);

  return { diseaseByType, mortalityCount, cullingCount };
}

// ── AI 코멘트 생성 (룰 기반, Claude API 비용 절약) ──

interface AiCommentInput {
  readonly farmName: string;
  readonly periodTitle: string;
  readonly totalAnimals: number;
  readonly totalAlerts: number;
  readonly sensorCoverage: number;
  readonly breedingData: BreedingMetrics;
  readonly healthData: HealthSummary;
  readonly alertsByType: readonly { type: string; label: string; count: number }[];
}

function buildAiComment(input: AiCommentInput): string {
  const { farmName, periodTitle, totalAnimals, totalAlerts, sensorCoverage, breedingData, healthData, alertsByType } = input;
  const parts: string[] = [];

  parts.push(
    `${farmName} ${periodTitle} 보고서입니다. ` +
    `총 ${String(totalAnimals)}두 중 센서 커버리지 ${String(sensorCoverage)}%로 운영되고 있습니다.`,
  );

  // 알림 요약
  if (totalAlerts > 0) {
    const top3 = alertsByType.slice(0, 3).map((a) => `${a.label}(${String(a.count)}건)`).join(', ');
    parts.push(`이번 달 총 ${String(totalAlerts)}건의 알림이 발생했으며, 주요 유형은 ${top3}입니다.`);
  } else {
    parts.push('이번 달 특이 알림이 발생하지 않았습니다.');
  }

  // 번식 평가. D5: rate=null이면 코멘트 생략 (가짜 평가 금지).
  if (breedingData.conceptionRate === null) {
    // 데이터 부족: 평가 코멘트 생성 안 함.
  } else if (breedingData.conceptionRate >= 50) {
    parts.push(`수태율 ${breedingData.conceptionRateDisplay}로 양호한 수준입니다.`);
  } else if (breedingData.conceptionRate > 0) {
    parts.push(
      `수태율 ${breedingData.conceptionRateDisplay}로 목표(50%) 미달입니다. ` +
      '수정 시기 정확도와 정액 품질을 점검해 주세요.',
    );
  }

  if (breedingData.estrusDetectionRate >= 70) {
    parts.push(`발정감지율 ${String(breedingData.estrusDetectionRate)}%로 smaXtec 센서가 효과적으로 작동하고 있습니다.`);
  }

  // 건강 경고
  const totalHealthIssues = healthData.diseaseByType.reduce((sum, d) => sum + d.count, 0);
  if (totalHealthIssues > totalAnimals * 0.3) {
    parts.push(
      `건강 관련 알림이 ${String(totalHealthIssues)}건으로 두수 대비 높은 수준입니다. ` +
      '사양 환경 및 스트레스 요인을 점검하시기 바랍니다.',
    );
  }

  if (healthData.mortalityCount > 0) {
    parts.push(`폐사 ${String(healthData.mortalityCount)}건이 기록되었습니다. 원인 분석이 필요합니다.`);
  }

  // 센서 커버리지
  if (sensorCoverage < 70) {
    parts.push(
      `센서 커버리지가 ${String(sensorCoverage)}%로 낮습니다. ` +
      '미장착 개체에 대한 센서 추가 설치를 권장합니다.',
    );
  }

  parts.push('※ 이 보고서는 smaXtec 센서 데이터 기반 자동 분석이며, 수의사의 임상적 판단을 대체하지 않습니다.');

  return parts.join(' ');
}
