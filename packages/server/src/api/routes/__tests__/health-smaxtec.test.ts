import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/database.js', () => ({ getDb: () => ({}) }));

const { describeSmaxtecHealth } = await import('../health.routes.js');

const base = { running: true, connectorStatus: 'connected', lastError: null, lastSyncAt: null, lastEventAt: null };

describe('describeSmaxtecHealth — 공개 헬스 응답의 smaXtec 상태 문구', () => {
  it('인증 실패는 원문 대신 원인 분류로', () => {
    const d = describeSmaxtecHealth({ ...base, connectorStatus: 'error', lastError: 'smaXtec auth failed: 401 {"secret":"x"}' });
    expect(d).toContain('cause: authentication failed');
    expect(d).not.toContain('secret');
  });
  it('목장 0곳 계정', () => {
    expect(describeSmaxtecHealth({ ...base, connectorStatus: 'error', lastError: '연결된 목장(organisation)이 0곳' })).toContain('no organisations');
  });
  it('마지막 수집·이벤트 시각을 보여준다', () => {
    const d = describeSmaxtecHealth({ ...base, lastSyncAt: new Date('2026-10-18T09:00:00Z'), lastEventAt: new Date('2026-10-18T08:55:00Z') });
    expect(d).toContain('last sync: 2026-10-18T09:00:00.000Z');
    expect(d).toContain('last event: 2026-10-18T08:55:00.000Z');
  });
  it('파이프라인이 꺼져 있으면 드러낸다', () => {
    expect(describeSmaxtecHealth({ ...base, running: false })).toContain('pipeline not running');
  });
});

// OPS-02 회귀 — /health/deep 의 Redis 핑이 요청마다 10초 막히고 연결이 누수되던 문제
describe('OPS-02 pingRedisOnce', () => {
  it('응답 없으면 상한 시간에 timeout 으로 끝나고 연결을 해제한다', async () => {
    const { pingRedisOnce } = await import('../health.routes.js');
    const disconnect = vi.fn();
    const r = await pingRedisOnce(() => ({ ping: () => new Promise<string>(() => undefined), disconnect }), 20);
    expect(r).toBe('timeout');
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
  it('실패해도 연결을 해제한다 (예전: 실패 시 누수)', async () => {
    const { pingRedisOnce } = await import('../health.routes.js');
    const disconnect = vi.fn();
    expect(await pingRedisOnce(() => ({ ping: () => Promise.reject(new Error('ECONNREFUSED')), disconnect }), 20)).toBe('error');
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
  it('정상이면 PONG', async () => {
    const { pingRedisOnce } = await import('../health.routes.js');
    const disconnect = vi.fn();
    expect(await pingRedisOnce(() => ({ ping: async () => 'PONG', disconnect }), 20)).toBe('PONG');
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
