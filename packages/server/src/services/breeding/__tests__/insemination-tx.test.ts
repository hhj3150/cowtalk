// DI-12 회귀 — 수정 기록과 정액 재고 차감이 따로 실행되고 중복 요청에 두 번 기록·차감되던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';

const committed: string[] = [];
let recentExisting: Array<{ eventId: string }> = [];
let failInventory = false;

vi.mock('../../../config/database.js', () => ({
  getDb: () => ({
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const staged: string[] = [];
      const tx = {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => recentExisting }) }) }),
        insert: () => ({ values: () => ({ returning: async () => { staged.push('breeding_events'); return [{ eventId: 'ev-new' }]; } }) }),
        execute: async () => { if (failInventory) throw new Error('db'); staged.push('inventory'); },
      };
      const r = await fn(tx); // 예외 시 staged 는 버려진다 (롤백)
      committed.push(...staged);
      return r;
    },
  }),
}));
vi.mock('../../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { recordInsemination } = await import('../breeding-advisor.service.js');
const base = { animalId: 'a1', farmId: 'f1', semenId: 's1' };

beforeEach(() => { committed.length = 0; recentExisting = []; failInventory = false; });

describe('DI-12 recordInsemination', () => {
  it('기록과 재고 차감이 함께 반영', async () => {
    expect(await recordInsemination(base)).toEqual({ eventId: 'ev-new' });
    expect(committed).toEqual(['breeding_events', 'inventory']);
  });

  it('재고 차감 실패 시 수정 기록도 남지 않는다 (롤백)', async () => {
    failInventory = true;
    await expect(recordInsemination(base)).rejects.toThrow();
    expect(committed).toEqual([]);
  });

  it('10분 안 같은 요청은 기존 기록을 돌려주고 다시 차감하지 않는다', async () => {
    recentExisting = [{ eventId: 'ev-old' }];
    expect(await recordInsemination(base)).toEqual({ eventId: 'ev-old' });
    expect(committed).toEqual([]);
  });
});
