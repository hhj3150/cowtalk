// 번식 AI 어드바이저 — 발정 감지 → 수정 적기 + 정액 추천
// smaXtec 발정 알람 수신 시 자동으로 수정 추천 알림 생성
// 목장 보유 정액 중 최적 정액 추천 (근교계수 + 유전능력 + 학습 피드백 기반)

import { getDb } from '../../config/database.js';
import {
  animals, farms, farmSemenInventory, semenCatalog,
  breedingEvents, pregnancyChecks, smaxtecEvents,
} from '../../db/schema.js';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { getFarmSemenPerformance, type SemenPerformance } from './breeding-feedback.service.js';
import { PedigreeConnector, type PedigreeRecord } from '../../pipeline/connectors/public-data/pedigree.connector.js';
import { findSimilarPatterns } from '../sovereign-alarm/pattern-mining.service.js';

// ===========================
// 타입
// ===========================

/** 센서 패턴 기반 수태 예측 인사이트 */
export interface SensorInsight {
  readonly similarCaseCount: number;
  readonly estimatedConceptionRate: number | null;  // 유사 패턴 소의 평균 수태율 (null=데이터 부족)
  readonly avgLeadTimeHours: number | null;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly reasoning: string;
}

export interface BreedingAdvice {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly heatDetectedAt: string;
  readonly optimalInseminationTime: string;
  readonly optimalTimeLabel: string;
  readonly windowStartHours: number;
  readonly windowEndHours: number;
  readonly windowStartTime: string;  // ISO — 수정 윈도우 시작 시각
  readonly windowEndTime: string;    // ISO — 수정 윈도우 종료 시각
  readonly warnings: readonly string[];
  readonly recommendations: readonly SemenRecommendation[];
  readonly sensorInsight: SensorInsight | null;  // 센서 패턴 기반 수태 예측
  readonly farmSettings: {
    readonly pregnancyCheckDays: number;
    readonly estrusRecurrenceDays: number;
  };
}

export interface SemenRecommendation {
  readonly rank: number;
  readonly semenId: string;
  readonly bullName: string;
  readonly bullRegistration: string | null;
  readonly breed: string;
  readonly score: number;
  readonly inbreedingRisk: 'low' | 'medium' | 'high';
  readonly estimatedInbreeding: number;
  readonly inbreedingReason: string;           // 근교계수 산출 근거 (예: "혈통 정보 없음")
  readonly milkYieldGain: number | null;
  readonly reasoning: string;
  readonly availableStraws: number;
  readonly pricePerStraw: number | null;
  // 학습 근거: 이 목장에서 과거 수태율 (decided >= 2건일 때만 non-null)
  readonly pastConceptionRate: number | null;
  readonly pastSampleSize: number;
  readonly learningBonus: number;              // 점수에 반영된 학습 가산점 (-15~+15)
}

// ===========================
// 수정 적기 계산
// ===========================

import type { FarmBreedingSettings } from '../../db/schema.js';
import { getFarmBreedingSettings } from './farm-settings-sync.service.js';

/**
 * 발정 시작 시점으로부터 최적 수정 시간 계산
 * 목장별 설정값(inseminationWindowStart/End)을 반영
 * 기본: AM-PM 룰 (오전 발정 → 오후 수정, 오후 발정 → 다음날 오전 수정)
 */
function calculateOptimalTime(
  heatDetectedAt: Date,
  settings: FarmBreedingSettings,
): { time: Date; label: string } {
  const windowStart = settings.inseminationWindowStartHours ?? 10;
  const windowEnd = settings.inseminationWindowEndHours ?? 18;
  const midPoint = (windowStart + windowEnd) / 2; // 수정 적기 중간값

  const heatHour = heatDetectedAt.getHours();

  // AM-PM Rule (목장별 수정 적기 윈도우 반영)
  if (heatHour < 12) {
    // 오전 발정 → 당일 오후 (midPoint 시간 후)
    const optimal = new Date(heatDetectedAt.getTime() + midPoint * 60 * 60 * 1000);
    return { time: optimal, label: `오늘 오후 수정 권장 (적기 ${windowStart}~${windowEnd}h)` };
  }
  // 오후 발정 → 다음날 오전
  const hoursToAdd = midPoint + 2; // 오후 발정은 +2시간 추가
  const optimal = new Date(heatDetectedAt.getTime() + hoursToAdd * 60 * 60 * 1000);
  return { time: optimal, label: `내일 오전 수정 권장 (적기 ${windowStart}~${windowEnd}h)` };
}

// ===========================
// 학습 가산점 (순수 함수, 테스트 용이)
// ===========================

/**
 * 목장 내 과거 수태율로부터 학습 가산점을 계산한다.
 * - 결정된 샘플(decided) 2건 미만이면 가산점 없음 (통계 신뢰 부족)
 * - 신뢰도: 샘플 N에 대해 min(15, 3+N) 포인트까지 스케일
 * - baseline 수태율 60% 기준: 100% → +confidence, 20% → -confidence
 */
export function computeLearningBonus(params: {
  readonly conceptionRate: number;   // 0~100
  readonly decidedCount: number;
}): number {
  if (params.decidedCount < 2) return 0;
  const confidence = Math.min(15, 3 + params.decidedCount);
  const bonus = ((params.conceptionRate - 60) / 40) * confidence;
  return Math.round(bonus);
}

// ===========================
// 근교계수 추정 (실데이터 기반)
// ===========================

export interface InbreedingAssessment {
  readonly coefficient: number;
  readonly risk: 'low' | 'medium' | 'high';
  readonly reason: string;
}

// 혈통 캐시 (in-memory, 1h TTL) — 시연 중 cold fetch 1회 후 warm hit
const pedigreeCache = new Map<string, { record: PedigreeRecord | null; cachedAt: number }>();
const PEDIGREE_TTL_MS = 60 * 60 * 1000;
let pedigreeConnector: PedigreeConnector | null = null;

async function fetchPedigreeCached(traceId: string): Promise<PedigreeRecord | null> {
  const hit = pedigreeCache.get(traceId);
  if (hit && Date.now() - hit.cachedAt < PEDIGREE_TTL_MS) {
    return hit.record;
  }
  try {
    if (!pedigreeConnector) {
      pedigreeConnector = new PedigreeConnector();
      await pedigreeConnector.connect();
    }
    const record = await pedigreeConnector.fetchPedigree(traceId);
    pedigreeCache.set(traceId, { record, cachedAt: Date.now() });
    return record;
  } catch (err) {
    logger.debug({ err, traceId }, '[BreedingAdvisor] pedigree fetch failed');
    pedigreeCache.set(traceId, { record: null, cachedAt: Date.now() });
    return null;
  }
}

/**
 * 실데이터 기반 근교 위험 평가
 * 우선순위:
 *   1) 동일 종모우 재사용 (breeding_events 이력)
 *   2) 혈통 직계 매칭 (pedigree 캐시, optional)
 *   3) 기본값 (혈통 정보 없음)
 */
export async function estimateInbreedingRisk(params: {
  readonly animalTraceId: string | null;
  readonly bullRegistration: string | null;
  readonly semenId: string;
  readonly previousBreedings: readonly { semenId: string | null }[];
}): Promise<InbreedingAssessment> {
  // 1) 동일 종모우 재사용 체크
  const sameBullUses = params.previousBreedings.filter((b) => b.semenId === params.semenId).length;
  if (sameBullUses >= 2) {
    return { coefficient: 0.12, risk: 'high', reason: `동일 종모우 재사용 ${sameBullUses}회` };
  }
  if (sameBullUses === 1) {
    return { coefficient: 0.08, risk: 'medium', reason: '동일 종모우 재사용 1회' };
  }

  // 2) 혈통 직계 매칭 (traceId + bullRegistration 둘 다 있을 때만)
  if (params.animalTraceId && params.bullRegistration) {
    const pedigree = await fetchPedigreeCached(params.animalTraceId);
    const sireNo = pedigree?.sire?.registrationNumber;
    if (sireNo && sireNo === params.bullRegistration) {
      return { coefficient: 0.25, risk: 'high', reason: '부-자 직접 매칭' };
    }
  }

  // 3) 기본값 — 혈통 정보 없음, 평균 근교계수 가정
  return { coefficient: 0.03, risk: 'low', reason: '혈통 정보 없음' };
}

// ===========================
// 수정 전 경고 체크
// ===========================

interface RecentInsemination {
  readonly semenId: string | null;
  readonly semenInfo: string | null;
  readonly eventDate: Date | null;
}

export interface WarningContext {
  readonly animalId: string;
  readonly parity: number;
  readonly daysInMilk: number | null;
  readonly birthDate: Date | null;
  readonly recentInseminations: readonly RecentInsemination[];
  readonly minBreedingAgeMonths: number;
  readonly longOpenDaysDim: number;
}

/**
 * 수정 전 경고 체크 — 확장 버전
 * - 최근 건강 이벤트
 * - 연속 미임신
 * - 산차별 위험 (초산우 / 고산차우)
 * - 조기 반복 발정 (직전 수정 후 21일 미만)
 * - 장기공태우 (DIM > longOpenDaysDim)
 */
export async function checkWarnings(ctx: WarningContext): Promise<readonly string[]> {
  const db = getDb();
  const warnings: string[] = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1) 최근 30일 건강 이벤트
  const recentHealth = await db.select({
    eventType: smaxtecEvents.eventType,
    detectedAt: smaxtecEvents.detectedAt,
  })
    .from(smaxtecEvents)
    .where(and(
      eq(smaxtecEvents.animalId, ctx.animalId),
      gte(smaxtecEvents.detectedAt, thirtyDaysAgo),
      sql`${smaxtecEvents.eventType} IN ('clinical_condition', 'health_warning', 'temperature_high')`,
    ))
    .orderBy(desc(smaxtecEvents.detectedAt))
    .limit(5);

  if (recentHealth.length > 0) {
    const latest = recentHealth[0]!;
    const daysSince = Math.floor((now.getTime() - (latest.detectedAt?.getTime() ?? 0)) / (24 * 60 * 60 * 1000));
    warnings.push(`⚠️ 최근 ${daysSince}일 전 건강 이벤트 (${latest.eventType}) — 수의사 확인 권장`);
  }

  // 2) 연속 미임신
  const recentChecks = await db.select({
    result: pregnancyChecks.result,
  })
    .from(pregnancyChecks)
    .where(eq(pregnancyChecks.animalId, ctx.animalId))
    .orderBy(desc(pregnancyChecks.checkDate))
    .limit(5);

  const failCount = recentChecks.filter((c) => c.result === 'open' || c.result === 'not_pregnant').length;
  if (failCount >= 3) {
    warnings.push(`🔴 최근 수정 ${failCount}회 연속 미임신 — 번식장애 검진 필요`);
  } else if (failCount >= 2) {
    warnings.push(`🟡 최근 수정 ${failCount}회 미임신 — 수의사 상담 권장`);
  }

  // 3) 산차 경고
  if (ctx.parity >= 6) {
    warnings.push(`🟡 ${ctx.parity}산 고산차우 — 자궁 회복 상태 확인 권장`);
  } else if (ctx.parity === 0 && ctx.birthDate) {
    const ageMonths = Math.floor(
      (now.getTime() - ctx.birthDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000),
    );
    if (ageMonths < ctx.minBreedingAgeMonths) {
      warnings.push(`🟡 미경산 ${ageMonths}개월 — 목장 기준 ${ctx.minBreedingAgeMonths}개월 미달 가능`);
    }
  }

  // 4) 조기 반복 발정 — 직전 수정 후 21일(±3) 미만이면 임신 실패 가능성
  const lastInsem = ctx.recentInseminations[0];
  if (lastInsem?.eventDate) {
    const daysSinceLast = Math.floor((now.getTime() - lastInsem.eventDate.getTime()) / (24 * 60 * 60 * 1000));
    if (daysSinceLast >= 15 && daysSinceLast <= 24) {
      warnings.push(`🟡 직전 수정 후 ${daysSinceLast}일 경과 — 발정재귀 범위 (수정 실패 가능)`);
    } else if (daysSinceLast < 15) {
      warnings.push(`🔴 직전 수정 후 ${daysSinceLast}일 — 조기 반복 발정, 수의사 확인 권장`);
    }
  }

  // 5) 장기공태우
  if (ctx.daysInMilk != null && ctx.daysInMilk > ctx.longOpenDaysDim) {
    warnings.push(`🔴 DIM ${ctx.daysInMilk}일 — 장기공태우 (기준 ${ctx.longOpenDaysDim}일), 번식장애 검진 권장`);
  }

  return warnings;
}

// ===========================
// 메인: 발정 시 수정 추천
// ===========================

export async function getBreedingAdvice(
  animalId: string,
  heatDetectedAt?: Date,
): Promise<BreedingAdvice | null> {
  const db = getDb();

  // 1. 개체 정보 조회 (경고 계산에 필요한 필드 포함)
  const [animal] = await db.select({
    animalId: animals.animalId,
    earTag: animals.earTag,
    traceId: animals.traceId,
    farmId: animals.farmId,
    farmName: farms.name,
    breed: animals.breed,
    parity: animals.parity,
    daysInMilk: animals.daysInMilk,
    birthDate: animals.birthDate,
    lactationStatus: animals.lactationStatus,
  })
    .from(animals)
    .innerJoin(farms, eq(animals.farmId, farms.farmId))
    .where(eq(animals.animalId, animalId));

  if (!animal) return null;

  // 2. 발정 시점 (파라미터 없으면 최근 발정 이벤트에서)
  let heatTime = heatDetectedAt;
  if (!heatTime) {
    const [latestHeat] = await db.select({ detectedAt: smaxtecEvents.detectedAt })
      .from(smaxtecEvents)
      .where(and(
        eq(smaxtecEvents.animalId, animalId),
        sql`${smaxtecEvents.eventType} IN ('estrus', 'heat')`,
      ))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(1);
    heatTime = latestHeat?.detectedAt ?? new Date();
  }

  // 3. 목장별 설정 로드 + 수정 적기 계산
  const farmSettings = await getFarmBreedingSettings(animal.farmId);
  const { time: optimalTime, label: optimalLabel } = calculateOptimalTime(heatTime, farmSettings);

  // 4. 최근 수정 이력 (재사용 경고 + 근교 평가 양쪽에서 사용)
  const recentInseminationsRaw = await db.select({
    semenId: breedingEvents.semenId,
    semenInfo: breedingEvents.semenInfo,
    eventDate: breedingEvents.eventDate,
  })
    .from(breedingEvents)
    .where(and(
      eq(breedingEvents.animalId, animalId),
      eq(breedingEvents.type, 'insemination'),
    ))
    .orderBy(desc(breedingEvents.eventDate))
    .limit(10);

  // 5. 수정 전 경고 체크 (확장된 컨텍스트)
  const warnings = await checkWarnings({
    animalId: animal.animalId,
    parity: animal.parity,
    daysInMilk: animal.daysInMilk,
    birthDate: animal.birthDate ? new Date(animal.birthDate) : null,
    recentInseminations: recentInseminationsRaw,
    minBreedingAgeMonths: farmSettings.minBreedingAgeMonths ?? 12,
    longOpenDaysDim: farmSettings.longOpenDaysDim ?? 200,
  });

  // 6. 학습 피드백 로드 (목장 내 정액별 과거 수태율)
  const performance = await getFarmSemenPerformance(animal.farmId);

  // 7. 목장 보유 정액 조회 (동일 품종만)
  // ⚠️ 한우 씨수소 API(15101999)는 한우 전용
  // 젖소는 젖소 정액만, 한우는 한우 정액만 추천
  const inventory = await db.select({
    semenId: semenCatalog.semenId,
    bullName: semenCatalog.bullName,
    bullRegistration: semenCatalog.bullRegistration,
    breed: semenCatalog.breed,
    genomicTraits: semenCatalog.genomicTraits,
    pricePerStraw: semenCatalog.pricePerStraw,
    quantity: farmSemenInventory.quantity,
  })
    .from(farmSemenInventory)
    .innerJoin(semenCatalog, eq(farmSemenInventory.semenId, semenCatalog.semenId))
    .where(and(
      eq(farmSemenInventory.farmId, animal.farmId),
      sql`${farmSemenInventory.quantity} > 0`,
      // 품종 일치 필터: 한우 소에 젖소 정액 추천 방지, 반대도 마찬가지
      sql`LOWER(${semenCatalog.breed}) = LOWER(${animal.breed})`,
    ))
    .orderBy(desc(farmSemenInventory.quantity));

  // 8. 각 정액에 대해 점수 계산 + 추천 순위
  const recommendations: SemenRecommendation[] = await Promise.all(
    inventory.map(async (inv): Promise<SemenRecommendation> => {
      const traits = inv.genomicTraits as Record<string, number> | null;
      const milkGain = traits?.milk ?? traits?.milkYield ?? null;

      const inbreeding = await estimateInbreedingRisk({
        animalTraceId: animal.traceId,
        bullRegistration: inv.bullRegistration,
        semenId: inv.semenId,
        previousBreedings: recentInseminationsRaw,
      });

      // 점수: 기본(50) + 유량(±20) + 근교(0~30) + 재고(0~10) + 가격(0~10) + 학습(-15~+15)
      let score = 50;

      if (milkGain != null) {
        score += Math.min(20, Math.max(-10, milkGain / 50));
      }

      if (inbreeding.risk === 'low') score += 30;
      else if (inbreeding.risk === 'medium') score += 15;
      // high → 0

      score += Math.min(10, inv.quantity * 2);

      if (inv.pricePerStraw != null && inv.pricePerStraw < 30000) score += 10;
      else if (inv.pricePerStraw != null && inv.pricePerStraw < 50000) score += 5;

      // 학습 피드백 가산점 — 과거 수태율 2건 이상일 때만 적용
      const perf: SemenPerformance | undefined = performance.get(inv.semenId);
      let learningBonus = 0;
      let pastConceptionRate: number | null = null;
      let pastSampleSize = 0;
      if (perf && perf.decidedCount >= 2) {
        pastConceptionRate = perf.conceptionRate;
        pastSampleSize = perf.decidedCount;
        learningBonus = computeLearningBonus({
          conceptionRate: perf.conceptionRate,
          decidedCount: perf.decidedCount,
        });
        score += learningBonus;
      }

      const reasons: string[] = [];
      if (inbreeding.risk === 'low') reasons.push('근교 위험 낮음');
      else if (inbreeding.risk === 'medium') reasons.push(`🟡 ${inbreeding.reason}`);
      else reasons.push(`🔴 ${inbreeding.reason}`);
      if (milkGain != null && milkGain > 0) reasons.push(`유량 +${Math.round(milkGain)}kg 기대`);
      if (inv.quantity >= 5) reasons.push(`보유 ${inv.quantity}스트로`);
      if (pastConceptionRate != null) {
        reasons.push(`본 목장 ${pastSampleSize}회 · 수태율 ${pastConceptionRate}%`);
      }

      return {
        rank: 0,
        semenId: inv.semenId,
        bullName: inv.bullName,
        bullRegistration: inv.bullRegistration,
        breed: inv.breed,
        score: Math.round(score),
        inbreedingRisk: inbreeding.risk,
        estimatedInbreeding: inbreeding.coefficient,
        inbreedingReason: inbreeding.reason,
        milkYieldGain: milkGain != null ? Math.round(milkGain) : null,
        reasoning: reasons.join(' · '),
        availableStraws: inv.quantity,
        pricePerStraw: inv.pricePerStraw,
        pastConceptionRate,
        pastSampleSize,
        learningBonus,
      };
    }),
  );

  // 점수순 정렬 + 순위 부여
  const sorted = [...recommendations]
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const windowStart = farmSettings.inseminationWindowStartHours ?? 10;
  const windowEnd = farmSettings.inseminationWindowEndHours ?? 18;

  // 9. 센서 패턴 기반 수태 예측 (비동기, 실패해도 무시)
  const sensorInsight = await computeSensorInsight(animalId).catch(() => null);

  return {
    animalId: animal.animalId,
    earTag: animal.earTag,
    farmId: animal.farmId,
    farmName: animal.farmName ?? '',
    heatDetectedAt: heatTime.toISOString(),
    optimalInseminationTime: optimalTime.toISOString(),
    optimalTimeLabel: optimalLabel,
    windowStartHours: windowStart,
    windowEndHours: windowEnd,
    windowStartTime: new Date(heatTime.getTime() + windowStart * 3_600_000).toISOString(),
    windowEndTime: new Date(heatTime.getTime() + windowEnd * 3_600_000).toISOString(),
    warnings,
    recommendations: sorted.slice(0, 5),
    sensorInsight,
    farmSettings: {
      pregnancyCheckDays: farmSettings.pregnancyCheckDays ?? 28,
      estrusRecurrenceDays: farmSettings.estrusRecurrenceDays ?? 21,
    },
  };
}

// ===========================
// 수정 기록 저장
// ===========================

export async function recordInsemination(params: {
  readonly animalId: string;
  readonly farmId: string;
  readonly semenId?: string;
  readonly semenInfo?: string;
  readonly technicianName?: string;
  readonly recommendedSemenId?: string;
  readonly optimalTime?: string;
  readonly notes?: string;
}): Promise<{ eventId: string }> {
  const db = getDb();

  const [result] = await db.insert(breedingEvents).values({
    animalId: params.animalId,
    farmId: params.farmId,
    eventDate: new Date(),
    type: 'insemination',
    semenId: params.semenId ?? null,
    semenInfo: params.semenInfo ?? null,
    technicianName: params.technicianName ?? null,
    recommendedSemenId: params.recommendedSemenId ?? null,
    optimalTime: params.optimalTime ? new Date(params.optimalTime) : null,
    notes: params.notes ?? null,
  }).returning({ eventId: breedingEvents.eventId });

  // 보유 정액 수량 차감
  if (params.semenId) {
    await db.execute(sql`
      UPDATE farm_semen_inventory
      SET quantity = GREATEST(quantity - 1, 0)
      WHERE farm_id = ${params.farmId} AND semen_id = ${params.semenId}
    `);
  }

  logger.info({
    animalId: params.animalId,
    semenId: params.semenId,
    eventId: result?.eventId,
  }, '[BreedingAdvisor] Insemination recorded');

  return { eventId: result?.eventId ?? '' };
}

// ===========================
// 임신감정 기록
// ===========================

export async function recordPregnancyCheck(params: {
  readonly animalId: string;
  readonly checkDate: string;
  readonly result: 'pregnant' | 'open';
  readonly method: 'ultrasound' | 'manual' | 'blood';
  readonly daysPostInsemination?: number;
  readonly notes?: string;
}): Promise<{ checkId: string }> {
  const db = getDb();

  const [row] = await db.insert(pregnancyChecks).values({
    animalId: params.animalId,
    checkDate: new Date(params.checkDate),
    result: params.result,
    method: params.method,
    daysPostInsemination: params.daysPostInsemination ?? null,
    notes: params.notes ?? null,
  }).returning({ checkId: pregnancyChecks.checkId });

  logger.info({
    animalId: params.animalId,
    result: params.result,
    checkId: row?.checkId,
  }, '[BreedingAdvisor] Pregnancy check recorded');

  return { checkId: row?.checkId ?? '' };
}

// ===========================
// 번식 피드백 (수정→임신감정 매칭)
// ===========================

export interface BreedingFeedbackEntry {
  readonly inseminationDate: string;
  readonly semenId: string | null;
  readonly bullName: string | null;
  readonly pregnancyResult: 'pregnant' | 'open' | 'pending';
  readonly checkDate: string | null;
  readonly daysToCheck: number | null;
}

export interface BreedingFeedback {
  readonly animalId: string;
  readonly totalInseminations: number;
  readonly pregnantCount: number;
  readonly openCount: number;
  readonly pendingCount: number;
  readonly conceptionRate: number;
  readonly entries: readonly BreedingFeedbackEntry[];
}

export async function getBreedingFeedback(animalId: string): Promise<BreedingFeedback> {
  const db = getDb();

  // 수정 기록 (최근 10건)
  const inseminations = await db.select({
    eventId: breedingEvents.eventId,
    eventDate: breedingEvents.eventDate,
    semenId: breedingEvents.semenId,
    semenInfo: breedingEvents.semenInfo,
  })
    .from(breedingEvents)
    .where(and(
      eq(breedingEvents.animalId, animalId),
      eq(breedingEvents.type, 'insemination'),
    ))
    .orderBy(desc(breedingEvents.eventDate))
    .limit(10);

  // 임신감정 기록
  const checks = await db.select({
    checkDate: pregnancyChecks.checkDate,
    result: pregnancyChecks.result,
    daysPostInsemination: pregnancyChecks.daysPostInsemination,
  })
    .from(pregnancyChecks)
    .where(eq(pregnancyChecks.animalId, animalId))
    .orderBy(desc(pregnancyChecks.checkDate));

  // 정액 정보 조회
  const semenIds = inseminations.map((i) => i.semenId).filter(Boolean) as string[];
  const semenMap = new Map<string, string>();
  if (semenIds.length > 0) {
    const semenRows = await db.select({
      semenId: semenCatalog.semenId,
      bullName: semenCatalog.bullName,
    })
      .from(semenCatalog)
      .where(sql`${semenCatalog.semenId} IN (${sql.join(semenIds.map((id) => sql`${id}`), sql`, `)})`);
    for (const s of semenRows) {
      semenMap.set(s.semenId, s.bullName);
    }
  }

  // 수정 → 임신감정 매칭 (수정일 기준 가장 가까운 감정 결과)
  const entries: BreedingFeedbackEntry[] = inseminations.map((ins) => {
    const insDate = ins.eventDate;
    const matchingCheck = checks.find((c) => {
      const checkTime = c.checkDate?.getTime() ?? 0;
      const insTime = insDate?.getTime() ?? 0;
      return checkTime > insTime && checkTime - insTime < 120 * 24 * 60 * 60 * 1000; // 120일 이내
    });

    return {
      inseminationDate: insDate?.toISOString() ?? '',
      semenId: ins.semenId,
      bullName: ins.semenId ? (semenMap.get(ins.semenId) ?? ins.semenInfo) : ins.semenInfo,
      pregnancyResult: matchingCheck ? (matchingCheck.result as 'pregnant' | 'open') : 'pending',
      checkDate: matchingCheck?.checkDate?.toISOString() ?? null,
      daysToCheck: matchingCheck?.daysPostInsemination ?? null,
    };
  });

  const pregnantCount = entries.filter((e) => e.pregnancyResult === 'pregnant').length;
  const openCount = entries.filter((e) => e.pregnancyResult === 'open').length;
  const pendingCount = entries.filter((e) => e.pregnancyResult === 'pending').length;
  const decided = pregnantCount + openCount;

  return {
    animalId,
    totalInseminations: entries.length,
    pregnantCount,
    openCount,
    pendingCount,
    conceptionRate: decided > 0 ? Math.round((pregnantCount / decided) * 100) : 0,
    entries,
  };
}

// ===========================
// 센서 패턴 기반 수태 예측
// ===========================

/**
 * 현재 개체의 최근 센서 데이터를 기반으로 유사 발정 패턴의 과거 수태율을 추정한다.
 * alarm_pattern_snapshots의 estrus 이벤트와 비교하여 "비슷한 패턴의 소들이 수태율 X%였다" 제공.
 */
async function computeSensorInsight(animalId: string): Promise<SensorInsight | null> {
  const db = getDb();
  const { sensorDailyAgg } = await import('../../db/schema.js');

  // 최근 3일 센서 집계
  const threeDaysAgo = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
  const rows = await db.select()
    .from(sensorDailyAgg)
    .where(and(
      eq(sensorDailyAgg.animalId, animalId),
      gte(sensorDailyAgg.date, threeDaysAgo),
    ));

  // 메트릭 집계
  const temps = rows.filter(r => r.metricType === 'temp').map(r => r.avg);
  const rums = rows.filter(r => r.metricType === 'rum_index').map(r => r.avg / 60);
  const acts = rows.filter(r => r.metricType === 'act').map(r => r.avg);

  const tempMean = temps.length > 0 ? temps.reduce((s, v) => s + v, 0) / temps.length : null;
  const rumMean = rums.length > 0 ? rums.reduce((s, v) => s + v, 0) / rums.length : null;
  const actMean = acts.length > 0 ? acts.reduce((s, v) => s + v, 0) / acts.length : null;

  if (tempMean === null && rumMean === null && actMean === null) {
    return null; // 센서 데이터 없음
  }

  // 체온 추세 (단순 기울기)
  const tempTrend = temps.length >= 2
    ? (temps[temps.length - 1]! - temps[0]!) / (temps.length - 1)
    : null;
  const rumTrend = rums.length >= 2
    ? (rums[rums.length - 1]! - rums[0]!) / (rums.length - 1)
    : null;

  // 유사 발정 패턴 검색 (estrus 이벤트 기반 스냅샷)
  const similarPatterns = await findSimilarPatterns(
    { tempMean, rumMean, actMean, tempTrend, rumTrend },
    'estrus',
    10,
  );

  if (similarPatterns.length < 3) {
    return {
      similarCaseCount: similarPatterns.length,
      estimatedConceptionRate: null,
      avgLeadTimeHours: null,
      confidence: 'low',
      reasoning: `유사 발정 패턴 ${similarPatterns.length}건 — 데이터 부족으로 수태율 예측 불가. 스냅샷 축적 후 정확도 향상 예정.`,
    };
  }

  // 유사 패턴 소들의 수태율 추정 (after 센서 변화로 간접 추정)
  // after에서 체온이 안정되고 활동량이 낮아지면 임신 가능성 높음
  const withAfterData = similarPatterns.filter(p => p.afterTempMean !== null);
  let estimatedRate: number | null = null;
  let reasoning = '';

  if (withAfterData.length >= 3) {
    // 발정 후 센서가 안정화된 비율 = 임신 proxy
    const stabilized = withAfterData.filter(p => {
      const tempStable = p.tempDelta !== null && p.tempDelta < 0.3; // 체온 하강/유지
      const actStable = p.actDelta !== null && p.actDelta < 0;      // 활동량 감소
      return tempStable || actStable;
    });
    estimatedRate = Math.round((stabilized.length / withAfterData.length) * 100);
    reasoning = `유사 발정 패턴 ${withAfterData.length}건 중 발정 후 센서 안정화 ${stabilized.length}건 (${estimatedRate}%). 체온 평균 ${tempMean?.toFixed(1) ?? 'N/A'}°C, 반추 ${rumMean?.toFixed(0) ?? 'N/A'}분/일.`;
  } else {
    reasoning = `유사 발정 패턴 ${similarPatterns.length}건 발견. 발정 후 추적 데이터 부족으로 수태율은 참고치만 제공.`;
  }

  return {
    similarCaseCount: similarPatterns.length,
    estimatedConceptionRate: estimatedRate,
    avgLeadTimeHours: null,
    confidence: withAfterData.length >= 5 ? 'high' : withAfterData.length >= 3 ? 'medium' : 'low',
    reasoning,
  };
}
