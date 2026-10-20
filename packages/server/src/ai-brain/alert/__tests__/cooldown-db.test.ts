// OPS-12 회귀 — 알림 쿨다운이 메모리에만 있어 재시작 직후·다른 레플리카에서 같은 알림을 다시 보내던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';

let dbRows: Array<{ dedupKey: string; lastAt: string }> = [];
let dbFail = false;
vi.mock('../../../config/database.js', () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ groupBy: async () => { if (dbFail) throw new Error('db'); return dbRows; } }) }) }),
  }),
}));
vi.mock('../../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { primeCooldownFromDb, filterByCooldown, clearCooldownCacheForTest } = await import('../alert-manager.js');

const cand = (key: string) => ({ type: 'health_risk', animalId: 'a', farmId: 'f', severity: 'high' as const, message: 'm', source: 'claude' as const, dedupKey: key });

beforeEach(() => { dbRows = []; dbFail = false; clearCooldownCacheForTest(); });

describe('OPS-12 primeCooldownFromDb', () => {
  it('다른 인스턴스가 1시간 전에 보낸 알림은 쿨다운(6h) 안이라 다시 보내지 않는다', async () => {
    dbRows = [{ dedupKey: 'animal:a:high', lastAt: new Date(Date.now() - 3600_000).toISOString() }];
    const alerts = [cand('animal:a:high'), cand('animal:b:high')];
    await primeCooldownFromDb(alerts as never);
    expect(filterByCooldown(alerts as never).map((a) => a.dedupKey)).toEqual(['animal:b:high']);
  });
  it('쿨다운이 지난 발송은 다시 보낸다', async () => {
    dbRows = [{ dedupKey: 'animal:a:high', lastAt: new Date(Date.now() - 7 * 3600_000).toISOString() }];
    await primeCooldownFromDb([cand('animal:a:high')] as never);
    expect(filterByCooldown([cand('animal:a:high')] as never)).toHaveLength(1);
  });
  it('DB 실패해도 진행 (메모리 캐시만)', async () => {
    dbFail = true;
    await primeCooldownFromDb([cand('animal:a:high')] as never);
    expect(filterByCooldown([cand('animal:a:high')] as never)).toHaveLength(1);
  });
});
