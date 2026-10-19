// DI-02 회귀 — 목장을 옮긴 개체가 옛 목장에 남아 두 목장 데이터가 섞이던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pickCurrentRecords, decideAffiliation } from '../animal-affiliation.js';

const OLD_FARM = 'farm-old';
const NEW_FARM = 'farm-new';

describe('DI-02 decideAffiliation', () => {
  it('새 목장에서 활성 → 소속 이동', () => {
    expect(decideAffiliation(OLD_FARM, NEW_FARM, true)).toEqual({ farmId: NEW_FARM, moved: true, applyStatus: true });
  });
  it('옛 목장에 비활성으로 남은 기록은 소속을 끌어오지 않고 상태도 덮지 않는다', () => {
    expect(decideAffiliation(NEW_FARM, OLD_FARM, false)).toEqual({ farmId: NEW_FARM, moved: false, applyStatus: false });
  });
  it('같은 목장이면 이동 없음, 상태(도태 등) 반영', () => {
    expect(decideAffiliation(OLD_FARM, OLD_FARM, false)).toEqual({ farmId: OLD_FARM, moved: false, applyStatus: true });
  });
});

describe('DI-02 pickCurrentRecords', () => {
  it('한 동기화에 옛 목장(비활성)·새 목장(활성)이 함께 오면 활성 하나만', () => {
    const r = pickCurrentRecords([
      { extId: 'cow1', active: false, targetFarmId: OLD_FARM },
      { extId: 'cow1', active: true, targetFarmId: NEW_FARM },
      { extId: 'cow2', active: true, targetFarmId: OLD_FARM },
    ]);
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.extId === 'cow1')?.targetFarmId).toBe(NEW_FARM);
  });
  it('순서가 반대여도 활성 우선', () => {
    const r = pickCurrentRecords([
      { extId: 'cow1', active: true, targetFarmId: NEW_FARM },
      { extId: 'cow1', active: false, targetFarmId: OLD_FARM },
    ]);
    expect(r).toEqual([{ extId: 'cow1', active: true, targetFarmId: NEW_FARM }]);
  });
  it('외부 id 없는 기록은 버린다', () => {
    expect(pickCurrentRecords([{ extId: '', active: true, targetFarmId: NEW_FARM }])).toEqual([]);
  });
});

// ── syncAnimals 통합: DB 호출 관찰 ──
const updates: Array<Record<string, unknown>> = [];
const inserts: Array<{ values: Record<string, unknown> }> = [];
let existingRows: Array<{ animalId: string; externalId: string; farmId: string }> = [];

vi.mock('../../config/database.js', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: async () => existingRows }) }),
    update: () => ({ set: (v: Record<string, unknown>) => { updates.push(v); return { where: async () => undefined }; } }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserts.push({ values: v });
        const p = Promise.resolve(undefined) as Promise<undefined> & { returning: () => Promise<Array<{ animalId: string }>> };
        p.returning = async () => [{ animalId: 'new-animal' }];
        return p;
      },
    }),
  }),
}));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { syncAnimals } = await import('../sync.service.js');
type SyncInput = Parameters<typeof syncAnimals>[0];

describe('DI-02 syncAnimals — 이동 개체', () => {
  beforeEach(() => { updates.length = 0; inserts.length = 0; });

  const farmMap = new Map([['org-old', OLD_FARM], ['org-new', NEW_FARM]]);

  it('새 목장에서 활성으로 올라오면 farmId 갱신 + 이동 이력 1건', async () => {
    existingRows = [{ animalId: 'a1', externalId: 'cow1', farmId: OLD_FARM }];
    const input = [
      { _id: 'cow1', organisation_id: 'org-old', active: false, mark: '423' },
      { _id: 'cow1', organisation_id: 'org-new', active: true, mark: '423', official_id: '002132665191' },
    ] as unknown as SyncInput;
    await syncAnimals(input, farmMap);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ farmId: NEW_FARM, status: 'active' });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.values).toMatchObject({ animalId: 'a1', sourceFarmId: OLD_FARM, destinationFarmId: NEW_FARM });
  });

  it('같은 목장이면 이동 이력 없음', async () => {
    existingRows = [{ animalId: 'a1', externalId: 'cow1', farmId: OLD_FARM }];
    await syncAnimals([{ _id: 'cow1', organisation_id: 'org-old', active: true }] as unknown as SyncInput, farmMap);
    expect(updates[0]).toMatchObject({ farmId: OLD_FARM });
    expect(inserts).toHaveLength(0);
  });

  it('이력제 번호가 비어 올라오면 기존 traceId 를 지우지 않는다', async () => {
    existingRows = [{ animalId: 'a1', externalId: 'cow1', farmId: OLD_FARM }];
    await syncAnimals([{ _id: 'cow1', organisation_id: 'org-old', active: true, official_id: '' }] as unknown as SyncInput, farmMap);
    expect(updates[0]!.traceId).toBeUndefined();
  });
});

// ── DI-05 회귀 — 동기화가 수동 입력값·종료 상태를 덮어쓰던 문제 ──
import { mergeSyncStatus, nonEmpty } from '../animal-affiliation.js';

describe('DI-05 mergeSyncStatus', () => {
  it.each(['dead', 'culled', 'sold', 'transferred'])('목장에서 %s 로 바꾼 소는 smaXtec active 로 되살리지 않는다', (st) => {
    expect(mergeSyncStatus(st, true, true)).toBeUndefined();
  });
  it('일반 상태는 smaXtec 값을 따른다', () => {
    expect(mergeSyncStatus('active', false, true)).toBe('inactive');
    expect(mergeSyncStatus('inactive', true, true)).toBe('active');
  });
  it('다른 목장 잔존 기록이면 바꾸지 않는다', () => {
    expect(mergeSyncStatus('active', false, false)).toBeUndefined();
  });
  it('nonEmpty', () => {
    expect(nonEmpty('')).toBeUndefined();
    expect(nonEmpty('  ')).toBeUndefined();
    expect(nonEmpty(null)).toBeUndefined();
    expect(nonEmpty('423')).toBe('423');
  });
});

describe('DI-05 syncAnimals — 로컬 값 보존', () => {
  const farmMap = new Map([['org-old', OLD_FARM]]);
  beforeEach(() => { updates.length = 0; inserts.length = 0; });

  it('관리번호가 비어 올라오면 수동 입력 관리번호를 덮지 않는다 (예전: extId 앞 8자리로 교체)', async () => {
    existingRows = [{ animalId: 'a1', externalId: 'cow1', farmId: OLD_FARM }];
    await syncAnimals([{ _id: 'cow1abcdef', organisation_id: 'org-old', active: true }] as unknown as SyncInput, farmMap);
    existingRows = [{ animalId: 'a1', externalId: 'cow1', farmId: OLD_FARM }];
    await syncAnimals([{ _id: 'cow1', organisation_id: 'org-old', active: true, mark: '' }] as unknown as SyncInput, farmMap);
    expect(updates.at(-1)!.earTag).toBeUndefined();
  });

  it('폐사 처리한 소는 active 로 되돌리지 않는다', async () => {
    existingRows = [{ animalId: 'a1', externalId: 'cow1', farmId: OLD_FARM, status: 'dead' } as never];
    await syncAnimals([{ _id: 'cow1', organisation_id: 'org-old', active: true }] as unknown as SyncInput, farmMap);
    expect(updates[0]!.status).toBeUndefined();
  });

  it('소프트 삭제된 개체는 갱신하지 않는다', async () => {
    existingRows = [{ animalId: 'a1', externalId: 'cow1', farmId: OLD_FARM, deletedAt: new Date() } as never];
    await syncAnimals([{ _id: 'cow1', organisation_id: 'org-old', active: true, mark: '9' }] as unknown as SyncInput, farmMap);
    expect(updates).toHaveLength(0);
  });
});

// ── DI-06 회귀 — 한 번의 분만을 감지·확인 이벤트로 두 번 세던 산차 ──
describe('DI-06 countCalvingEpisodes', () => {
  it('감지+확인 이벤트 2건(같은 분만)은 1산', async () => {
    const { countCalvingEpisodes } = await import('../sync.service.js');
    expect(countCalvingEpisodes([new Date('2026-03-01T02:00:00Z'), new Date('2026-03-01T09:00:00Z')])).toBe(1);
  });
  it('1년 간격 분만 2회는 2산', async () => {
    const { countCalvingEpisodes } = await import('../sync.service.js');
    expect(countCalvingEpisodes([new Date('2025-03-01'), new Date('2025-03-02'), new Date('2026-03-05')])).toBe(2);
  });
  it('이벤트 없음은 0', async () => {
    const { countCalvingEpisodes } = await import('../sync.service.js');
    expect(countCalvingEpisodes([])).toBe(0);
  });
});
