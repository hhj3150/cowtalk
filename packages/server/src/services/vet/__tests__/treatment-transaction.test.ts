// DI-07 회귀 — health_events·treatments 를 트랜잭션 없이 따로 쓰던 문제
import { describe, it, expect, vi, beforeEach } from 'vitest';

const committed: string[] = [];
let failTreatment = false;

function tableName(t: unknown): string {
  return String((t as Record<symbol, unknown>)[Symbol.for('drizzle:Name')] ?? 'unknown');
}
const selectChain = (rows: unknown[]) => ({
  from: () => ({ where: () => ({ limit: async () => rows, orderBy: () => ({ limit: async () => [] }) }) }),
});
vi.mock('../../../config/database.js', () => ({
  getDb: () => ({
    select: (cols: Record<string, unknown>) => selectChain('farmId' in cols ? [{ animalId: 'a1', farmId: 'f1' }] : []),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const staged: string[] = [];
      const tx = {
        insert: (t: unknown) => ({
          values: () => ({
            returning: async () => {
              const name = tableName(t);
              if (name === 'treatments' && failTreatment) throw new Error('db error');
              staged.push(name);
              return [name === 'health_events' ? { eventId: 'he1' } : { treatmentId: 't1' }];
            },
          }),
        }),
      };
      const r = await fn(tx); // 예외 시 staged 는 버려진다 (롤백)
      committed.push(...staged);
      return r;
    },
  }),
}));
vi.mock('../../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { recordTreatment } = await import('../treatment.service.js');

beforeEach(() => { committed.length = 0; failTreatment = false; });

describe('DI-07 recordTreatment 트랜잭션', () => {
  it('정상: 두 행이 함께 기록', async () => {
    const r = await recordTreatment({ animalId: 'a1', diagnosis: '유방염', drug: '세프티오퍼', withdrawalDays: 3 });
    expect(r.error).toBeUndefined();
    expect(r.success).toBe(true);
    expect(committed).toEqual(['health_events', 'treatments']);
  });
  it('치료 행 실패 시 health_event 도 남지 않는다 (고아 행 방지)', async () => {
    failTreatment = true;
    const r = await recordTreatment({ animalId: 'a1', diagnosis: '유방염', drug: '세프티오퍼', withdrawalDays: 3 });
    expect(r.success).toBe(false);
    expect(committed).toEqual([]);
  });
  it('약물 없는 진단 기록은 health_event 만', async () => {
    await recordTreatment({ animalId: 'a1', diagnosis: '관찰' });
    expect(committed).toEqual(['health_events']);
  });
});
