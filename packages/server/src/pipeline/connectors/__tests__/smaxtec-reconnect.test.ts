// smaXtec 연결 자가 복구 — 2026-10 "데이터·알람 0" 사고 재현
//
// 사고: 부팅 시 smaXtec 인증이 실패하면 목장 목록이 빈 채로 남았다.
// 이후 5분 주기 수집은 "목장 0곳 조회 → 성공 0건"으로 끝나 오류도 없이 데이터가 끊겼고,
// 비밀번호를 고쳐도 서버 재시작 전까지 회복되지 않았다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../config/index.js', () => ({
  config: { SMAXTEC_EMAIL: 'farm@example.com', SMAXTEC_PASSWORD: 'pw', SMAXTEC_API_KEY: undefined },
}));
vi.mock('../../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let authOk = false;
let orgs: Array<{ organisation_id: string; name: string }> = [{ organisation_id: 'org-1', name: '송영신목장' }];

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchMock = vi.fn((url: string) => {
  if (url.endsWith('/users/session_token')) {
    return Promise.resolve(authOk ? respond(200, { token: 't', expires_in: 3600 }) : respond(401, { error: 'bad credentials' }));
  }
  if (url.endsWith('/organisations')) return Promise.resolve(respond(200, orgs));
  if (url.includes('/animals')) return Promise.resolve(respond(200, [{ animal_id: 'a1' }]));
  if (url.includes('/events')) return Promise.resolve(respond(200, []));
  return Promise.resolve(respond(404, {}));
});

const { SmaxtecConnector } = await import('../smaxtec.connector.js');

describe('smaXtec 연결 자가 복구', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T09:00:00Z'));
    authOk = false;
    orgs = [{ organisation_id: 'org-1', name: '송영신목장' }];
    fetchMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('부팅 시 인증 실패 → 비밀번호 수정 후 재시작 없이 다음 주기에 복구', async () => {
    const c = new SmaxtecConnector();
    await expect(c.connect()).rejects.toThrow(/auth failed/);
    expect(c.getStatus()).toBe('error');

    // 예전 동작: 여기서 fetch 가 "목장 0곳, 성공 0건"을 돌려줬다. 이제는 오류로 드러난다.
    await expect(c.fetch()).rejects.toThrow(/미연결/);

    // 운영자가 비밀번호를 고쳤다 — 재연결 간격(60초)이 지나면 스스로 다시 붙는다
    authOk = true;
    vi.setSystemTime(new Date('2026-10-18T09:01:30Z'));
    const result = await c.fetch();
    expect(c.getStatus()).toBe('connected');
    expect(result.count).toBeGreaterThan(0);
  });

  it('재연결은 60초에 한 번만 — 인증 실패가 이어질 때 로그인 요청 폭주 방지', async () => {
    const c = new SmaxtecConnector();
    await c.connect().catch(() => undefined);
    vi.setSystemTime(new Date('2026-10-18T09:01:30Z'));
    await c.ensureConnected();
    const authCalls = (): number => fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/session_token')).length;
    const before = authCalls();
    await c.ensureConnected();
    await c.ensureConnected();
    expect(authCalls()).toBe(before);
  });

  it('인증은 됐지만 계정에 목장이 0곳이면 연결로 치지 않는다 (다른 계정으로 바꾼 경우)', async () => {
    authOk = true;
    orgs = [];
    const c = new SmaxtecConnector();
    await c.connect();
    expect(c.getStatus()).toBe('error');
    expect((await c.healthCheck()).lastError ?? '').toContain('0곳');
  });

  it('정상 연결이면 재연결을 시도하지 않는다', async () => {
    authOk = true;
    const c = new SmaxtecConnector();
    await c.connect();
    fetchMock.mockClear();
    expect(await c.ensureConnected()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
