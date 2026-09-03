import { describe, it, expect } from 'vitest';
import { buildRosterHint, matchRoster, type RosterEntry } from '../roster.js';

const roster: readonly RosterEntry[] = [
  { earTag: '423' },
  { earTag: '1877' },
  { earTag: '1902' },
  { earTag: '2016' },
];

describe('buildRosterHint', () => {
  it('실제 번호를 STT 힌트 문자열로 만든다', () => {
    const hint = buildRosterHint(roster);
    expect(hint).toHaveLength(1);
    expect(hint[0]).toContain('1877');
    expect(hint[0]).toContain('개체번호');
  });

  it('로스터가 비면 힌트도 없다 — 빈 힌트를 억지로 넣지 않는다', () => {
    expect(buildRosterHint([])).toEqual([]);
  });

  it('숫자가 아닌 관리번호는 힌트에서 뺀다', () => {
    const hint = buildRosterHint([{ earTag: 'KR-A-01' }, { earTag: '423' }]);
    expect(hint[0]).toBe('개체번호: 423');
  });
});

describe('matchRoster', () => {
  it('로스터에 있으면 exact', () => {
    expect(matchRoster(['1877'], roster)).toEqual({ exact: '1877', near: [] });
  });

  it('한 글자 차이면 근접 후보를 준다 — 조용히 고치지 않는다', () => {
    const m = matchRoster(['1878'], roster);
    expect(m.exact).toBeUndefined();
    expect(m.near).toContain('1877');
  });

  it('근접 후보에도 확정 값을 넣지 않는다 (exact 는 여전히 없음)', () => {
    expect(matchRoster(['1878'], roster).exact).toBeUndefined();
  });

  it('아주 다른 번호는 근접 후보가 없다', () => {
    expect(matchRoster(['5555'], roster).near).toEqual([]);
  });

  it('자릿수가 다르면 근접으로 보지 않는다 — 423 과 4230 은 다른 소다', () => {
    expect(matchRoster(['4230'], roster).near).toEqual([]);
  });

  it('로스터가 비면 판단하지 않는다', () => {
    expect(matchRoster(['1877'], [])).toEqual({ near: [] });
  });

  it('후보가 여럿이면 하나라도 맞으면 exact', () => {
    expect(matchRoster(['9999', '423'], roster).exact).toBe('423');
  });

  it('근접 후보는 최대 3개', () => {
    const big = Array.from({ length: 20 }, (_, i) => ({ earTag: String(1800 + i) }));
    expect(matchRoster(['1805'], big).exact).toBe('1805');
    // 1899 는 없다 — 1809/1819 등 여러 개가 한 글자 차이지만 3개까지만 준다
    const near = matchRoster(['1899'], big).near;
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThanOrEqual(3);
  });
});
