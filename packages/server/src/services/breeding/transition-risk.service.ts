// 전환기 위험우 서비스
// 분만 50일 전 ~ 분만 후 30일 = "전환기(Transition Period)"
// 이 시기 성우 질병의 75%가 발생 → 조기 감지가 핵심
//
// 위험우 분류:
// ① pre_calving: 건유우 중 예정 분만 50일 이내 (건유 기록의 expectedCalvingDate 기준)
// ② post_calving: 분만 후 30일 이내 (calving_events 기반)
// ③ health_alert: 전환기 내 건강 이상 이벤트 발생

import { getDb } from '../../config/database.js';
import { animals, farms, calvingEvents, dryOffRecords, smaxtecEvents } from '../../db/schema.js';
import { eq, and, gte, lte, desc, inArray, isNull } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

const MS_PER_DAY = 86_400_000;

export type TransitionRiskLevel = 'high' | 'medium' | 'low';
export type TransitionPhase = 'pre_calving' | 'post_calving';

export interface TransitionAnimal {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly parity: number;
  readonly phase: TransitionPhase;
  readonly riskLevel: TransitionRiskLevel;
  readonly daysToCalving?: number;   // pre_calving
  readonly daysSinceCalving?: number; // post_calving
  readonly calvingDate?: string;
  readonly expectedCalvingDate?: string;
  readonly healthAlerts: number;     // 전환기 내 건강 이벤트 수
  readonly detail: string;
}

export interface TransitionRiskData {
  readonly preCalving: readonly TransitionAnimal[];
  readonly postCalving: readonly TransitionAnimal[];
  readonly totalAtRisk: number;
}

export async function getTransitionRisk(farmId?: string): Promise<TransitionRiskData> {
  const db = getDb();
  const now = new Date();

  // 활성 암소 조회
  const animalConditions = [eq(animals.status, 'active'), isNull(animals.deletedAt)];
  if (farmId) animalConditions.push(eq(animals.farmId, farmId));

  const allAnimals = await db.select({
    animalId: animals.animalId,
    earTag: animals.earTag,
    farmId: animals.farmId,
    farmName: farms.name,
    parity: animals.parity,
    lactationStatus: animals.lactationStatus,
    sex: animals.sex,
  })
    .from(animals)
    .innerJoin(farms, eq(animals.farmId, farms.farmId))
    .where(and(...animalConditions));

  const femaleAnimals = allAnimals.filter((a) => a.sex !== 'male');
  if (femaleAnimals.length === 0) return { preCalving: [], postCalving: [], totalAtRisk: 0 };

  const animalIds = femaleAnimals.map((a) => a.animalId);

  // ─── pre-calving: 건유 기록에서 예정 분만일이 50일 이내인 소 ───
  const in50Days = new Date(now.getTime() + 50 * MS_PER_DAY);

  const dryOffRows = await db.select({
    animalId: dryOffRecords.animalId,
    expectedCalvingDate: dryOffRecords.expectedCalvingDate,
  })
    .from(dryOffRecords)
    .where(and(
      inArray(dryOffRecords.animalId, animalIds),
      lte(dryOffRecords.expectedCalvingDate, in50Days.toISOString().slice(0, 10)),
      gte(dryOffRecords.expectedCalvingDate, now.toISOString().slice(0, 10)),
    ));

  // 최근 분만 이벤트 (30일 이내)
  const since30d = new Date(now.getTime() - 30 * MS_PER_DAY);
  const recentCalvings = await db.select({
    animalId: calvingEvents.animalId,
    calvingDate: calvingEvents.calvingDate,
    complications: calvingEvents.complications,
  })
    .from(calvingEvents)
    .where(and(
      inArray(calvingEvents.animalId, animalIds),
      gte(calvingEvents.calvingDate, since30d),
    ))
    .orderBy(calvingEvents.animalId, desc(calvingEvents.calvingDate));

  // 전환기 내 건강 이벤트 (최근 60일)
  const since60d = new Date(now.getTime() - 60 * MS_PER_DAY);
  const healthAlertRows = await db.select({
    animalId: smaxtecEvents.animalId,
    eventType: smaxtecEvents.eventType,
    severity: smaxtecEvents.severity,
  })
    .from(smaxtecEvents)
    .where(and(
      inArray(smaxtecEvents.animalId, animalIds),
      gte(smaxtecEvents.detectedAt, since60d),
      inArray(smaxtecEvents.eventType, ['health_warning', 'clinical_condition', 'temperature_high', 'rumination_decrease']),
    ));

  const healthAlertMap = new Map<string, number>();
  for (const h of healthAlertRows) {
    healthAlertMap.set(h.animalId, (healthAlertMap.get(h.animalId) ?? 0) + 1);
  }

  // 개체 맵
  const animalMap = new Map(femaleAnimals.map((a) => [a.animalId, a]));

  // ─── pre-calving 목록 ───
  const preCalving: TransitionAnimal[] = [];
  for (const row of dryOffRows) {
    const a = animalMap.get(row.animalId);
    if (!a) continue;
    const expected = row.expectedCalvingDate ? new Date(row.expectedCalvingDate) : null;
    if (!expected) continue;
    const daysTo = Math.round((expected.getTime() - now.getTime()) / MS_PER_DAY);
    const alerts = healthAlertMap.get(row.animalId) ?? 0;
    const riskLevel: TransitionRiskLevel = daysTo <= 14 ? 'high' : daysTo <= 30 ? 'medium' : 'low';
    preCalving.push({
      animalId: a.animalId,
      earTag: a.earTag,
      farmId: a.farmId,
      farmName: a.farmName ?? '',
      parity: a.parity ?? 0,
      phase: 'pre_calving',
      riskLevel,
      daysToCalving: daysTo,
      expectedCalvingDate: row.expectedCalvingDate ?? undefined,
      healthAlerts: alerts,
      detail: `분만 ${daysTo}일 전${alerts > 0 ? ` · 건강 이상 ${alerts}건` : ''}`,
    });
  }

  // ─── post-calving 목록 ───
  const seenPostCalving = new Set<string>();
  const postCalving: TransitionAnimal[] = [];
  for (const row of recentCalvings) {
    if (seenPostCalving.has(row.animalId)) continue;
    seenPostCalving.add(row.animalId);
    const a = animalMap.get(row.animalId);
    if (!a) continue;
    const daysSince = Math.round((now.getTime() - row.calvingDate.getTime()) / MS_PER_DAY);
    const alerts = healthAlertMap.get(row.animalId) ?? 0;
    const riskLevel: TransitionRiskLevel = (alerts > 0 || daysSince <= 7) ? 'high' : daysSince <= 14 ? 'medium' : 'low';
    postCalving.push({
      animalId: a.animalId,
      earTag: a.earTag,
      farmId: a.farmId,
      farmName: a.farmName ?? '',
      parity: a.parity ?? 0,
      phase: 'post_calving',
      riskLevel,
      daysSinceCalving: daysSince,
      calvingDate: row.calvingDate.toISOString(),
      healthAlerts: alerts,
      detail: `분만 ${daysSince}일 경과${row.complications ? ` · ${row.complications}` : ''}${alerts > 0 ? ` · 건강 이상 ${alerts}건` : ''}`,
    });
  }

  // 위험도 기준 정렬 (high > medium > low, 일수 오름차순)
  const riskOrder = { high: 0, medium: 1, low: 2 };
  preCalving.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || (a.daysToCalving ?? 99) - (b.daysToCalving ?? 99));
  postCalving.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || (a.daysSinceCalving ?? 99) - (b.daysSinceCalving ?? 99));

  const totalAtRisk = preCalving.length + postCalving.length;
  logger.info({ farmId, preCalving: preCalving.length, postCalving: postCalving.length }, '[TransitionRisk] 조회 완료');

  return { preCalving, postCalving, totalAtRisk };
}
