// DI-13 회귀 — smaXtec 응답 형식이 바뀌면 목장 번식 설정을 빈 값으로 덮어쓰던 문제
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const updates: unknown[] = [];
vi.mock('../../../config/database.js', () => ({
  getDb: () => ({ update: () => ({ set: (v: unknown) => { updates.push(v); return { where: async () => undefined }; } }) }),
}));
vi.mock('../../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { syncFarmSettings, extractBreedingSettings, countMappedSettings } = await import('../farm-settings-sync.service.js');

function mockFetch(body: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
}

beforeEach(() => { updates.length = 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('DI-13 syncFarmSettings', () => {
  it('매핑되는 키가 없으면(형식 변경) 저장하지 않고 null', async () => {
    mockFetch({ settings: { oestrus: 21 } });
    expect(await syncFarmSettings('f1', 'org1', 't')).toBeNull();
    expect(updates).toHaveLength(0);
  });

  it('정상 응답은 저장', async () => {
    mockFetch({ todo_oestrus_recurrence: 21 });
    const r = await syncFarmSettings('f1', 'org1', 't');
    expect(r).toMatchObject({ estrusRecurrenceDays: 21 });
    expect(updates).toHaveLength(1);
  });

  it('countMappedSettings 는 syncedAt 을 세지 않는다', () => {
    expect(countMappedSettings(extractBreedingSettings({}))).toBe(0);
    expect(countMappedSettings(extractBreedingSettings({ todo_oestrus_recurrence: 21 }))).toBe(1);
  });
});
