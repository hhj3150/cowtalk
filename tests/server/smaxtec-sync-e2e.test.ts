// Phase 5 통합 검증 — smaXtec 수집 경로 (실제 DB, 가짜 smaXtec 응답 — 실제 계정·API 미사용)
// 확인: 농장·개체 생성 / 중복 이벤트 1건만 / 재실행 멱등 / 최근 24h 만 실시간 방송(올바른 개체로)
//       / 개체가 다른 조직으로 옮겨가면 소속 갱신 + 이동 이력
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const emitted: Array<{ eventId: string; animalId: string; eventType: string }> = [];
vi.mock('@server/realtime/alarm-emitter.js', () => ({
  emitNewAlarm: (a: { eventId: string; animalId: string; eventType: string }) => { emitted.push(a); },
  emitWeatherAlert: vi.fn(),
}));
vi.mock('@server/services/sovereign-alarm/snapshot/snapshot.service.js', () => ({ captureBeforeSnapshot: vi.fn(async () => undefined) }));

const { getDb, closeDb } = await import('@server/config/database.js');
const { farms, animals, smaxtecEvents, animalTransfers } = await import('@server/db/schema.js');
const { eq, inArray, like } = await import('drizzle-orm');
const { syncSmaxtecData } = await import('@server/pipeline/sync.service.js');

const RUN = String(Date.now()).slice(-7);
const ORG1 = `org1-${RUN}`; const ORG2 = `org2-${RUN}`;
const ANIMAL_EXT = `ani-${RUN}`; const OFFICIAL = `0021${RUN}0`;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const animal = (org: string) => ({
  _id: ANIMAL_EXT, official_id: OFFICIAL, name: `수집${RUN}`, display_name: null, organisation_id: org, group_id: null, group_name: null,
  mark: `M${RUN}`, sensor: `S${RUN}`, current_device_id: `S${RUN}`, archived: false, active: true, birthday: null, race: 'holstein',
  lactation_status: 'Lactating_Cow', last_readout: null, tags: [], do_not_breed: false, created_at: hoursAgo(1000),
});
const ev = (id: string, type: string, h: number, org: string) => ({
  _id: `${id}-${RUN}`, animal_id: ANIMAL_EXT, official_id: OFFICIAL, organisation_id: org, event_type: type, event_ts: hoursAgo(h), create_ts: hoursAgo(h),
});
const data = (org: string, events: unknown[]) => ({
  organisations: [{ organisation_id: ORG1, name: `수집목장1-${RUN}`, timezone: 'Asia/Seoul' }, { organisation_id: ORG2, name: `수집목장2-${RUN}`, timezone: 'Asia/Seoul' }],
  animals: [animal(org)], events, sensorData: [],
}) as never;

let animalId = '';

afterAll(async () => {
  const db = getDb();
  const fs = await db.select({ id: farms.farmId }).from(farms).where(inArray(farms.externalId, [ORG1, ORG2]));
  const ids = fs.map((f) => f.id);
  if (animalId) {
    await db.delete(animalTransfers).where(eq(animalTransfers.animalId, animalId)).catch(() => undefined);
    await db.delete(smaxtecEvents).where(eq(smaxtecEvents.animalId, animalId)).catch(() => undefined);
    await db.delete(animals).where(eq(animals.animalId, animalId)).catch(() => undefined);
  }
  if (ids.length) await db.delete(farms).where(inArray(farms.farmId, ids)).catch(() => undefined);
  await closeDb();
});

beforeAll(() => { emitted.length = 0; });

describe('smaXtec 수집 (가짜 응답 → 실제 DB)', () => {
  it('1차: 농장·개체 생성, 중복 이벤트는 1건, 최근 24h 이벤트만 올바른 개체로 방송', async () => {
    const r = await syncSmaxtecData(data(ORG1, [ev('e1', 'temperature_high', 1, ORG1), ev('e1', 'temperature_high', 1, ORG1), ev('e2', 'heat', 24 * 30, ORG1)]));
    expect(r.errors).toEqual([]);
    const db = getDb();
    const [a] = await db.select().from(animals).where(eq(animals.externalId, ANIMAL_EXT));
    expect(a).toBeDefined();
    animalId = a!.animalId;
    expect(a!.traceId).toBe(OFFICIAL);
    const stored = await db.select().from(smaxtecEvents).where(like(smaxtecEvents.externalEventId, `%-${RUN}`));
    expect(stored).toHaveLength(2);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.animalId).toBe(animalId);
    expect(stored.find((s) => s.eventId === emitted[0]!.eventId)?.externalEventId).toBe(`e1-${RUN}`);
  }, 60_000);

  it('2차(같은 데이터): 새로 저장·방송 없음 (멱등)', async () => {
    emitted.length = 0;
    const r = await syncSmaxtecData(data(ORG1, [ev('e1', 'temperature_high', 1, ORG1), ev('e2', 'heat', 24 * 30, ORG1)]));
    expect(r.eventsStored).toBe(0);
    expect(emitted).toHaveLength(0);
  }, 60_000);

  it('개체가 다른 조직으로 옮겨가면 소속이 바뀌고 이동 이력이 남는다', async () => {
    await syncSmaxtecData(data(ORG2, []));
    const db = getDb();
    const [org2] = await db.select().from(farms).where(eq(farms.externalId, ORG2));
    const [a] = await db.select().from(animals).where(eq(animals.animalId, animalId));
    expect(a!.farmId).toBe(org2!.farmId);
    const tr = await db.select().from(animalTransfers).where(eq(animalTransfers.animalId, animalId));
    expect(tr.length).toBe(1);
    expect(tr[0]!.destinationFarmId).toBe(org2!.farmId);
  }, 60_000);
});
