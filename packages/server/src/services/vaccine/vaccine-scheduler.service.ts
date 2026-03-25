// 백신 스케줄 자동 생성 서비스
// 법정 프로토콜 기반으로 미접종 개체의 스케줄을 자동 생성한다.

import { getDb } from '../../config/database.js';
import { vaccineSchedules, vaccineRecords, animals } from '../../db/schema.js';
import { eq, and, inArray, gte, count } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import {
  VACCINE_PROTOCOLS,
  getProtocolsForMonth,
  getRequiredProtocols,
} from '@cowtalk/shared';
import type { VaccineProtocol } from '@cowtalk/shared';

// ===========================
// 타입
// ===========================

export interface ScheduleGenerationResult {
  readonly protocolId: string;
  readonly protocolName: string;
  readonly totalEligible: number;
  readonly alreadyScheduled: number;
  readonly alreadyVaccinated: number;
  readonly newSchedulesCreated: number;
}

export interface GenerateScheduleOptions {
  readonly farmId: string;
  readonly month?: number;          // 미지정 시 현재 월
  readonly year?: number;           // 미지정 시 현재 연
  readonly protocolIds?: readonly string[];  // 미지정 시 해당 월 전체
  readonly createdBy?: string;      // 사용자 ID
}

// ===========================
// 서비스
// ===========================

/**
 * 농장의 법정 백신 스케줄을 자동 생성한다.
 * 이미 접종 완료/스케줄 등록된 개체는 제외한다.
 */
export async function generateVaccineSchedules(
  options: GenerateScheduleOptions,
): Promise<readonly ScheduleGenerationResult[]> {
  const db = getDb();
  const now = new Date();
  const targetMonth = options.month ?? (now.getMonth() + 1);
  const targetYear = options.year ?? now.getFullYear();

  // 해당 월 프로토콜 필터
  const protocols = options.protocolIds?.length
    ? VACCINE_PROTOCOLS.filter((p) => options.protocolIds!.includes(p.id))
    : getProtocolsForMonth(targetMonth);

  if (protocols.length === 0) {
    logger.info({ farmId: options.farmId, month: targetMonth }, '[VaccineScheduler] No protocols for this month');
    return [];
  }

  // 농장 소속 활성 개체 조회
  const farmAnimals = await db
    .select({
      animalId: animals.animalId,
      name: animals.name,
      earTag: animals.earTag,
      sex: animals.sex,
      birthDate: animals.birthDate,
      breed: animals.breed,
      status: animals.status,
    })
    .from(animals)
    .where(and(eq(animals.farmId, options.farmId), eq(animals.status, 'active')));

  if (farmAnimals.length === 0) {
    logger.info({ farmId: options.farmId }, '[VaccineScheduler] No active animals');
    return [];
  }

  const results: ScheduleGenerationResult[] = [];

  for (const protocol of protocols) {
    const result = await generateForProtocol({
      db,
      protocol,
      farmId: options.farmId,
      farmAnimals,
      targetMonth,
      targetYear,
      createdBy: options.createdBy ?? null,
    });
    results.push(result);
  }

  logger.info(
    { farmId: options.farmId, month: targetMonth, results: results.map((r) => ({ id: r.protocolId, created: r.newSchedulesCreated })) },
    '[VaccineScheduler] Schedule generation complete',
  );

  return results;
}

/**
 * 전체 필수 프로토콜 스케줄 생성 (월 무관)
 */
export async function generateRequiredSchedules(
  farmId: string,
  createdBy?: string,
): Promise<readonly ScheduleGenerationResult[]> {
  const required = getRequiredProtocols();
  return generateVaccineSchedules({
    farmId,
    protocolIds: required.map((p) => p.id),
    createdBy,
  });
}

/**
 * 농장별 접종률 계산
 */
export async function calculateVaccinationRate(
  farmId: string,
  protocolId?: string,
): Promise<{
  readonly totalAnimals: number;
  readonly vaccinatedCount: number;
  readonly rate: number;
  readonly byProtocol: readonly { protocolId: string; protocolName: string; vaccinated: number; total: number; rate: number }[];
}> {
  const db = getDb();

  const [totalResult] = await db
    .select({ count: count() })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active')));

  const totalAnimals = totalResult?.count ?? 0;

  // 프로토콜별 접종 현황
  const currentYear = new Date().getFullYear();
  const yearStart = `${String(currentYear)}-01-01`;

  const records = await db
    .select({
      vaccineName: vaccineRecords.vaccineName,
      animalId: vaccineRecords.animalId,
    })
    .from(vaccineRecords)
    .where(
      and(
        eq(vaccineRecords.farmId, farmId),
        gte(vaccineRecords.administeredAt, new Date(yearStart)),
      ),
    );

  // 백신명 → 접종 개체 수 (중복 제거)
  const byVaccine = new Map<string, Set<string>>();
  for (const r of records) {
    const existing = byVaccine.get(r.vaccineName) ?? new Set<string>();
    existing.add(r.animalId);
    byVaccine.set(r.vaccineName, existing);
  }

  const allVaccinatedIds = new Set<string>();
  for (const ids of byVaccine.values()) {
    for (const id of ids) {
      allVaccinatedIds.add(id);
    }
  }

  const byProtocol = VACCINE_PROTOCOLS
    .filter((p) => p.type === 'vaccination')
    .filter((p) => !protocolId || p.id === protocolId)
    .map((p) => {
      const vaccinated = byVaccine.get(p.name)?.size ?? 0;
      return {
        protocolId: p.id,
        protocolName: p.name,
        vaccinated,
        total: totalAnimals,
        rate: totalAnimals > 0 ? Math.round((vaccinated / totalAnimals) * 1000) / 10 : 0,
      };
    });

  return {
    totalAnimals,
    vaccinatedCount: allVaccinatedIds.size,
    rate: totalAnimals > 0 ? Math.round((allVaccinatedIds.size / totalAnimals) * 1000) / 10 : 0,
    byProtocol,
  };
}

// ===========================
// 내부 함수
// ===========================

interface GenerateContext {
  readonly db: ReturnType<typeof getDb>;
  readonly protocol: VaccineProtocol;
  readonly farmId: string;
  readonly farmAnimals: readonly {
    readonly animalId: string;
    readonly name: string | null;
    readonly earTag: string | null;
    readonly sex: string | null;
    readonly birthDate: string | Date | null;
    readonly breed: string | null;
    readonly status: string;
  }[];
  readonly targetMonth: number;
  readonly targetYear: number;
  readonly createdBy: string | null;
}

async function generateForProtocol(ctx: GenerateContext): Promise<ScheduleGenerationResult> {
  const { db, protocol, farmId, farmAnimals, targetMonth, targetYear } = ctx;

  // 대상 개체 필터링
  const eligible = filterEligibleAnimals(farmAnimals, protocol);

  if (eligible.length === 0) {
    return {
      protocolId: protocol.id,
      protocolName: protocol.name,
      totalEligible: 0,
      alreadyScheduled: 0,
      alreadyVaccinated: 0,
      newSchedulesCreated: 0,
    };
  }

  const eligibleIds = eligible.map((a) => a.animalId);

  // 이미 스케줄된 개체 조회
  const existingSchedules = await db
    .select({ animalId: vaccineSchedules.animalId })
    .from(vaccineSchedules)
    .where(
      and(
        eq(vaccineSchedules.farmId, farmId),
        eq(vaccineSchedules.vaccineName, protocol.name),
        inArray(vaccineSchedules.animalId, eligibleIds),
        inArray(vaccineSchedules.status, ['pending', 'completed']),
      ),
    );

  const scheduledSet = new Set(existingSchedules.map((s) => s.animalId));

  // 이미 접종된 개체 조회 (올해)
  const yearStart = new Date(`${String(targetYear)}-01-01`);
  const existingRecords = await db
    .select({ animalId: vaccineRecords.animalId })
    .from(vaccineRecords)
    .where(
      and(
        eq(vaccineRecords.farmId, farmId),
        eq(vaccineRecords.vaccineName, protocol.name),
        inArray(vaccineRecords.animalId, eligibleIds),
        gte(vaccineRecords.administeredAt, yearStart),
      ),
    );

  const vaccinatedSet = new Set(existingRecords.map((r) => r.animalId));

  // 새로 스케줄 생성할 개체
  const needSchedule = eligible.filter(
    (a) => !scheduledSet.has(a.animalId) && !vaccinatedSet.has(a.animalId),
  );

  if (needSchedule.length > 0) {
    // 스케줄 날짜: 해당 월 15일 (기본)
    const scheduledDate = `${String(targetYear)}-${String(targetMonth).padStart(2, '0')}-15`;

    const insertValues = needSchedule.map((a) => ({
      farmId,
      animalId: a.animalId,
      vaccineName: protocol.name,
      scheduledDate,
      status: 'pending' as const,
      notes: `[자동생성] ${protocol.legalBasis}`,
      createdBy: ctx.createdBy,
    }));

    await db.insert(vaccineSchedules).values(insertValues);

    logger.info(
      { farmId, protocol: protocol.id, count: needSchedule.length },
      '[VaccineScheduler] Created new schedules',
    );
  }

  return {
    protocolId: protocol.id,
    protocolName: protocol.name,
    totalEligible: eligible.length,
    alreadyScheduled: scheduledSet.size,
    alreadyVaccinated: vaccinatedSet.size,
    newSchedulesCreated: needSchedule.length,
  };
}

function filterEligibleAnimals(
  farmAnimals: GenerateContext['farmAnimals'],
  protocol: VaccineProtocol,
): GenerateContext['farmAnimals'] {
  const criteria = protocol.targetAnimals;

  return farmAnimals.filter((animal) => {
    // 전두수 대상이면 바로 통과
    if (criteria.allCattle) return true;

    // 성별 필터
    if (criteria.sexFilter) {
      const animalSex = (animal.sex ?? '').toLowerCase();
      if (criteria.sexFilter === 'female' && !['f', 'female', '암', '암소'].includes(animalSex)) {
        return false;
      }
      if (criteria.sexFilter === 'male' && !['m', 'male', '수', '수소'].includes(animalSex)) {
        return false;
      }
    }

    // 월령 필터
    if (criteria.minAgeDays || criteria.maxAgeDays) {
      const birthDate = animal.birthDate ? new Date(String(animal.birthDate)) : null;
      if (!birthDate) return false;

      const ageDays = Math.floor((Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
      if (criteria.minAgeDays && ageDays < criteria.minAgeDays) return false;
      if (criteria.maxAgeDays && ageDays > criteria.maxAgeDays) return false;
    }

    return true;
  });
}
