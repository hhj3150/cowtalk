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

// OPS-05 회귀 — 최근 6시간만 저장해 ~20시간 순환 동안 대부분의 센서 데이터가 버려지던 문제
describe('OPS-05 sensorFromFor', () => {
  it('마지막 저장 이후부터 (최근 저장이 있으면 그 시각)', async () => {
    const { sensorFromFor } = await import('../orchestrator.js');
    const def = new Date('2026-10-17T12:00:00Z');
    expect(sensorFromFor(new Date('2026-10-18T20:00:00Z'), def).toISOString()).toBe('2026-10-18T20:00:00.000Z');
  });
  it('저장 이력이 없거나 48시간보다 오래면 48시간 전부터 (예전: 6시간)', async () => {
    const { sensorFromFor, SENSOR_MAX_BACKFILL_MS } = await import('../orchestrator.js');
    const def = new Date('2026-10-17T12:00:00Z');
    expect(sensorFromFor(undefined, def)).toBe(def);
    expect(sensorFromFor(new Date('2026-10-01T00:00:00Z'), def)).toBe(def);
    expect(SENSOR_MAX_BACKFILL_MS).toBe(48 * 3600 * 1000);
  });
});
