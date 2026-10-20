// smaXtec → DB 동기화 서비스
// organisations → farms, animals → animals, events → smaxtec_events
// Upsert 패턴: external_id로 조회 → 있으면 UPDATE, 없으면 INSERT

import { getDb } from '../config/database.js';
import { farms, animals, regions, smaxtecEvents, animalTransfers } from '../db/schema.js';
import { captureBeforeSnapshot } from '../services/sovereign-alarm/snapshot/snapshot.service.js';
import { eq, and, inArray, isNull, sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import type { SmaxtecOrganisation, SmaxtecAnimal, SmaxtecRawEvent } from './connectors/smaxtec.connector.js';
import type { SmaxtecFetchData } from './connectors/smaxtec.connector.js';
import { normalizeSmaxtecEvent } from './normalization.js';
import { emitNewAlarm } from '../realtime/alarm-emitter.js';
import { pickCurrentRecords, decideAffiliation, mergeSyncStatus, nonEmpty, diffAnimalPatch, type ExistingAnimalRow } from './animal-affiliation.js';

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

export async function syncAnimals(
  smaxtecAnimals: readonly SmaxtecAnimal[],
  farmMap: ReadonlyMap<string, string>,
): Promise<{ created: number; updated: number; animalMap: ReadonlyMap<string, string> }> {
  const db = getDb();
  const animalMap = new Map<string, string>();
  let created = 0;
  let updated = 0;
  let movedCount = 0;

  // 기존 animals에서 external_id 매핑 로드
  const externalIds = smaxtecAnimals.map((a) => a._id ?? a.animal_id ?? '');

  // 배치로 로드 (500개씩)
  const LOAD_BATCH = 500;
  const existingMap = new Map<string, ExistingAnimalRow>();
  for (let i = 0; i < externalIds.length; i += LOAD_BATCH) {
    const batch = externalIds.slice(i, i + LOAD_BATCH);
    const existing = await db
      .select({
        animalId: animals.animalId, externalId: animals.externalId, farmId: animals.farmId, status: animals.status,
        deletedAt: animals.deletedAt, name: animals.name, earTag: animals.earTag, traceId: animals.traceId,
        currentDeviceId: animals.currentDeviceId, lactationStatus: animals.lactationStatus,
      })
      .from(animals)
      .where(inArray(animals.externalId, batch));

    for (const a of existing) {
      if (a.externalId) {
        existingMap.set(a.externalId, {
          animalId: a.animalId, farmId: a.farmId, status: a.status, deleted: a.deletedAt != null,
          current: { name: a.name, earTag: a.earTag, traceId: a.traceId, currentDeviceId: a.currentDeviceId, lactationStatus: a.lactationStatus },
        });
      }
    }
  }

  // DI-02: 같은 개체가 옛 목장(비활성)·새 목장(활성) 목록에 함께 나오면 활성 기록 하나만 처리
  const current = pickCurrentRecords(
    smaxtecAnimals.flatMap((sa) => {
      const targetFarmId = farmMap.get(sa.organisation_id);
      if (!targetFarmId) return []; // 매핑되지 않은 org
      return [{ sa, extId: sa._id ?? sa.animal_id ?? '', active: Boolean(sa.active), targetFarmId }];
    }),
  );

  // DI-08: externalId 로 못 찾은 개체는 이력번호로 한 번 더 찾는다 — 수동 등록한 소(externalId 없음)를
  // 동기화가 새로 만들어 같은 소가 두 마리가 되던 문제. 찾으면 그 행에 externalId 를 연결한다.
  const linkByTrace = new Set<string>();
  const unmatchedTraceIds = [...new Set(current
    .filter((c) => !existingMap.has(c.extId) && nonEmpty(c.sa.official_id))
    .map((c) => c.sa.official_id as string))];
  for (let i = 0; i < unmatchedTraceIds.length; i += LOAD_BATCH) {
    const batch = unmatchedTraceIds.slice(i, i + LOAD_BATCH);
    const rows = await db
      .select({ animalId: animals.animalId, traceId: animals.traceId, farmId: animals.farmId, status: animals.status })
      .from(animals)
      .where(and(inArray(animals.traceId, batch), isNull(animals.externalId), isNull(animals.deletedAt)));
    const byTrace = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!r.traceId) continue;
      byTrace.set(r.traceId, [...(byTrace.get(r.traceId) ?? []), r]);
    }
    for (const c of current) {
      const matches = byTrace.get(c.sa.official_id ?? '');
      // 이력번호가 같은 행이 둘 이상이면 어느 쪽인지 모르므로 연결하지 않는다 (사람이 정리)
      if (existingMap.has(c.extId) || !matches || matches.length !== 1) continue;
      const m = matches[0]!;
      existingMap.set(c.extId, { animalId: m.animalId, farmId: m.farmId, status: m.status, deleted: false, current: {} });
      linkByTrace.add(c.extId);
    }
  }

  // 배치 처리 (100개씩)
  const BATCH_SIZE = 100;
  for (let i = 0; i < current.length; i += BATCH_SIZE) {
    const batch = current.slice(i, i + BATCH_SIZE);

    for (const { sa, extId, targetFarmId: farmId } of batch) {
      try {
        const existingRow = existingMap.get(extId);
        const existingAnimalId = existingRow?.animalId;

        if (existingRow && existingAnimalId && existingRow.deleted) {
          // DI-05: 소프트 삭제한 개체는 갱신하지 않는다 (이벤트 연결용 매핑만 유지)
          animalMap.set(extId, existingAnimalId);
          if (sa.animal_id && sa.animal_id !== extId) animalMap.set(sa.animal_id, existingAnimalId);
        } else if (existingRow && existingAnimalId) {
          // Update — 소속 목장 변경 반영 (DI-02). 과거 기록의 farm_id 는 건드리지 않는다.
          const decision = decideAffiliation(existingRow.farmId, farmId, Boolean(sa.active));
          // OPS-07: 바뀐 값만 UPDATE — 예전엔 매 사이클 개체마다(약 11,000건) 무조건 UPDATE 했다
          const patch = diffAnimalPatch(
            { ...existingRow.current, farmId: existingRow.farmId, status: existingRow.status },
            {
              externalId: linkByTrace.has(extId) ? extId : undefined,
              farmId: decision.farmId,
              // DI-05: 비어 올라온 값으로 수동 입력한 이름·관리번호·이력번호를 지우거나
              //        임시 값(extId 앞 8자리)으로 바꾸지 않는다
              name: nonEmpty(sa.name) ?? nonEmpty(sa.display_name),
              earTag: nonEmpty(sa.mark),
              traceId: nonEmpty(sa.official_id),
              currentDeviceId: sa.current_device_id ?? sa.sensor,
              lactationStatus: nonEmpty(sa.lactation_status),
              // DI-05: 목장에서 확정한 폐사·도태·매각 상태는 되살리지 않는다
              status: mergeSyncStatus(existingRow.status, Boolean(sa.active), decision.applyStatus),
            },
          );
          if (Object.keys(patch).length > 0) {
            await db
              .update(animals)
              .set({ ...patch, updatedAt: new Date() })
              .where(eq(animals.animalId, existingAnimalId));
          }

          if (decision.moved) {
            await db.insert(animalTransfers).values({
              animalId: existingAnimalId,
              sourceFarmId: existingRow.farmId,
              destinationFarmId: decision.farmId,
              transferDate: new Date(),
              reason: 'smaxtec_sync',
              traceNo: sa.official_id ?? null,
            });
            existingMap.set(extId, { ...existingRow, farmId: decision.farmId });
            movedCount++;
            logger.info(
              { animalId: existingAnimalId, from: existingRow.farmId, to: decision.farmId },
              '[Sync] 개체 소속 목장 변경 — 이동 이력 기록',
            );
          }

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
      logger.info({ processed: i, total: current.length }, '[Sync] Animals progress');
    }
  }

  logger.info({ created, updated, moved: movedCount }, `[Sync] Animals: ${String(created)} created, ${String(updated)} updated, ${String(movedCount)} moved`);
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
    type EventInsertRow = Pick<
      ReturnType<typeof normalizeSmaxtecEvent>,
      'externalEventId' | 'eventType' | 'confidence' | 'severity' | 'stage' | 'detectedAt' | 'details' | 'rawData'
    > & { animalId: string; farmId: string };
    const values: EventInsertRow[] = [];

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
          // DI-10: 조회 후 삽입 사이에 다른 인스턴스가 같은 이벤트를 넣었으면 건너뛴다
          // (유니크 인덱스 0042 와 함께 동작 — 건너뛴 행은 returning 에 없어 알람도 다시 방송되지 않는다)
          .onConflictDoNothing()
          .returning({ eventId: smaxtecEvents.eventId });

        stored += rows.length;

        // 실시간 push — 방금 저장된 알람을 farm room + 전체 room에 즉시 전파.
        // (이 배선이 없으면 화면은 60초 폴링까지 대기 — 조기경보의 마지막 구간 지연 제거)
        try {
          const animalIdSet = [...new Set(values.map((v) => v.animalId))];
          const farmIdSet = [...new Set(values.map((v) => v.farmId))];
          const [animalRows, farmRows] = await Promise.all([
            db.select({ animalId: animals.animalId, earTag: animals.earTag })
              .from(animals).where(inArray(animals.animalId, animalIdSet)),
            db.select({ farmId: farms.farmId, name: farms.name })
              .from(farms).where(inArray(farms.farmId, farmIdSet)),
          ]);
          const earTagMap = new Map(animalRows.map((r) => [r.animalId, r.earTag]));
          const farmNameMap = new Map(farmRows.map((r) => [r.farmId, r.name]));

          rows.forEach((row, i) => {
            const v = values[i];
            if (!v) return;
            emitNewAlarm({
              eventId: row.eventId,
              eventType: v.eventType,
              farmId: v.farmId,
              farmName: farmNameMap.get(v.farmId) ?? '',
              animalId: v.animalId,
              earTag: earTagMap.get(v.animalId),
              severity: v.severity,
              confidence: v.confidence,
              detectedAt: (v.detectedAt instanceof Date ? v.detectedAt : new Date(v.detectedAt)).toISOString(),
              details: v.details,
              acknowledged: false,
            });
          });
        } catch (err) {
          logger.warn({ err }, '[Sync] 실시간 알람 push 실패 (비치명적 — 60초 폴링이 대체)');
        }

        // 알람 패턴 스냅샷 캡처 — 이벤트 전 48h 센서 데이터 저장
        for (const v of values) {
          captureBeforeSnapshot(
            v.animalId,
            v.farmId,
            v.eventType,
            v.detectedAt instanceof Date ? v.detectedAt : new Date(v.detectedAt),
            v.externalEventId ?? undefined,
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
  // OPS-07: 예전엔 농장마다 개체 id 전체를 메모리로 읽어 길이를 세고 매번 UPDATE 했다.
  // 이제 한 번의 집계 UPDATE — 값이 바뀐 농장만 갱신한다.
  const farmIds = [...new Set(farmMap.values())];
  if (farmIds.length === 0) return;
  try {
    await getDb().execute(sql`
      WITH counts AS (
        SELECT f.farm_id, count(a.animal_id)::int AS cnt
        FROM farms f
        LEFT JOIN animals a ON a.farm_id = f.farm_id AND a.status = 'active'
        WHERE f.farm_id IN (${sql.join(farmIds.map((id) => sql`${id}::uuid`), sql`, `)})
        GROUP BY f.farm_id
      )
      UPDATE farms f
      SET current_head_count = c.cnt, updated_at = now()
      FROM counts c
      WHERE f.farm_id = c.farm_id AND f.current_head_count IS DISTINCT FROM c.cnt
    `);
  } catch (err) {
    logger.warn({ err }, '[Sync] 농장 두수 갱신 실패 — 다음 사이클에 재시도');
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
            AND be.notes LIKE 'smaxtec:%' -- OPS-06: 부분 인덱스(breeding_events_smaxtec_notes_idx) 사용 조건
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
            AND pc.notes LIKE 'smaxtec:%' -- OPS-06: 부분 인덱스(pregnancy_checks_smaxtec_notes_idx) 사용 조건
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
/** 같은 분만으로 묶는 간격 — 분만 간격은 생물학적으로 이보다 짧을 수 없다 */
export const CALVING_EPISODE_GAP_DAYS = 120;

/** DI-06: 분만 이벤트 시각 목록 → 분만 횟수 (SQL 갱신과 같은 규칙, 검증용 순수 함수) */
export function countCalvingEpisodes(dates: readonly Date[], gapDays: number = CALVING_EPISODE_GAP_DAYS): number {
  const sorted = [...dates].map((d) => d.getTime()).sort((a, b) => a - b);
  let count = 0;
  let prev: number | null = null;
  for (const t of sorted) {
    if (prev === null || t - prev > gapDays * 86_400_000) count++;
    prev = t;
  }
  return count;
}

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

    // Parity 업데이트: 분만 횟수 (DI-06)
    //  - 한 번의 분만에 감지(calving_detection)·확인(calving_confirmation) 두 이벤트가 오면 예전엔 2로 셌다
    //    → CALVING_EPISODE_GAP_DAYS 안의 이벤트는 같은 분만으로 묶는다 (countCalvingEpisodes 와 같은 규칙)
    //  - 센서 장착 전 분만은 이벤트가 없다 → 기존 산차보다 작아지지 않게 GREATEST
    await db.execute(sql`
      WITH ordered AS (
        SELECT animal_id, detected_at,
               LAG(detected_at) OVER (PARTITION BY animal_id ORDER BY detected_at) AS prev_at
        FROM smaxtec_events
        WHERE event_type IN ('calving_confirmation', 'calving_detection')
      ),
      calving_count AS (
        SELECT animal_id,
               count(*) FILTER (
                 WHERE prev_at IS NULL OR detected_at - prev_at > make_interval(days => ${CALVING_EPISODE_GAP_DAYS}::int)
               )::int AS parity
        FROM ordered
        GROUP BY animal_id
      )
      UPDATE animals a
      SET parity = GREATEST(COALESCE(a.parity, 0), cc.parity), updated_at = now()
      FROM calving_count cc
      WHERE a.animal_id = cc.animal_id
        AND a.status = 'active'
        AND (a.parity IS NULL OR a.parity < cc.parity)
    `);

    // 간단한 카운트 추정 (정확한 rowCount 접근이 드라이버마다 다름)
    return 1;
  } catch (error) {
    logger.warn({ error }, '[Sync] DIM/parity update failed');
    return 0;
  }
}
