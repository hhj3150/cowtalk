// OPS-14 회귀 — 백필 때 과거 이벤트 전부를 새 알람으로 방송하고 스냅샷을 제한 없이 띄우던 문제
// + DI-10 후속: 충돌로 건너뛴 행이 있으면 returning[i] 와 values[i] 가 어긋나 알람에 다른 개체가 붙던 문제
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ getDb: () => ({}) }));
const { pairInsertedRows, selectBroadcastable, runWithConcurrency } = await import('../sync.service.js');

const NOW = Date.parse('2026-10-20T00:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000);

describe('pairInsertedRows', () => {
  it('중간 행이 충돌로 빠져도 외부 ID 로 정확히 짝짓는다', () => {
    const values = [
      { externalEventId: 'e1', detectedAt: hoursAgo(1), animalId: 'A' },
      { externalEventId: 'e2', detectedAt: hoursAgo(1), animalId: 'B' }, // 이미 있음 → 건너뜀
      { externalEventId: 'e3', detectedAt: hoursAgo(1), animalId: 'C' },
    ];
    const rows = [{ eventId: 'r1', externalEventId: 'e1' }, { eventId: 'r3', externalEventId: 'e3' }];
    expect(pairInsertedRows(rows, values).map(({ row, v }) => [row.eventId, v.animalId])).toEqual([['r1', 'A'], ['r3', 'C']]);
  });
});

describe('OPS-14 selectBroadcastable', () => {
  it('최근 24시간 것만 방송', () => {
    const items = [hoursAgo(1), hoursAgo(23.9), hoursAgo(25), hoursAgo(24 * 90)].map((d, i) => ({ v: { detectedAt: d, id: i } }));
    expect(selectBroadcastable(items, NOW).map((x) => x.v.id)).toEqual([0, 1]);
  });
});

describe('OPS-14 runWithConcurrency', () => {
  it('동시 실행 수가 한도를 넘지 않고 전부 처리', async () => {
    let active = 0; let peak = 0; const done: number[] = [];
    await runWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async (i) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active--; done.push(i);
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(done.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});
