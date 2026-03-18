// smaXtec → DB 동기화 서비스
// organisations → farms, animals → animals, events → smaxtec_events
// Upsert 패턴: external_id로 조회 → 있으면 UPDATE, 없으면 INSERT

import { getDb } from '../config/database.js';
import { farms, animals, regions, smaxtecEvents } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
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

  const elapsed = Date.now() - startTime;
  logger.info(
    {
      elapsed: `${String(elapsed)}ms`,
      farmsCreated: farmResult.created,
      animalsCreated: animalResult.created,
      eventsStored,
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
