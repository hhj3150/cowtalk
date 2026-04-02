// 번식 인사이트 서비스 — 4종 분류 리스트
// ① 무발정우 (non-cycling): DIM > 50일, 최근 45일 발정 없음
// ② 불규칙 발정우 (irregular): 발정 주기가 17일 미만 또는 25일 초과
// ③ 유산 의심우 (abortion risk): 임신 확인 후 발정 재감지
// ④ 수정 실패 (repeat breeder): 수정 후 25일 이내 재발정 감지

import { getDb } from '../../config/database.js';
import { animals, farms, smaxtecEvents, breedingEvents, pregnancyChecks } from '../../db/schema.js';
import { eq, and, desc, gte, inArray, isNull } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

const MS_PER_DAY = 86_400_000;

export interface BreedingInsightAnimal {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly parity: number;
  readonly daysInMilk?: number | null;
  readonly detail: string;
}

export interface BreedingInsights {
  readonly nonCycling: readonly BreedingInsightAnimal[];       // 무발정우
  readonly irregularCycle: readonly BreedingInsightAnimal[];   // 불규칙 발정우
  readonly abortionRisk: readonly BreedingInsightAnimal[];     // 유산 의심우
  readonly repeatBreeder: readonly BreedingInsightAnimal[];    // 수정 실패 반복우
}

export async function getBreedingInsights(farmId?: string): Promise<BreedingInsights> {
  const db = getDb();
  const now = new Date();

  // 활성 암소 조회
  const conditions = [eq(animals.status, 'active'), isNull(animals.deletedAt)];
  if (farmId) conditions.push(eq(animals.farmId, farmId));

  const allAnimals = await db.select({
    animalId: animals.animalId,
    earTag: animals.earTag,
    farmId: animals.farmId,
    farmName: farms.name,
    parity: animals.parity,
    daysInMilk: animals.daysInMilk,
    sex: animals.sex,
    lactationStatus: animals.lactationStatus,
  })
    .from(animals)
    .innerJoin(farms, eq(animals.farmId, farms.farmId))
    .where(and(...conditions));

  const femaleAnimals = allAnimals.filter((a) => a.sex !== 'male');
  if (femaleAnimals.length === 0) {
    return { nonCycling: [], irregularCycle: [], abortionRisk: [], repeatBreeder: [] };
  }

  const animalIds = femaleAnimals.map((a) => a.animalId);

  // 최근 60일 발정 이벤트 전체 조회
  const since60d = new Date(now.getTime() - 60 * MS_PER_DAY);
  const since45d = new Date(now.getTime() - 45 * MS_PER_DAY);

  const estrusEvents = await db.select({
    animalId: smaxtecEvents.animalId,
    detectedAt: smaxtecEvents.detectedAt,
    confidence: smaxtecEvents.confidence,
  })
    .from(smaxtecEvents)
    .where(and(
      inArray(smaxtecEvents.animalId, animalIds),
      gte(smaxtecEvents.detectedAt, since60d),
      eq(smaxtecEvents.eventType, 'estrus'),
    ))
    .orderBy(smaxtecEvents.animalId, desc(smaxtecEvents.detectedAt));

  // animalId → estrus events 맵
  const estrusMap = new Map<string, Date[]>();
  for (const e of estrusEvents) {
    if (!estrusMap.has(e.animalId)) estrusMap.set(e.animalId, []);
    estrusMap.get(e.animalId)!.push(e.detectedAt);
  }

  // 최근 수정 기록 조회
  const since90d = new Date(now.getTime() - 90 * MS_PER_DAY);
  const recentInseminations = await db.select({
    animalId: breedingEvents.animalId,
    eventDate: breedingEvents.eventDate,
  })
    .from(breedingEvents)
    .where(and(
      inArray(breedingEvents.animalId, animalIds),
      gte(breedingEvents.eventDate, since90d),
      eq(breedingEvents.type, 'insemination'),
    ))
    .orderBy(breedingEvents.animalId, desc(breedingEvents.eventDate));

  const insemMap = new Map<string, Date[]>();
  for (const e of recentInseminations) {
    if (!insemMap.has(e.animalId)) insemMap.set(e.animalId, []);
    if (e.eventDate) insemMap.get(e.animalId)!.push(e.eventDate);
  }

  // 최근 임신감정 기록 (pregnant 결과만)
  const since120d = new Date(now.getTime() - 120 * MS_PER_DAY);
  const confirmedPregnancies = await db.select({
    animalId: pregnancyChecks.animalId,
    checkDate: pregnancyChecks.checkDate,
  })
    .from(pregnancyChecks)
    .where(and(
      inArray(pregnancyChecks.animalId, animalIds),
      gte(pregnancyChecks.checkDate, since120d),
      eq(pregnancyChecks.result, 'pregnant'),
    ))
    .orderBy(pregnancyChecks.animalId, desc(pregnancyChecks.checkDate));

  const pregnantMap = new Map<string, Date>();
  for (const p of confirmedPregnancies) {
    if (!pregnantMap.has(p.animalId) && p.checkDate) {
      pregnantMap.set(p.animalId, p.checkDate);
    }
  }

  // ─── ① 무발정우 (non-cycling) ───
  const nonCycling: BreedingInsightAnimal[] = [];
  for (const a of femaleAnimals) {
    const dim = a.daysInMilk ?? 0;
    if (dim < 50) continue; // DIM 50일 미만은 제외
    if (a.lactationStatus === 'dry') continue; // 건유우 제외
    if (pregnantMap.has(a.animalId)) continue; // 임신 확인우 제외

    const recentEstrus = (estrusMap.get(a.animalId) ?? []).filter((d) => d >= since45d);
    if (recentEstrus.length === 0) {
      nonCycling.push({
        animalId: a.animalId,
        earTag: a.earTag,
        farmId: a.farmId,
        farmName: a.farmName ?? '',
        parity: a.parity ?? 0,
        daysInMilk: dim,
        detail: `DIM ${dim}일 — 최근 45일 발정 미감지`,
      });
    }
  }

  // ─── ② 불규칙 발정우 (irregular cycle) ───
  const irregularCycle: BreedingInsightAnimal[] = [];
  for (const a of femaleAnimals) {
    const estrusList = estrusMap.get(a.animalId) ?? [];
    if (estrusList.length < 2) continue;

    // 연속 발정 간격 계산
    const sorted = [...estrusList].sort((x, y) => x.getTime() - y.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i]!.getTime() - sorted[i - 1]!.getTime()) / MS_PER_DAY;
      gaps.push(Math.round(gap));
    }

    const irregular = gaps.filter((g) => g < 17 || g > 25);
    if (irregular.length > 0) {
      irregularCycle.push({
        animalId: a.animalId,
        earTag: a.earTag,
        farmId: a.farmId,
        farmName: a.farmName ?? '',
        parity: a.parity ?? 0,
        daysInMilk: a.daysInMilk,
        detail: `발정 주기 이상: ${gaps.map((g) => `${g}일`).join(', ')} (정상 18~24일)`,
      });
    }
  }

  // ─── ③ 유산 의심우 (abortion risk) ───
  const abortionRisk: BreedingInsightAnimal[] = [];
  for (const a of femaleAnimals) {
    const confirmedDate = pregnantMap.get(a.animalId);
    if (!confirmedDate) continue;

    // 임신 확인 이후 발정 재감지 여부
    const postPregnancyEstrus = (estrusMap.get(a.animalId) ?? []).filter(
      (d) => d > confirmedDate,
    );

    if (postPregnancyEstrus.length > 0) {
      const latestEstrus = postPregnancyEstrus[0]!;
      const daysSinceConfirm = Math.round(
        (latestEstrus.getTime() - confirmedDate.getTime()) / MS_PER_DAY,
      );
      abortionRisk.push({
        animalId: a.animalId,
        earTag: a.earTag,
        farmId: a.farmId,
        farmName: a.farmName ?? '',
        parity: a.parity ?? 0,
        daysInMilk: a.daysInMilk,
        detail: `임신확인 ${daysSinceConfirm}일 후 발정 재감지 — 유산 의심`,
      });
    }
  }

  // ─── ④ 수정 실패 반복우 (repeat breeder) ───
  const repeatBreeder: BreedingInsightAnimal[] = [];
  for (const a of femaleAnimals) {
    const inseminations = insemMap.get(a.animalId) ?? [];
    if (inseminations.length === 0) continue;

    const latestInsem = inseminations[0]!; // 가장 최근 수정
    const postInsemEstrus = (estrusMap.get(a.animalId) ?? []).filter((d) => {
      const diff = (d.getTime() - latestInsem.getTime()) / MS_PER_DAY;
      return diff > 3 && diff <= 25; // 수정 3~25일 사이 재발정
    });

    if (postInsemEstrus.length > 0) {
      const daysAfter = Math.round(
        (postInsemEstrus[0]!.getTime() - latestInsem.getTime()) / MS_PER_DAY,
      );
      repeatBreeder.push({
        animalId: a.animalId,
        earTag: a.earTag,
        farmId: a.farmId,
        farmName: a.farmName ?? '',
        parity: a.parity ?? 0,
        daysInMilk: a.daysInMilk,
        detail: `수정 ${daysAfter}일 후 재발정 — 수정 실패 의심`,
      });
    }
  }

  logger.info({
    farmId,
    nonCycling: nonCycling.length,
    irregularCycle: irregularCycle.length,
    abortionRisk: abortionRisk.length,
    repeatBreeder: repeatBreeder.length,
  }, '[BreedingInsights] 조회 완료');

  return { nonCycling, irregularCycle, abortionRisk, repeatBreeder };
}
