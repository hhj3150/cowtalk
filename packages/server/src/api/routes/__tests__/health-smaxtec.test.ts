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
  it('미래 시각 이벤트(타임존 오파싱 등)는 건수로 드러낸다', () => {
    expect(describeSmaxtecHealth({ ...base, futureEvents: 42 })).toContain('future-dated events: 42');
    expect(describeSmaxtecHealth({ ...base, futureEvents: 0 })).not.toContain('future-dated');
  });
  it('파이프라인이 꺼져 있으면 드러낸다', () => {
    expect(describeSmaxtecHealth({ ...base, running: false })).toContain('pipeline not running');
  });
});
