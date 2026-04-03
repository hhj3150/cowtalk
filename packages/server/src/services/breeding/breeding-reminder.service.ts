// 번식 리마인더 서비스 — 임신감정 알림 + 반복번식우 감지
// 오케스트레이터 batch cycle(24h)에서 호출
// 알림: alerts 테이블 + Socket.IO emit

import { getDb } from '../../config/database.js';
import {
  animals, farms, breedingEvents, pregnancyChecks, alerts,
} from '../../db/schema.js';
import { eq, and, desc, gte, sql, isNull } from 'drizzle-orm';
import { getFarmBreedingSettings } from './farm-settings-sync.service.js';
import { logger } from '../../lib/logger.js';

const MS_PER_DAY = 86_400_000;

// ===========================
// 1. 임신감정 리마인더
// ===========================

interface PendingCheck {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly inseminationDate: Date;
  readonly daysSinceInsemination: number;
  readonly pregnancyCheckDays: number;
}

/**
 * 수정 후 N일(목장설정 pregnancyCheckDays) 경과했지만
 * 아직 임신감정이 등록되지 않은 개체를 찾아 알림 생성
 */
export async function checkPendingPregnancyTests(): Promise<readonly PendingCheck[]> {
  const db = getDb();
  const now = new Date();
  const pending: PendingCheck[] = [];

  try {
    // 최근 120일 이내 수정 기록이 있는 개체
    const cutoffDate = new Date(now.getTime() - 120 * MS_PER_DAY);

    const inseminations = await db
      .select({
        animalId: breedingEvents.animalId,
        farmId: breedingEvents.farmId,
        eventDate: breedingEvents.eventDate,
        earTag: animals.earTag,
        farmName: farms.name,
      })
      .from(breedingEvents)
      .innerJoin(animals, eq(breedingEvents.animalId, animals.animalId))
      .innerJoin(farms, eq(breedingEvents.farmId, farms.farmId))
      .where(and(
        eq(breedingEvents.type, 'insemination'),
        gte(breedingEvents.eventDate, cutoffDate),
        eq(animals.status, 'active'),
        isNull(animals.deletedAt),
      ))
      .orderBy(desc(breedingEvents.eventDate));

    // 개체별 최신 수정만 남기기
    const latestByAnimal = new Map<string, typeof inseminations[0]>();
    for (const row of inseminations) {
      if (!latestByAnimal.has(row.animalId)) {
        latestByAnimal.set(row.animalId, row);
      }
    }

    for (const [animalId, insem] of latestByAnimal) {
      if (!insem.farmId) continue; // farmId 없으면 스킵
      const farmId = insem.farmId;
      const daysSince = Math.floor((now.getTime() - insem.eventDate.getTime()) / MS_PER_DAY);
      const settings = await getFarmBreedingSettings(farmId);
      const checkDays = settings.pregnancyCheckDays ?? 28;

      // 아직 감정 시기가 안 됐으면 스킵
      if (daysSince < checkDays) continue;

      // 이미 임신감정이 있는지 확인
      const existingChecks = await db
        .select({ checkId: pregnancyChecks.checkId })
        .from(pregnancyChecks)
        .where(and(
          eq(pregnancyChecks.animalId, animalId),
          gte(pregnancyChecks.checkDate, insem.eventDate),
        ))
        .limit(1);

      if (existingChecks.length > 0) continue;

      pending.push({
        animalId,
        earTag: insem.earTag,
        farmId,
        farmName: insem.farmName,
        inseminationDate: insem.eventDate,
        daysSinceInsemination: daysSince,
        pregnancyCheckDays: checkDays,
      });
    }

    // 알림 생성
    for (const item of pending) {
      const dedupKey = `preg-check-${item.animalId}-${item.inseminationDate.toISOString().split('T')[0]}`;
      const overdue = item.daysSinceInsemination - item.pregnancyCheckDays;
      const priority = overdue >= 14 ? 'high' : 'medium';

      try {
        await db.insert(alerts).values({
          alertType: 'pregnancy_check_due',
          animalId: item.animalId,
          farmId: item.farmId,
          priority,
          title: `🔵 임신감정 필요 — #${item.earTag}`,
          explanation: `${item.farmName} · 수정 후 ${String(item.daysSinceInsemination)}일 경과 (기준 ${String(item.pregnancyCheckDays)}일)`,
          recommendedAction: `초음파 임신감정을 실시하세요. 수정일: ${item.inseminationDate.toLocaleDateString('ko-KR')}`,
          dedupKey,
        }).onConflictDoNothing();
      } catch {
        // 중복 키 등 무시
      }
    }

    if (pending.length > 0) {
      logger.info({ count: pending.length }, '[BreedingReminder] 임신감정 리마인더 생성');
    }

    return pending;
  } catch (error) {
    logger.error({ error }, '[BreedingReminder] 임신감정 체크 실패');
    return [];
  }
}

// ===========================
// 2. 반복번식우 감지
// ===========================

interface RepeatBreeder {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly inseminationCount: number;
  readonly pregnantCount: number;
}

/**
 * 3회 이상 수정했지만 임신 성공이 없는 개체를 감지
 */
export async function checkRepeatBreeders(): Promise<readonly RepeatBreeder[]> {
  const db = getDb();
  const repeats: RepeatBreeder[] = [];

  try {
    // 최근 365일 이내 수정 기록이 있는 활성 개체
    const cutoff = new Date(Date.now() - 365 * MS_PER_DAY);

    const results = await db.execute(sql`
      SELECT
        be.animal_id,
        a.ear_tag,
        be.farm_id,
        f.name as farm_name,
        COUNT(*)::int as insem_count,
        COALESCE(
          (SELECT COUNT(*)::int FROM pregnancy_checks pc
           WHERE pc.animal_id = be.animal_id
             AND pc.result = 'pregnant'
             AND pc.check_date >= ${cutoff}),
          0
        ) as pregnant_count
      FROM breeding_events be
      JOIN animals a ON a.animal_id = be.animal_id
      JOIN farms f ON f.farm_id = be.farm_id
      WHERE be.type = 'insemination'
        AND be.event_date >= ${cutoff}
        AND a.status = 'active'
        AND a.deleted_at IS NULL
      GROUP BY be.animal_id, a.ear_tag, be.farm_id, f.name
      HAVING COUNT(*) >= 3
    `);

    const rows = results as unknown as Array<{
      animal_id: string;
      ear_tag: string;
      farm_id: string;
      farm_name: string;
      insem_count: number;
      pregnant_count: number;
    }>;

    for (const row of rows) {
      if (row.pregnant_count > 0) continue; // 한 번이라도 성공하면 제외

      repeats.push({
        animalId: row.animal_id,
        earTag: row.ear_tag,
        farmId: row.farm_id,
        farmName: row.farm_name,
        inseminationCount: row.insem_count,
        pregnantCount: row.pregnant_count,
      });

      const dedupKey = `repeat-breeder-${row.animal_id}-${new Date().toISOString().split('T')[0]}`;

      try {
        await db.insert(alerts).values({
          alertType: 'repeat_breeder_warning',
          animalId: row.animal_id,
          farmId: row.farm_id,
          priority: row.insem_count >= 5 ? 'critical' : 'high',
          title: `⚠️ 반복번식우 — #${row.ear_tag}`,
          explanation: `${row.farm_name} · ${String(row.insem_count)}회 수정, 0회 임신 · 수의사 정밀 검진 권장`,
          recommendedAction: `번식장애 정밀 검진을 실시하세요. 자궁 내막염, 난소 기능 이상, 정액 적합성 등을 확인하세요.`,
          dedupKey,
        }).onConflictDoNothing();
      } catch {
        // 중복 키 등 무시
      }
    }

    if (repeats.length > 0) {
      logger.info({ count: repeats.length }, '[BreedingReminder] 반복번식우 감지');
    }

    return repeats;
  } catch (error) {
    logger.error({ error }, '[BreedingReminder] 반복번식우 체크 실패');
    return [];
  }
}

// ===========================
// 3. 건유 리마인더
// ===========================

/**
 * 분만 예정일 기준 건유 시기(dryOffBeforeCalvingDays)에 도달한 착유우를 찾아 알림
 * 조건: 임신 확인 + 분만예정일 - 건유기준일 <= 오늘 + 7일 (일주일 여유)
 */
async function checkDryOffReminders(): Promise<number> {
  const db = getDb();
  const now = new Date();
  let created = 0;

  try {
    // 임신 확인된 활성 착유우
    const pregnantAnimals = await db.execute(sql`
      SELECT DISTINCT ON (pc.animal_id)
        pc.animal_id,
        a.ear_tag,
        a.farm_id,
        a.lactation_status,
        f.name as farm_name,
        be.event_date as insem_date,
        pc.check_date as preg_confirmed_date
      FROM pregnancy_checks pc
      JOIN animals a ON a.animal_id = pc.animal_id
      JOIN farms f ON f.farm_id = a.farm_id
      LEFT JOIN breeding_events be ON be.animal_id = pc.animal_id
        AND be.type = 'insemination'
        AND be.event_date <= pc.check_date
      WHERE pc.result = 'pregnant'
        AND a.status = 'active'
        AND a.deleted_at IS NULL
        AND a.lactation_status = 'milking'
      ORDER BY pc.animal_id, pc.check_date DESC
    `);

    const rows = pregnantAnimals as unknown as Array<{
      animal_id: string;
      ear_tag: string;
      farm_id: string;
      lactation_status: string;
      farm_name: string;
      insem_date: Date | null;
      preg_confirmed_date: Date;
    }>;

    for (const row of rows) {
      if (!row.farm_id || !row.insem_date) continue;

      const settings = await getFarmBreedingSettings(row.farm_id);
      const gestationDays = settings.gestationDays ?? 280;
      const dryOffBefore = settings.dryOffBeforeCalvingDays ?? 90;

      const expectedCalving = new Date(row.insem_date.getTime() + gestationDays * MS_PER_DAY);
      const dryOffDate = new Date(expectedCalving.getTime() - dryOffBefore * MS_PER_DAY);
      const daysUntilDryOff = Math.floor((dryOffDate.getTime() - now.getTime()) / MS_PER_DAY);

      // 건유 시기가 7일 이내이거나 이미 지남
      if (daysUntilDryOff > 7) continue;

      const dedupKey = `dry-off-${row.animal_id}-${expectedCalving.toISOString().split('T')[0]}`;
      const priority = daysUntilDryOff <= 0 ? 'high' : 'medium';

      try {
        const [inserted] = await db.insert(alerts).values({
          alertType: 'dry_off_reminder',
          animalId: row.animal_id,
          farmId: row.farm_id,
          priority,
          title: `🟡 건유 시기 — #${row.ear_tag}`,
          explanation: `${row.farm_name} · 분만예정 ${expectedCalving.toLocaleDateString('ko-KR')} · ${daysUntilDryOff <= 0 ? '건유 시기 경과' : `건유까지 ${String(daysUntilDryOff)}일`}`,
          recommendedAction: `건유 처리를 실시하세요. 분만 ${String(dryOffBefore)}일 전 건유가 권장됩니다.`,
          dedupKey,
        }).onConflictDoNothing().returning({ alertId: alerts.alertId });

        if (inserted) created++;
      } catch {
        // 중복 무시
      }
    }

    if (created > 0) {
      logger.info({ count: created }, '[BreedingReminder] 건유 리마인더 생성');
    }
    return created;
  } catch (error) {
    logger.error({ error }, '[BreedingReminder] 건유 리마인더 체크 실패');
    return 0;
  }
}

// ===========================
// 4. 분만 임박 알림
// ===========================

/**
 * 분만 예정일이 7일 이내인 개체를 찾아 알림
 */
async function checkCalvingImminent(): Promise<number> {
  const db = getDb();
  const now = new Date();
  let created = 0;

  try {
    const pregnantAnimals = await db.execute(sql`
      SELECT DISTINCT ON (pc.animal_id)
        pc.animal_id,
        a.ear_tag,
        a.farm_id,
        f.name as farm_name,
        be.event_date as insem_date
      FROM pregnancy_checks pc
      JOIN animals a ON a.animal_id = pc.animal_id
      JOIN farms f ON f.farm_id = a.farm_id
      LEFT JOIN breeding_events be ON be.animal_id = pc.animal_id
        AND be.type = 'insemination'
        AND be.event_date <= pc.check_date
      WHERE pc.result = 'pregnant'
        AND a.status = 'active'
        AND a.deleted_at IS NULL
      ORDER BY pc.animal_id, pc.check_date DESC
    `);

    const rows = pregnantAnimals as unknown as Array<{
      animal_id: string;
      ear_tag: string;
      farm_id: string;
      farm_name: string;
      insem_date: Date | null;
    }>;

    for (const row of rows) {
      if (!row.farm_id || !row.insem_date) continue;

      const settings = await getFarmBreedingSettings(row.farm_id);
      const gestationDays = settings.gestationDays ?? 280;
      const expectedCalving = new Date(row.insem_date.getTime() + gestationDays * MS_PER_DAY);
      const daysUntilCalving = Math.floor((expectedCalving.getTime() - now.getTime()) / MS_PER_DAY);

      if (daysUntilCalving > 7 || daysUntilCalving < -3) continue;

      const dedupKey = `calving-imminent-${row.animal_id}-${expectedCalving.toISOString().split('T')[0]}`;
      const priority = daysUntilCalving <= 1 ? 'critical' : 'high';

      try {
        const [inserted] = await db.insert(alerts).values({
          alertType: 'calving_imminent',
          animalId: row.animal_id,
          farmId: row.farm_id,
          priority,
          title: `🔴 분만 임박 — #${row.ear_tag}`,
          explanation: `${row.farm_name} · 분만예정 ${expectedCalving.toLocaleDateString('ko-KR')} · ${daysUntilCalving <= 0 ? '분만 예정일 경과' : `${String(daysUntilCalving)}일 후`}`,
          recommendedAction: `분만 준비를 완료하세요. 분만실 이동, 산욕열 예방약 준비, 난산 대비 수의사 연락처를 확인하세요.`,
          dedupKey,
        }).onConflictDoNothing().returning({ alertId: alerts.alertId });

        if (inserted) created++;
      } catch {
        // 중복 무시
      }
    }

    if (created > 0) {
      logger.info({ count: created }, '[BreedingReminder] 분만 임박 알림 생성');
    }
    return created;
  } catch (error) {
    logger.error({ error }, '[BreedingReminder] 분만 임박 체크 실패');
    return 0;
  }
}

// ===========================
// 5. 장기공태우 알림
// ===========================

/**
 * DIM(착유일수)이 longOpenDaysDim(기본 200일)을 초과하면서
 * 수정 기록이 없거나 임신이 확인되지 않은 개체를 감지
 */
async function checkLongOpenDays(): Promise<number> {
  const db = getDb();
  const now = new Date();
  let created = 0;

  try {
    // DIM이 높은 활성 착유우
    const highDimAnimals = await db
      .select({
        animalId: animals.animalId,
        earTag: animals.earTag,
        farmId: animals.farmId,
        daysInMilk: animals.daysInMilk,
        farmName: farms.name,
      })
      .from(animals)
      .innerJoin(farms, eq(animals.farmId, farms.farmId))
      .where(and(
        eq(animals.status, 'active'),
        isNull(animals.deletedAt),
        eq(animals.lactationStatus, 'milking'),
        gte(animals.daysInMilk, 150), // 초기 필터 (세팅별로 재검사)
      ));

    for (const animal of highDimAnimals) {
      if (!animal.farmId || !animal.daysInMilk) continue;

      const settings = await getFarmBreedingSettings(animal.farmId);
      const longOpenDays = settings.longOpenDaysDim ?? 200;

      if (animal.daysInMilk < longOpenDays) continue;

      // 이미 임신 확인된 경우 스킵
      const recentPreg = await db
        .select({ checkId: pregnancyChecks.checkId })
        .from(pregnancyChecks)
        .where(and(
          eq(pregnancyChecks.animalId, animal.animalId),
          eq(pregnancyChecks.result, 'pregnant'),
          gte(pregnancyChecks.checkDate, new Date(now.getTime() - 120 * MS_PER_DAY)),
        ))
        .limit(1);

      if (recentPreg.length > 0) continue;

      const dedupKey = `long-open-${animal.animalId}-${now.toISOString().split('T')[0]?.slice(0, 7)}`; // 월 단위 dedup

      try {
        const [inserted] = await db.insert(alerts).values({
          alertType: 'long_open_days',
          animalId: animal.animalId,
          farmId: animal.farmId,
          priority: animal.daysInMilk >= 250 ? 'high' : 'medium',
          title: `🟠 장기공태우 — #${animal.earTag}`,
          explanation: `${animal.farmName} · 착유 ${String(animal.daysInMilk)}일 · 임신 미확인 (기준 ${String(longOpenDays)}일)`,
          recommendedAction: `번식 상태를 점검하세요. 발정 재관찰, 수의사 번식장애 검진, 또는 도태 검토가 필요합니다.`,
          dedupKey,
        }).onConflictDoNothing().returning({ alertId: alerts.alertId });

        if (inserted) created++;
      } catch {
        // 중복 무시
      }
    }

    if (created > 0) {
      logger.info({ count: created }, '[BreedingReminder] 장기공태우 알림 생성');
    }
    return created;
  } catch (error) {
    logger.error({ error }, '[BreedingReminder] 장기공태우 체크 실패');
    return 0;
  }
}

// ===========================
// 통합 실행 (오케스트레이터에서 호출)
// ===========================

export async function runBreedingReminders(): Promise<void> {
  logger.info('[BreedingReminder] 번식 리마인더 실행 시작');
  const [pending, repeats, dryOff, calving, longOpen] = await Promise.all([
    checkPendingPregnancyTests(),
    checkRepeatBreeders(),
    checkDryOffReminders(),
    checkCalvingImminent(),
    checkLongOpenDays(),
  ]);
  logger.info({
    pregnancyCheckDue: pending.length,
    repeatBreeders: repeats.length,
    dryOffReminders: dryOff,
    calvingImminent: calving,
    longOpenDays: longOpen,
  }, '[BreedingReminder] 번식 리마인더 완료');
}
