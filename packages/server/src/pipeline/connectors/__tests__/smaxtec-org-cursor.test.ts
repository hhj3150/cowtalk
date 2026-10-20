// DI-04 회귀 — 수집 기준점이 전역 하나로, 사이클 종료 시각으로, 실패해도 전진하던 문제
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../config/index.js', () => ({
  config: { SMAXTEC_EMAIL: 'farm@example.com', SMAXTEC_PASSWORD: 'pw', SMAXTEC_API_KEY: undefined },
}));
vi.mock('../../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
let failOrg2 = true;
const fetchMock = vi.fn((url: string) => {
  if (url.endsWith('/users/session_token')) return Promise.resolve(respond(200, { token: 't', expires_in: 3600 }));
  if (url.endsWith('/organisations')) return Promise.resolve(respond(200, [{ organisation_id: 'org-1', name: 'A' }, { organisation_id: 'org-2', name: 'B' }]));
  if (url.includes('/animals')) return Promise.resolve(respond(200, []));
  if (url.includes('/events')) {
    if (url.includes('org-2') && failOrg2) return Promise.resolve(respond(500, {}));
    return Promise.resolve(respond(200, [{ _id: 'e1', event_ts: '2026-10-01T00:00:00Z', create_ts: '2026-10-19T08:00:00Z', event_type: 'heat', animal_id: 'a' }]));
  }
  return Promise.resolve(respond(404, {}));
});

const { SmaxtecConnector, filterEventsSinceCursor, ORG_CURSOR_OVERLAP_MS } = await import('../smaxtec.connector.js');

describe('DI-04 filterEventsSinceCursor', () => {
  const cursor = new Date('2026-10-19T09:00:00Z');
  it('발생은 과거여도 생성(소급 입력)이 기준점 근처면 포함 — 예전: event_ts 비교로 영구 누락', () => {
    const r = filterEventsSinceCursor([{ event_ts: '2026-10-01T00:00:00Z', create_ts: '2026-10-19T08:30:00Z' }], cursor);
    expect(r).toHaveLength(1);
  });
  it('겹침 구간보다 오래 전 생성된 것은 제외', () => {
    const old = new Date(cursor.getTime() - ORG_CURSOR_OVERLAP_MS - 60_000).toISOString();
    expect(filterEventsSinceCursor([{ create_ts: old }], cursor)).toHaveLength(0);
  });
  it('기준점이 없으면(첫 수집) 전부', () => {
    expect(filterEventsSinceCursor([{ create_ts: '2020-01-01T00:00:00Z' }], undefined)).toHaveLength(1);
  });
  it('시각을 못 읽으면 버리지 않는다', () => {
    expect(filterEventsSinceCursor([{ create_ts: 'x' }], cursor)).toHaveLength(1);
  });
});

describe('DI-04 조직별 기준점', () => {
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); failOrg2 = true; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('수집 실패 조직은 기준점에 들어가지 않는다 (예전: 일부 실패해도 전역 기준점 전진)', async () => {
    const c = new SmaxtecConnector();
    await c.connect();
    const r = await c.fetch();
    const data = r.data[0]!;
    expect(Object.keys(data.orgCursors ?? {})).toEqual(['org-1']);
  });
});
