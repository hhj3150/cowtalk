import { describe, it, expect, vi } from 'vitest';

vi.mock('../../config/database.js', () => ({ getDb: vi.fn() }));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { planFarmPresence, readPresencePolicy, SMAXTEC_REMOVED } from '../sync-presence.js';
import type { PresenceRow } from '../sync-presence.js';

const NOW = new Date('2026-11-01T12:00:00Z');
const H = 3_600_000;
const POLICY = { minCycles: 3, minHours: 6, maxMissingRatio: 0.5, sensedWithinHours: 72 };

function row(id: string, over: Partial<PresenceRow> = {}): PresenceRow {
  return { animalId: id, externalId: `ext-${id}`, status: 'active', inactiveReason: null, syncMissingCount: 0, syncMissingSince: null, ...over };
}
/** 송영신목장 형태: 48두 중 11두가 smaXtec 목록에서 빠짐 */
function herd(missingOver: Partial<PresenceRow> = {}): { rows: PresenceRow[]; present: Set<string> } {
  const rows = Array.from({ length: 48 }, (_, i) => (i < 11 ? row(`c${i}`, missingOver) : row(`c${i}`)));
  const present = new Set(rows.slice(11).map((r) => r.externalId));
  return { rows, present };
}

describe('planFarmPresence — smaXtec 목록에서 빠진 개체', () => {
  it('처음 빠진 사이클: 카운트만 올리고 비활성하지 않는다', () => {
    const { rows, present } = herd();
    const p = planFarmPresence(rows, present, NOW, POLICY);
    expect(p.seen).toHaveLength(37);
    expect(p.missing).toHaveLength(11);
    expect(p.deactivate).toHaveLength(0);
    expect(p.held).toBe(false);
  });

  it('3회째라도 6시간이 안 지났으면 유예 (5분 주기 15분 만에 비활성 금지)', () => {
    const { rows, present } = herd({ syncMissingCount: 5, syncMissingSince: new Date(NOW.getTime() - 1 * H) });
    expect(planFarmPresence(rows, present, NOW, POLICY).deactivate).toHaveLength(0);
  });

  it('3회 이상 + 6시간 경과 → 비활성 (송영신 48 → 37)', () => {
    const { rows, present } = herd({ syncMissingCount: 2, syncMissingSince: new Date(NOW.getTime() - 7 * H) });
    const p = planFarmPresence(rows, present, NOW, POLICY);
    expect(p.deactivate).toHaveLength(11);
    expect(p.seen).toHaveLength(37);
  });

  it('최근 센서 데이터가 있는 개체는 유예가 끝나도 비활성하지 않는다 (응답 누락 방어)', () => {
    const { rows, present } = herd({ syncMissingCount: 9, syncMissingSince: new Date(NOW.getTime() - 24 * H) });
    const p = planFarmPresence(rows, present, NOW, POLICY, new Set(['c0', 'c1']));
    expect(p.deactivate).toHaveLength(9);
    expect(p.protectedBySensor).toEqual(['c0', 'c1']);
    expect(p.missing).toEqual(expect.arrayContaining(['c0', 'c1']));
  });

  it('active 의 절반 넘게 빠지면 목장 전체 보류 (빈 응답·이상 응답 방어)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`a${i}`, { syncMissingCount: 9, syncMissingSince: new Date(0) }));
    const p = planFarmPresence(rows, new Set(['ext-a0', 'ext-a1', 'ext-a2', 'ext-a3']), NOW, POLICY);
    expect(p.held).toBe(true);
    expect(p.deactivate).toHaveLength(0);
    expect(p.missing).toHaveLength(0);
  });

  it('응답이 비어도(목장 개체 0) 전부 비활성하지 않는다', () => {
    const rows = Array.from({ length: 5 }, (_, i) => row(`z${i}`, { syncMissingCount: 9, syncMissingSince: new Date(0) }));
    expect(planFarmPresence(rows, new Set(), NOW, POLICY).deactivate).toHaveLength(0);
  });

  it('smaxtec_removed 로 비활성됐던 개체가 다시 나타나면 재활성 대상', () => {
    const rows = [row('r1', { status: 'inactive', inactiveReason: SMAXTEC_REMOVED }), row('r2')];
    const p = planFarmPresence(rows, new Set(['ext-r1', 'ext-r2']), NOW, POLICY);
    expect(p.reappeared).toEqual(['r1']);
    expect(p.seen).toEqual(['r1', 'r2']);
  });

  it('이미 inactive 인 개체(사람이 처리한 것 포함)는 건드리지 않는다', () => {
    const rows = [row('m1', { status: 'inactive', inactiveReason: 'manual' }), row('m2'), row('m3')];
    const p = planFarmPresence(rows, new Set(['ext-m2', 'ext-m3']), NOW, POLICY);
    expect(p.missing).toHaveLength(0);
    expect(p.reappeared).toHaveLength(0);
  });
});

describe('readPresencePolicy', () => {
  it('기본 3회·6시간, 환경변수로 조정, 잘못된 값은 기본값', () => {
    expect(readPresencePolicy({})).toMatchObject({ minCycles: 3, minHours: 6 });
    expect(readPresencePolicy({ SMAXTEC_MISSING_CYCLES: '5', SMAXTEC_MISSING_MIN_HOURS: '12' })).toMatchObject({ minCycles: 5, minHours: 12 });
    expect(readPresencePolicy({ SMAXTEC_MISSING_CYCLES: 'x', SMAXTEC_MISSING_MIN_HOURS: '-1' })).toMatchObject({ minCycles: 3, minHours: 6 });
  });
});
