// OPS-01 회귀 — 소버린 알람 순회가 LIMIT 200(정렬 없음)으로 201번째 농장부터 빠지던 문제
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ getDb: () => ({}) }));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { forEachFarmPaged } = await import('../orchestrator.js');

const farms = Array.from({ length: 201 }, (_, i) => `farm-${String(i).padStart(4, '0')}`);
const fetchPage = (size: number) => async (after: string): Promise<string[]> => farms.filter((f) => f > after).slice(0, size);

describe('OPS-01 forEachFarmPaged', () => {
  it('201개 농장 전부 처리 (예전: 200개 상한)', async () => {
    const seen: string[] = [];
    const r = await forEachFarmPaged(fetchPage(100), async (id) => { seen.push(id); }, () => undefined, 100);
    expect(r.scanned).toBe(201);
    expect(new Set(seen).size).toBe(201);
  });
  it('한 농장 실패가 나머지를 막지 않고 실패 수를 센다', async () => {
    const errors: string[] = [];
    const r = await forEachFarmPaged(fetchPage(50), async (id) => { if (id === 'farm-0003') throw new Error('x'); },
      (_e, id) => { errors.push(id); }, 50);
    expect(r).toEqual({ scanned: 201, failed: 1 });
    expect(errors).toEqual(['farm-0003']);
  });
});
