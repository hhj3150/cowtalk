import { describe, it, expect } from 'vitest';
import {
  completeBehaviorMetrics,
  computeBehaviorTrend,
  mapBehaviorCsv,
  normalizeBehaviorDate,
  normalizeBehaviorGroup,
  validateBehaviorRows,
} from '../constants/behavior.js';
import { parseDelimited } from '../utils/milk-csv.js';
import type { BehaviorDailyRecord } from '../types/behavior.js';

describe('validateBehaviorRows', () => {
  it('정상 행을 받고 파생값(기립 합계·반추 비율)을 채운다', () => {
    const v = validateBehaviorRows([{
      date: '2026-11-04', groupKey: 'lactating',
      metrics: { lyingHours: 13.4, standingActiveHours: 3, standingInactiveHours: 4.2, movingHours: 3.4, ruminationLyingMin: 408, ruminationStandingMin: 102 },
    }]);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const m = v.rows[0]!.metrics;
    expect(m.standingHours).toBe(7.2);
    expect(m.ruminationLyingPct).toBe(80);
    expect(m.ruminationStandingPct).toBe(20);
  });

  it('원값이 있으면 파생값으로 덮어쓰지 않는다', () => {
    expect(completeBehaviorMetrics({ ruminationLyingMin: 408, ruminationStandingMin: 102, ruminationLyingPct: 76 }).ruminationLyingPct).toBe(76);
  });

  it('날짜·그룹·범위·빈 지표·24시간 초과·행 수 상한 거부', () => {
    expect(validateBehaviorRows([{ date: '11/04/2026', metrics: { lyingHours: 12 } }]).ok).toBe(false);
    expect(validateBehaviorRows([{ date: '2026-11-04', groupKey: 'xx', metrics: { lyingHours: 12 } }]).ok).toBe(false);
    expect(validateBehaviorRows([{ date: '2026-11-04', metrics: { lyingHours: 30 } }]).ok).toBe(false);
    expect(validateBehaviorRows([{ date: '2026-11-04', metrics: { animalCount: 40 } }]).ok).toBe(false);
    expect(validateBehaviorRows([{ date: '2026-11-04', metrics: { lyingHours: 14, standingHours: 9, movingHours: 4 } }]).ok).toBe(false);
    expect(validateBehaviorRows([{ date: '2026-11-04', metrics: { foo: 1 } }]).ok).toBe(false);
    expect(validateBehaviorRows(Array.from({ length: 401 }, () => ({ date: '2026-11-04', metrics: { lyingHours: 12 } }))).ok).toBe(false);
    expect(validateBehaviorRows([]).ok).toBe(false);
  });
});

describe('CSV 열 매핑', () => {
  it('한글 헤더 + 그룹 열', () => {
    const t = parseDelimited('날짜,그룹,횡와시간,기립시간,이동시간,두수\n2026-11-04,착유우,13.4,7.2,3.4,30\n2026.11.05,건유,14.1,6.8,3.1,7');
    const r = mapBehaviorCsv(t);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: '2026-11-04', groupKey: 'lactating', metrics: { lyingHours: 13.4, standingHours: 7.2, movingHours: 3.4, animalCount: 30 } });
    expect(r.rows[1]!.groupKey).toBe('dry');
    expect(r.rows[1]!.date).toBe('2026-11-05');
  });

  it('영문 헤더(단위 표기 포함) + 반추 자세 분/비율 구분, 동시 횡와율이 횡와시간으로 잘못 붙지 않음', () => {
    const t = parseDelimited([
      'Date;Lying time (h);Standing time (h);Rumination while lying (min);Rumination while standing (min);Rumination while lying (%);Lying sync (%)',
      '04.11.2026;13,4;7,2;408;102;80;66',
    ].join('\n'));
    const r = mapBehaviorCsv(t, 'lactating');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      date: '2026-11-04', groupKey: 'lactating',
      metrics: { lyingHours: 13.4, standingHours: 7.2, ruminationLyingMin: 408, ruminationStandingMin: 102, ruminationLyingPct: 80, peakLyingSyncPct: 66 },
    });
  });

  it('날짜 열이 없으면 저장할 행이 없다, 모르는 열은 무시 목록', () => {
    const r = mapBehaviorCsv(parseDelimited('그룹,횡와시간,메모\n착유우,13,비고'));
    expect(r.rows).toHaveLength(0);
    expect(r.unmatchedHeaders).toContain('메모');
  });

  it('그룹·날짜 표기 정규화', () => {
    expect(normalizeBehaviorGroup('Lactating cows')).toBe('lactating');
    expect(normalizeBehaviorGroup('Close-up')).toBe('close_up');
    expect(normalizeBehaviorGroup('분만 후')).toBe('fresh');
    expect(normalizeBehaviorGroup('')).toBe('all');
    expect(normalizeBehaviorDate('2026/1/5')).toBe('2026-01-05');
    expect(normalizeBehaviorDate('어제')).toBeNull();
  });
});

describe('computeBehaviorTrend', () => {
  const rec = (date: string, lying: number): BehaviorDailyRecord =>
    ({ farmId: 'f', groupKey: 'lactating', date, source: 'csv_upload', metrics: { lyingHours: lying } });

  it('최신값 vs 직전 7일 평균 (최신일 제외)', () => {
    const prior = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'];
    // 10-27 은 최신일(11-04)에서 8일 전 — 직전 7일 평균에서 빠져야 한다
    const records = [rec('2026-10-27', 9), ...prior.map((d) => rec(d, 13)), rec('2026-11-04', 11.5)];
    const t = computeBehaviorTrend(records, 'lactating', 'lyingHours');
    expect(t.latest).toBe(11.5);
    expect(t.prior7Avg).toBe(13);
    expect(t.deltaVsPrior7).toBe(-1.5);
    expect(t.priorDays).toBe(7);
  });

  it('데이터 없으면 null', () => {
    expect(computeBehaviorTrend([], 'all', 'lyingHours').latest).toBeNull();
  });
});
