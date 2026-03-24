// 번식 AI 어드바이저 — 발정 감지 → 수정 적기 + 정액 추천
// smaXtec 발정 알람 수신 시 자동으로 수정 추천 알림 생성
// 목장 보유 정액 중 최적 정액 추천 (근교계수 + 유전능력 기반)

import { getDb } from '../../config/database.js';
import {
  animals, farms, farmSemenInventory, semenCatalog,
  breedingEvents, pregnancyChecks, smaxtecEvents,
} from '../../db/schema.js';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

// ===========================
// 타입
// ===========================

export interface BreedingAdvice {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly heatDetectedAt: string;
  readonly optimalInseminationTime: string;
  readonly optimalTimeLabel: string;
  readonly warnings: readonly string[];
  readonly recommendations: readonly SemenRecommendation[];
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
  readonly milkYieldGain: number | null;
  readonly reasoning: string;
  readonly availableStraws: number;
  readonly pricePerStraw: number | null;
}

// ===========================
// 수정 적기 계산
// ===========================

/**
 * 발정 시작 시점으로부터 최적 수정 시간 계산
 * 일반적 기준: 발정 시작 후 12~18시간이 수정 적기
 * AM-PM 룰: 오전 발정 → 오후 수정, 오후 발정 → 다음날 오전 수정
 */
function calculateOptimalTime(heatDetectedAt: Date): { time: Date; label: string } {
  const heatHour = heatDetectedAt.getHours();

  // AM-PM Rule
  if (heatHour < 12) {
    // 오전 발정 → 당일 오후 (12~18시간 후)
    const optimal = new Date(heatDetectedAt.getTime() + 14 * 60 * 60 * 1000); // +14시간
    return { time: optimal, label: '오늘 오후 수정 권장 (AM-PM 룰)' };
  }
  // 오후 발정 → 다음날 오전
  const optimal = new Date(heatDetectedAt.getTime() + 16 * 60 * 60 * 1000); // +16시간
  return { time: optimal, label: '내일 오전 수정 권장 (AM-PM 룰)' };
}

// ===========================
// 근교계수 추정
// ===========================

/**
 * 간이 근교계수 추정
 * 실제 혈통 3대를 다 추적하려면 pedigree 데이터 필요
 * 현재는 동일 종모우 사용 이력 기반 간이 추정
 */
function estimateInbreeding(
  _animalBreed: string,
  bullRegistration: string | null,
  _parentInfo: { sireId?: string; damSireId?: string } | null,
): { coefficient: number; risk: 'low' | 'medium' | 'high' } {
  // 혈통 정보 없으면 기본값 (평균 근교계수 3~4%)
  if (!bullRegistration) {
    return { coefficient: 0.03, risk: 'low' };
  }

  // TODO: 실제 혈통 3대 기반 계산 (pedigree 데이터 연동 후)
  // 현재는 평균 근교계수 반환
  const coefficient = 0.035;
  const risk = coefficient >= 0.0625 ? 'high' : coefficient >= 0.04 ? 'medium' : 'low';
  return { coefficient, risk };
}

// ===========================
// 수정 전 경고 체크
// ===========================

async function checkWarnings(animalId: string): Promise<readonly string[]> {
  const db = getDb();
  const warnings: string[] = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 최근 30일 건강 이벤트 확인 (유방염, 자궁염 등)
  const recentHealth = await db.select({
    eventType: smaxtecEvents.eventType,
    detectedAt: smaxtecEvents.detectedAt,
  })
    .from(smaxtecEvents)
    .where(and(
      eq(smaxtecEvents.animalId, animalId),
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

  // 연속 수정 실패 횟수 확인
  const recentBreedings = await db.select({
    type: breedingEvents.type,
    eventDate: breedingEvents.eventDate,
  })
    .from(breedingEvents)
    .where(eq(breedingEvents.animalId, animalId))
    .orderBy(desc(breedingEvents.eventDate))
    .limit(10);

  let consecutiveFails = 0;
  for (const b of recentBreedings) {
    if (b.type === 'insemination') consecutiveFails++;
    else if (b.type === 'pregnancy_check') break;
  }

  // 최근 임신감정에서 미임신 횟수
  const recentChecks = await db.select({
    result: pregnancyChecks.result,
  })
    .from(pregnancyChecks)
    .where(eq(pregnancyChecks.animalId, animalId))
    .orderBy(desc(pregnancyChecks.checkDate))
    .limit(5);

  const failCount = recentChecks.filter((c) => c.result === 'open' || c.result === 'not_pregnant').length;
  if (failCount >= 3) {
    warnings.push(`🔴 최근 수정 ${failCount}회 연속 미임신 — 번식장애 검진 필요`);
  } else if (failCount >= 2) {
    warnings.push(`🟡 최근 수정 ${failCount}회 미임신 — 수의사 상담 권장`);
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

  // 1. 개체 정보 조회
  const [animal] = await db.select({
    animalId: animals.animalId,
    earTag: animals.earTag,
    farmId: animals.farmId,
    farmName: farms.name,
    breed: animals.breed,
    parity: animals.parity,
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

  // 3. 수정 적기 계산
  const { time: optimalTime, label: optimalLabel } = calculateOptimalTime(heatTime);

  // 4. 수정 전 경고 체크
  const warnings = await checkWarnings(animalId);

  // 5. 목장 보유 정액 조회 (동일 품종만)
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

  // 6. 각 정액에 대해 점수 계산 + 추천 순위
  const recommendations: SemenRecommendation[] = inventory.map((inv) => {
    const traits = inv.genomicTraits as Record<string, number> | null;
    const milkGain = traits?.milk ?? traits?.milkYield ?? null;
    const { coefficient, risk } = estimateInbreeding(animal.breed, inv.bullRegistration, null);

    // 점수: 유량 기여도(40) + 근교 안전(30) + 재고(20) + 가격 효율(10)
    let score = 50; // 기본점

    // 유량 기여도 (±20점)
    if (milkGain != null) {
      score += Math.min(20, Math.max(-10, milkGain / 50));
    }

    // 근교 안전 (0~30점)
    if (risk === 'low') score += 30;
    else if (risk === 'medium') score += 15;
    // high → 0점 추가

    // 재고 충분 (0~10점)
    score += Math.min(10, inv.quantity * 2);

    // 가격 효율
    if (inv.pricePerStraw != null && inv.pricePerStraw < 30000) score += 10;
    else if (inv.pricePerStraw != null && inv.pricePerStraw < 50000) score += 5;

    const reasons: string[] = [];
    if (risk === 'low') reasons.push('근교 위험 낮음');
    if (risk === 'high') reasons.push('⚠️ 근교 위험 높음');
    if (milkGain != null && milkGain > 0) reasons.push(`유량 +${Math.round(milkGain)}kg 기대`);
    if (inv.quantity >= 5) reasons.push(`보유 ${inv.quantity}스트로`);

    return {
      rank: 0,
      semenId: inv.semenId,
      bullName: inv.bullName,
      bullRegistration: inv.bullRegistration,
      breed: inv.breed,
      score: Math.round(score),
      inbreedingRisk: risk,
      estimatedInbreeding: coefficient,
      milkYieldGain: milkGain != null ? Math.round(milkGain) : null,
      reasoning: reasons.join(' · '),
      availableStraws: inv.quantity,
      pricePerStraw: inv.pricePerStraw,
    };
  });

  // 점수순 정렬 + 순위 부여
  const sorted = [...recommendations]
    .sort((a, b) => b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    animalId: animal.animalId,
    earTag: animal.earTag,
    farmId: animal.farmId,
    farmName: animal.farmName ?? '',
    heatDetectedAt: heatTime.toISOString(),
    optimalInseminationTime: optimalTime.toISOString(),
    optimalTimeLabel: optimalLabel,
    warnings,
    recommendations: sorted.slice(0, 5),
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
