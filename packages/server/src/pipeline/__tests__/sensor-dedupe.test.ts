// DI-09 회귀 — 센서 측정값 중복 저장
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ getDb: () => ({}) }));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const { filterNewMeasurements } = await import('../orchestrator.js');

const at = (iso: string): { timestamp: Date } => ({ timestamp: new Date(iso) });

describe('DI-09 filterNewMeasurements', () => {
  it('이미 저장된 시각은 다시 넣지 않는다 (겹치는 6시간 구간 재수집)', () => {
    const r = filterNewMeasurements([at('2026-10-19T01:00:00Z'), at('2026-10-19T01:10:00Z')], [new Date('2026-10-19T01:00:00Z')]);
    expect(r.map((v) => v.timestamp.toISOString())).toEqual(['2026-10-19T01:10:00.000Z']);
  });
  it('한 배치 안의 같은 시각도 하나만', () => {
    expect(filterNewMeasurements([at('2026-10-19T01:00:00Z'), at('2026-10-19T01:00:00Z')], [])).toHaveLength(1);
  });
  it('새 데이터는 모두 통과', () => {
    expect(filterNewMeasurements([at('2026-10-19T02:00:00Z')], [])).toHaveLength(1);
  });
});
