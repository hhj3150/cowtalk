// smaXtec → DB 동기화 서비스
// organisations → farms, animals → animals, events → smaxtec_events
// Upsert 패턴: external_id로 조회 → 있으면 UPDATE, 없으면 INSERT

import { getDb } from '../config/database.js';
import { farms, animals, regions, smaxtecEvents } from '../db/schema.js';
import { captureBeforeSnapshot } from '../services/sovereign-alarm/snapshot/snapshot.service.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import type { SmaxtecOrganisation, SmaxtecAnimal, SmaxtecRawEvent } from './connectors/smaxtec.connector.js';
import type { SmaxtecFetchData } from './connectors/smaxtec.connector.js';
import { normalizeSmaxtecEvent } from './normalization.js';

// ===========================
// 동기화 결과
// ===========================

export interface SyncResult {
  readonly farmsCreated: number;
  readonly farmsUpdated: number;
  readonly animalsCreated: number;
  readonly animalsUpdated: number;
  readonly eventsStored: number;
  readonly errors: readonly string[];
  readonly syncedAt: Date;
}

// ===========================
// 기본 리전 보장
// ===========================

let defaultRegionId: string | null = null;

async function ensureDefaultRegion(): Promise<string> {
  if (defaultRegionId) return defaultRegionId;

  const db = getDb();
  const existing = await db
    .select()
    .from(regions)
    .where(eq(regions.code, 'SMAXTEC'));

  if (existing[0]) {
    defaultRegionId = existing[0].regionId;
    return defaultRegionId;
  }

  const [row] = await db
    .insert(regions)
    .values({
      province: '전국',
      district: 'smaXtec 연동',
      code: 'SMAXTEC',
    })
    .returning();

  if (!row) throw new Error('Failed to create default region');
  defaultRegionId = row.regionId;
  return defaultRegionId;
}

// ===========================
// 농장 동기화 (org → farm)
// ===========================

async function syncFarms(
  orgs: readonly SmaxtecOrganisation[],
): Promise<{ created: number; updated: number; farmMap: ReadonlyMap<string, string> }> {
  const db = getDb();
  const regionId = await ensureDefaultRegion();
  const farmMap = new Map<string, string>();
  let created = 0;
  let updated = 0;

  // 기존 farms에서 smaXtec external_id 매핑 로드
  const externalIds = orgs.map((o) => o.organisation_id);
  const existingFarms = await db
    .select({ farmId: farms.farmId, externalId: farms.externalId })
    .from(farms)
    .where(inArray(farms.externalId, externalIds));

  const existingMap = new Map(
    existingFarms
      .filter((f): f is { farmId: string; externalId: string } => f.externalId !== null)
      .map((f) => [f.externalId, f.farmId]),
  );

  // 배치 처리 (50개씩)
  const BATCH_SIZE = 50;
  for (let i = 0; i < orgs.length; i += BATCH_SIZE) {
    const batch = orgs.slice(i, i + BATCH_SIZE);

    for (const org of batch) {
      try {
        const existingFarmId = existingMap.get(org.organisation_id);

        if (existingFarmId) {
          // Update
          await db
            .update(farms)
            .set({
              name: org.name || org.organisation_id,
              updatedAt: new Date(),
            })
            .where(eq(farms.farmId, existingFarmId));

          farmMap.set(org.organisation_id, existingFarmId);
          updated++;
        } else {
          // Insert
          const farmName = org.name || `Farm-${org.organisation_id.slice(0, 8)}`;
          const [row] = await db
            .insert(farms)
            .values({
              externalId: org.organisation_id,
              regionId,
              name: farmName,
              address: extractAddress(org.name),
              lat: 36.5,  // 한국 중심 기본값
              lng: 127.5,
              capacity: 0,
              currentHeadCount: 0,
              status: 'active',
            })
            .returning();

          if (row) {
            farmMap.set(org.organisation_id, row.farmId);
            created++;
          }
        }
      } catch (error) {
        logger.error(
          { orgId: org.organisation_id, err: error },
          `[Sync] Failed to sync farm ${org.name}`,
        );
      }
    }
  }

  logger.info({ created, updated }, `[Sync] Farms: ${String(created)} created, ${String(updated)} updated`);
  return { created, updated, farmMap };
}

// ===========================
// 동물 동기화 (smaXtec animal → animal)
// ===========================

async function syncAnimals(
  smaxtecAnimals: readonly SmaxtecAnimal[],
  farmMap: ReadonlyMap<string, string>,
): Promise<{ created: number; updated: number; animalMap: ReadonlyMap<string, string> }> {
  const db = getDb();
  const animalMap = new Map<string, string>();
  let created = 0;
  let updated = 0;

  // 기존 animals에서 external_id 매핑 로드
  const externalIds = smaxtecAnimals.map((a) => a._id ?? a.animal_id ?? '');

  // 배치로 로드 (500개씩)
  const LOAD_BATCH = 500;
  const existingMap = new Map<string, string>();
  for (let i = 0; i < externalIds.length; i += LOAD_BATCH) {
    const batch = externalIds.slice(i, i + LOAD_BATCH);
    const existing = await db
      .select({ animalId: animals.animalId, externalId: animals.externalId })
      .from(animals)
      .where(inArray(animals.externalId, batch));

    for (const a of existing) {
      if (a.externalId) {
        existingMap.set(a.externalId, a.animalId);
      }
    }
  }

  // 배치 처리 (100개씩)
  const BATCH_SIZE = 100;
  for (let i = 0; i < smaxtecAnimals.length; i += BATCH_SIZE) {
    const batch = smaxtecAnimals.slice(i, i + BATCH_SIZE);

    for (const sa of batch) {
      const extId = sa._id ?? sa.animal_id ?? '';
      const farmId = farmMap.get(sa.organisation_id);

      if (!farmId) {
        continue; // 매핑되지 않은 org
      }

      try {
        const existingAnimalId = existingMap.get(extId);

        if (existingAnimalId) {
          // Update
          await db
            .update(animals)
            .set({
              name: sa.name ?? sa.display_name,
              earTag: sa.mark ?? sa.official_id ?? extId.slice(0, 8),
              traceId: sa.official_id,
              currentDeviceId: sa.current_device_id ?? sa.sensor,
              lactationStatus: sa.lactation_status ?? 'unknown',
              status: sa.active ? 'active' : 'inactive',
              updatedAt: new Date(),
            })
            .where(eq(animals.animalId, existingAnimalId));

          animalMap.set(extId, existingAnimalId);
          if (sa.animal_id && sa.animal_id !== extId) {
            animalMap.set(sa.animal_id, existingAnimalId);
          }
          updated++;
        } else {
          // Insert
          const [row] = await db
            .insert(animals)
            .values({
              externalId: extId,
              farmId,
              earTag: sa.mark ?? sa.official_id ?? extId.slice(0, 8),
              traceId: sa.official_id,
              name: sa.name ?? sa.display_name,
              breed: mapRace(sa.race),
              breedType: 'dairy',
              sex: 'female',
              birthDate: sa.birthday ?? null,
              lactationStatus: sa.lactation_status ?? 'unknown',
              currentDeviceId: sa.current_device_id ?? sa.sensor,
              status: sa.active ? 'active' : 'inactive',
            })
            .returning();

          if (row) {
            animalMap.set(extId, row.animalId);
            if (sa.animal_id && sa.animal_id !== extId) {
              animalMap.set(sa.animal_id, row.animalId);
            }
            created++;
          }
        }
      } catch (error) {
        logger.error(
          { animalExtId: extId, err: error },
          `[Sync] Failed to sync animal`,
        );
      }
    }

    if (i % 500 === 0 && i > 0) {
      logger.info({ processed: i, total: smaxtecAnimals.length }, '[Sync] Animals progress');
    }
  }

  logger.info({ created, updated }, `[Sync] Animals: ${String(created)} created, ${String(updated)} updated`);
  return { created, updated, animalMap };
}

// ===========================
// 이벤트 동기화
// ===========================

async function syncEvents(
  events: readonly SmaxtecRawEvent[],
  animalMap: ReadonlyMap<string, string>,
  farmMap: ReadonlyMap<string, string>,
): Promise<number> {
  if (events.length === 0) return 0;

  const db = getDb();
  let stored = 0;

  // 기존 event external_id 체크 (중복 방지)
  const eventExtIds = events.map((e) => e._id ?? e.event_id ?? '').filter(Boolean);
  const existingEvents = new Set<string>();

  const LOAD_BATCH = 500;
  for (let i = 0; i < eventExtIds.length; i += LOAD_BATCH) {
    const batch = eventExtIds.slice(i, i + LOAD_BATCH);
    const existing = await db
      .select({ externalEventId: smaxtecEvents.externalEventId })
      .from(smaxtecEvents)
      .where(inArray(smaxtecEvents.externalEventId, batch));

    for (const e of existing) {
      if (e.externalEventId) existingEvents.add(e.externalEventId);
    }
  }

  // 새 이벤트만 필터
  const newEvents = events.filter((e) => {
    const extId = e._id ?? e.event_id ?? '';
    return extId && !existingEvents.has(extId);
  });

  // 배치 저장 (200개씩)
  const BATCH_SIZE = 200;
  for (let i = 0; i < newEvents.length; i += BATCH_SIZE) {
    const batch = newEvents.slice(i, i + BATCH_SIZE);
    const values = [];

    for (const raw of batch) {
      const animalId = animalMap.get(raw.animal_id);
      // org_id에서 farmId를 찾기 위해 animal의 org를 추적
      const orgId = raw.organisation_id;
      const farmId = orgId ? farmMap.get(orgId) : findFarmForAnimal(animalId, animalMap, farmMap);

      if (!animalId || !farmId) continue;

      const normalized = normalizeSmaxtecEvent(raw);
      values.push({
        externalEventId: normalized.externalEventId,
        animalId,
        farmId,
        eventType: normalized.eventType,
        confidence: normalized.confidence,
        severity: normalized.severity,
        stage: normalized.stage,
        detectedAt: normalized.detectedAt,
        details: normalized.details,
        rawData: normalized.rawData,
      });
    }

    if (values.length > 0) {
      try {
        const rows = await db
          .insert(smaxtecEvents)
          .values(values)
          .returning({ eventId: smaxtecEvents.eventId });

        stored += rows.length;

        // 알람 패턴 스냅샷 캡처 — 이벤트 전 48h 센서 데이터 저장
        for (const v of values) {
          captureBeforeSnapshot(
            v.animalId,
            v.farmId,
            v.eventType,
            v.detectedAt instanceof Date ? v.detectedAt : new Date(v.detectedAt),
            v.externalEventId,
          ).catch(err => logger.debug({ err, eventType: v.eventType }, '[Snapshot] capture skipped'));
        }
      } catch (error) {
        logger.error({ err: error, batchSize: values.length }, '[Sync] Failed to store event batch');
      }
    }
  }

  logger.info(
    { total: events.length, new: newEvents.length, stored },
    `[Sync] Events: ${String(stored)} stored (${String(events.length - newEvents.length)} duplicates skipped)`,
  );
  return stored;
}

// ===========================
// 전체 동기화 실행
// ===========================

export async function syncSmaxtecData(fetchData: SmaxtecFetchData): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  logger.info(
    {
      orgs: fetchData.organisations.length,
      animals: fetchData.animals.length,
      events: fetchData.events.length,
    },
    '[Sync] Starting smaXtec data sync',
  );

  // 1. 농장 동기화
  const farmResult = await syncFarms(fetchData.organisations);

  // 2. 동물 동기화
  const animalResult = await syncAnimals(fetchData.animals, farmResult.farmMap);

  // 3. Farm headcount 업데이트
  await updateFarmHeadCounts(farmResult.farmMap);

  // 4. 이벤트 동기화
  const eventsStored = await syncEvents(
    fetchData.events,
    animalResult.animalMap,
    farmResult.farmMap,
  );

  // 5. DIM/parity 이벤트 기반 업데이트 (calving_confirmation 기반)
  const dimUpdated = await updateDimAndParity();

  // 6. 번식 이벤트 동기화 (smaxtec_events → breeding_events + pregnancy_checks)
  const breedingSynced = await syncBreedingFromEvents();

  // 7. lactation_status 정규화 (Lactating_Cow → lactating, Dry_Cow → dry, Young_Cow → heifer)
  await normalizeLactationStatus();

  const elapsed = Date.now() - startTime;
  logger.info(
    {
      elapsed: `${String(elapsed)}ms`,
      farmsCreated: farmResult.created,
      animalsCreated: animalResult.created,
      eventsStored,
      dimUpdated,
      breedingSynced,
    },
    `[Sync] Complete in ${String(elapsed)}ms`,
  );

  return {
    farmsCreated: farmResult.created,
    farmsUpdated: farmResult.updated,
    animalsCreated: animalResult.created,
    animalsUpdated: animalResult.updated,
    eventsStored,
    errors,
    syncedAt: new Date(),
  };
}

// ===========================
// 헬퍼 함수
// ===========================

async function updateFarmHeadCounts(
  farmMap: ReadonlyMap<string, string>,
): Promise<void> {
  const db = getDb();

  for (const [, farmId] of farmMap) {
    try {
      const countResult = await db
        .select({ animalId: animals.animalId })
        .from(animals)
        .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active')));

      await db
        .update(farms)
        .set({ currentHeadCount: countResult.length, updatedAt: new Date() })
        .where(eq(farms.farmId, farmId));
    } catch {
      // non-critical, continue
    }
  }
}

function extractAddress(orgName: string): string {
  // 농장명에서 지역 추출: "58. 로칼축산/대풍축산 (칠곡 이현우)" → "칠곡"
  const match = orgName?.match(/\(([^)]+)\)/);
  if (match?.[1]) {
    return match[1].trim();
  }
  return orgName || '주소 미등록';
}

function mapRace(race: string | null): string {
  if (!race) return 'holstein';
  const raceMap: Readonly<Record<string, string>> = {
    holstein: 'holstein',
    Jersey: 'jersey',
    jersey: 'jersey',
    한우: 'hanwoo',
    Hanwoo: 'hanwoo',
    Brown_Swiss: 'brown_swiss',
  };
  return raceMap[race] ?? 'holstein';
}

function findFarmForAnimal(
  _animalId: string | undefined,
  _animalMap: ReadonlyMap<string, string>,
  _farmMap: ReadonlyMap<string, string>,
): string | undefined {
  // 이벤트에 org_id가 없는 경우 fallback — 실제로는 대부분 있음
  return undefined;
}

// ===========================
// 번식 이벤트 동기화: smaxtec_events → breeding_events + pregnancy_checks
// ===========================

/**
 * smaXtec 이벤트에서 번식 관련 데이터를 CowTalk 전용 테이블로 동기화.
 * - insemination → breeding_events (type='insemination')
 * - no_insemination → breeding_events (type='no_insemination')
 * - pregnancy_check → pregnancy_checks (result='pregnant'|'open')
 *
 * 중복 방지: smaxtec_events.external_event_id 기반 존재 여부 체크.
 * 매 sync 주기마다 증분 동기화 (새 이벤트만 처리).
 */
async function syncBreedingFromEvents(): Promise<{ inseminations: number; pregnancies: number }> {
  const db = getDb();
  let inseminations = 0;
  let pregnancies = 0;

  try {
    // --- 1. insemination / no_insemination → breeding_events ---
    // breeding_events.notes에 smaxtec event_id를 기록하여 중복 방지
    const insemResult = await db.execute(sql`
      INSERT INTO breeding_events (animal_id, farm_id, event_date, type, no_insemination_reason, notes, status)
      SELECT
        se.animal_id,
        se.farm_id,
        se.detected_at,
        se.event_type,
        CASE
          WHEN se.event_type = 'no_insemination'
            THEN COALESCE(se.details->>'reason', '미기록')
          ELSE NULL
        END,
        'smaxtec:' || se.external_event_id,
        'completed'
      FROM smaxtec_events se
      WHERE se.event_type IN ('insemination', 'no_insemination')
        AND se.animal_id IS NOT NULL
        AND se.farm_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM breeding_events be
          WHERE be.notes = 'smaxtec:' || se.external_event_id
        )
      ON CONFLICT DO NOTHING
    `);

    inseminations = typeof insemResult === 'object' && insemResult !== null && 'rowCount' in insemResult
      ? (insemResult as { rowCount: number }).rowCount ?? 0
      : 0;

    // --- 2. pregnancy_check → pregnancy_checks ---
    // notes에 smaxtec event_id 기록하여 중복 방지
    const pregResult = await db.execute(sql`
      INSERT INTO pregnancy_checks (animal_id, check_date, result, method, days_post_insemination, notes)
      SELECT
        se.animal_id,
        se.detected_at,
        CASE
          WHEN (se.details->>'pregnant')::boolean = true THEN 'pregnant'
          ELSE 'open'
        END,
        'sensor',
        CASE
          WHEN se.details->>'insemination_date' IS NOT NULL
            THEN EXTRACT(DAY FROM se.detected_at - (se.details->>'insemination_date')::timestamp)::int
          ELSE NULL
        END,
        'smaxtec:' || se.external_event_id
      FROM smaxtec_events se
      WHERE se.event_type = 'pregnancy_check'
        AND se.animal_id IS NOT NULL
        AND se.details->>'pregnant' IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM pregnancy_checks pc
          WHERE pc.notes = 'smaxtec:' || se.external_event_id
        )
      ON CONFLICT DO NOTHING
    `);

    pregnancies = typeof pregResult === 'object' && pregResult !== null && 'rowCount' in pregResult
      ? (pregResult as { rowCount: number }).rowCount ?? 0
      : 0;

    if (inseminations > 0 || pregnancies > 0) {
      logger.info(
        { inseminations, pregnancies },
        `[Sync] Breeding sync: ${String(inseminations)} inseminations, ${String(pregnancies)} pregnancy checks`,
      );
    }
  } catch (error) {
    logger.warn({ error }, '[Sync] Breeding event sync failed (non-critical)');
  }

  return { inseminations, pregnancies };
}

// ===========================
// lactation_status 정규화
// ===========================

/**
 * smaXtec에서 동기화된 lactation_status 값을 표준형으로 정규화.
 * Lactating_Cow/lactating → lactating, Dry_Cow/dry → dry, Young_Cow → heifer
 */
async function normalizeLactationStatus(): Promise<void> {
  const db = getDb();
  try {
    await db.execute(sql`
      UPDATE animals SET lactation_status = CASE
        WHEN lactation_status IN ('Lactating_Cow') THEN 'lactating'
        WHEN lactation_status IN ('Dry_Cow') THEN 'dry'
        WHEN lactation_status IN ('Young_Cow') THEN 'heifer'
        ELSE lactation_status
      END,
      updated_at = now()
      WHERE lactation_status IN ('Lactating_Cow', 'Dry_Cow', 'Young_Cow')
    `);
  } catch (error) {
    logger.debug({ error }, '[Sync] lactation_status normalization skipped');
  }
}

// ===========================
// DIM/parity 이벤트 기반 업데이트
// ===========================

/**
 * smaXtec calving_confirmation/calving_detection 이벤트로부터
 * DIM(착유일수)과 parity(산차)를 자동 계산하여 animals 테이블 업데이트.
 * 5분 주기 sync마다 실행.
 */
async function updateDimAndParity(): Promise<number> {
  const db = getDb();
  try {
    // DIM 업데이트: 가장 최근 분만 기록 기준
    await db.execute(sql`
      WITH latest_calving AS (
        SELECT DISTINCT ON (animal_id)
          animal_id,
          EXTRACT(DAY FROM now() - detected_at)::int AS dim
        FROM smaxtec_events
        WHERE event_type IN ('calving_confirmation', 'calving_detection')
        ORDER BY animal_id, detected_at DESC
      )
      UPDATE animals a
      SET days_in_milk = lc.dim, updated_at = now()
      FROM latest_calving lc
      WHERE a.animal_id = lc.animal_id
        AND a.status = 'active'
        AND (a.days_in_milk IS NULL OR a.days_in_milk != lc.dim)
    `);

    // Parity 업데이트: 분만 횟수
    await db.execute(sql`
      WITH calving_count AS (
        SELECT animal_id, count(*)::int AS parity
        FROM smaxtec_events
        WHERE event_type IN ('calving_confirmation', 'calving_detection')
        GROUP BY animal_id
      )
      UPDATE animals a
      SET parity = cc.parity, updated_at = now()
      FROM calving_count cc
      WHERE a.animal_id = cc.animal_id
        AND a.status = 'active'
        AND (a.parity IS NULL OR a.parity != cc.parity)
    `);

    // 간단한 카운트 추정 (정확한 rowCount 접근이 드라이버마다 다름)
    return 1;
  } catch (error) {
    logger.warn({ error }, '[Sync] DIM/parity update failed');
    return 0;
  }
}
