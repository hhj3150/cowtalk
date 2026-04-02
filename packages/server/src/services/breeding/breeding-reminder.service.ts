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
// 통합 실행 (오케스트레이터에서 호출)
// ===========================

export async function runBreedingReminders(): Promise<void> {
  logger.info('[BreedingReminder] 번식 리마인더 실행 시작');
  const [pending, repeats] = await Promise.all([
    checkPendingPregnancyTests(),
    checkRepeatBreeders(),
  ]);
  logger.info({
    pregnancyCheckDue: pending.length,
    repeatBreeders: repeats.length,
  }, '[BreedingReminder] 번식 리마인더 완료');
}
