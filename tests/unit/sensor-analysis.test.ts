// sensor-analysis.ts 단위 테스트
import { describe, it, expect } from 'vitest';
import {
  computeComparisonStats,
  computePersonalBaseline,
  assessAgainstBaseline,
  computeTimeOfDayAnalysis,
  computeAdjustedThresholds,
  type DailyAggRow,
  type HourlyAggRow,
} from '../../packages/server/src/ai-brain/tools/sensor-analysis.js';

// ── 테스트 데이터 ──

function makeDailyRows(avgs: readonly number[]): DailyAggRow[] {
  // avgs[0] = 가장 최근 (DESC 순)
  return avgs.map((avg, i) => ({
    date: `2026-04-${String(8 - i).padStart(2, '0')}`,
    avg,
    min: avg - 0.3,
    max: avg + 0.3,
    count: 24,
  }));
}

// ── Phase 1: 비교 통계 ──

describe('computeComparisonStats', () => {
  it('빈 배열이면 모든 값이 null/0', () => {
    const result = computeComparisonStats([]);
    expect(result.todayVsYesterday).toBeNull();
    expect(result.rateOfChange).toBe(0);
    expect(result.anomalyScore).toBe(0);
  });

  it('2일 데이터로 어제 대비 계산', () => {
    const rows = makeDailyRows([39.0, 38.5]);
    const result = computeComparisonStats(rows);
    expect(result.todayVsYesterday).not.toBeNull();
    expect(result.todayVsYesterday!.delta).toBeCloseTo(0.5, 1);
    expect(result.todayVsYesterday!.pctChange).toBeGreaterThan(0);
  });

  it('7일 데이터로 3일 vs 7일 평균 비교', () => {
    const rows = makeDailyRows([39.2, 39.1, 39.0, 38.8, 38.7, 38.6, 38.5]);
    const result = computeComparisonStats(rows);
    expect(result.threeDayVsSevenDay).not.toBeNull();
    expect(result.threeDayVsSevenDay!.avg3d).toBeGreaterThan(result.threeDayVsSevenDay!.avg7d);
    expect(result.threeDayVsSevenDay!.delta).toBeGreaterThan(0);
  });

  it('14일 데이터로 7일 vs 30일 평균 비교', () => {
    const rows = makeDailyRows([39.0, 39.0, 39.0, 39.0, 39.0, 39.0, 39.0,
                                 38.5, 38.5, 38.5, 38.5, 38.5, 38.5, 38.5]);
    const result = computeComparisonStats(rows);
    expect(result.sevenDayVsThirtyDay).not.toBeNull();
    expect(result.sevenDayVsThirtyDay!.avg7d).toBeGreaterThan(result.sevenDayVsThirtyDay!.avg30d);
  });

  it('상승 추세에서 rateOfChange가 양수', () => {
    // ASC 기준 상승 = DESC 기준 최근이 높음
    const rows = makeDailyRows([39.5, 39.3, 39.1, 38.9, 38.7, 38.5, 38.3]);
    const result = computeComparisonStats(rows);
    expect(result.rateOfChange).toBeGreaterThan(0);
  });

  it('anomalyScore 계산', () => {
    // 모두 38.5인데 오늘만 40.0
    const rows = makeDailyRows([40.0, 38.5, 38.5, 38.5, 38.5, 38.5, 38.5, 38.5, 38.5, 38.5]);
    const result = computeComparisonStats(rows);
    expect(result.anomalyScore).toBeGreaterThan(2); // 2σ 이상
  });
});

// ── Phase 2: 개체별 기준선 ──

describe('computePersonalBaseline', () => {
  it('30일 데이터에서 기준선 계산', () => {
    const rows = makeDailyRows(Array.from({ length: 30 }, () => 38.5 + Math.random() * 0.6));
    const baseline = computePersonalBaseline('temperature', rows);
    expect(baseline.sampleDays).toBe(30);
    expect(baseline.avg).toBeGreaterThan(38.0);
    expect(baseline.avg).toBeLessThan(39.5);
    expect(baseline.min95).toBeLessThan(baseline.avg);
    expect(baseline.max95).toBeGreaterThan(baseline.avg);
  });

  it('stddev가 양수', () => {
    const rows = makeDailyRows([38.5, 38.7, 38.3, 38.6, 38.4, 38.8, 38.2]);
    const baseline = computePersonalBaseline('temperature', rows);
    expect(baseline.stddev).toBeGreaterThan(0);
  });
});

describe('assessAgainstBaseline', () => {
  it('정상 범위 내 값', () => {
    const baseline = { metric: 'temperature', avg: 38.5, stddev: 0.3, min95: 37.91, max95: 39.09, sampleDays: 30 };
    const result = assessAgainstBaseline(38.6, baseline);
    expect(result.withinNormal).toBe(true);
    expect(result.interpretation).toBe('정상');
  });

  it('2σ 초과 이탈', () => {
    const baseline = { metric: 'temperature', avg: 38.5, stddev: 0.3, min95: 37.91, max95: 39.09, sampleDays: 30 };
    const result = assessAgainstBaseline(39.5, baseline);
    expect(result.withinNormal).toBe(false);
    expect(result.deviationSigma).toBeGreaterThan(2);
  });

  it('심각한 이탈 (3σ 초과)', () => {
    const baseline = { metric: 'temperature', avg: 38.5, stddev: 0.3, min95: 37.91, max95: 39.09, sampleDays: 30 };
    const result = assessAgainstBaseline(40.0, baseline);
    expect(result.interpretation).toBe('심각한 이탈');
  });
});

// ── Phase 3: 시간대별 패턴 ──

describe('computeTimeOfDayAnalysis', () => {
  function makeHourlyRows(pattern: 'afternoon' | 'whole' | 'normal'): HourlyAggRow[] {
    const rows: HourlyAggRow[] = [];
    // 7일 × 24시간
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const kstHour = h;  // 이미 KST라 가정
        const utcHour = (kstHour - 9 + 24) % 24;
        let temp: number;
        if (pattern === 'afternoon' && kstHour >= 12 && kstHour < 18) {
          temp = 39.8; // 오후만 높음
        } else if (pattern === 'whole') {
          temp = 39.5; // 전일 높음
        } else {
          temp = 38.5; // 정상
        }
        const dateStr = `2026-04-${String(8 - d).padStart(2, '0')}`;
        rows.push({
          hour: `${dateStr}T${String(utcHour).padStart(2, '0')}:00:00.000Z`,
          avg: temp,
          min: temp - 0.2,
          max: temp + 0.2,
          count: 6,
        });
      }
    }
    return rows;
  }

  it('오후 발열 패턴 감지', () => {
    const rows = makeHourlyRows('afternoon');
    const result = computeTimeOfDayAnalysis(rows, '2026-04-08');
    expect(result.patternType).toBe('afternoon_fever');
  });

  it('전일 발열 패턴 감지', () => {
    const rows = makeHourlyRows('whole');
    const result = computeTimeOfDayAnalysis(rows, '2026-04-08');
    expect(result.patternType).toBe('whole_day_fever');
  });

  it('정상 패턴', () => {
    const rows = makeHourlyRows('normal');
    const result = computeTimeOfDayAnalysis(rows, '2026-04-08');
    expect(result.patternType).toBe('normal');
  });

  it('4개 시간대 블록 생성', () => {
    const rows = makeHourlyRows('normal');
    const result = computeTimeOfDayAnalysis(rows, '2026-04-08');
    expect(result.todayBlocks).toHaveLength(4);
    expect(result.weekAvgBlocks).toHaveLength(4);
  });
});

// ── Phase 4: 품종/산차/DIM 보정 ──

describe('computeAdjustedThresholds', () => {
  it('홀스타인 기본 임계값', () => {
    const result = computeAdjustedThresholds({
      breed: 'holstein', breedType: 'dairy', parity: 2, daysInMilk: 100, lactationStatus: 'milking',
    });
    expect(result.temperature.normalMin).toBeCloseTo(37.7, 1);
    expect(result.temperature.normalMax).toBeCloseTo(39.3, 1);
    expect(result.temperature.feverThreshold).toBeCloseTo(39.7, 1);
  });

  it('저지 품종은 체온 기준이 더 높음', () => {
    const holstein = computeAdjustedThresholds({
      breed: 'holstein', breedType: 'dairy', parity: 2, daysInMilk: 100, lactationStatus: 'milking',
    });
    const jersey = computeAdjustedThresholds({
      breed: 'jersey', breedType: 'dairy', parity: 2, daysInMilk: 100, lactationStatus: 'milking',
    });
    expect(jersey.temperature.normalMax).toBeGreaterThan(holstein.temperature.normalMax);
  });

  it('DIM 0-5 분만 직후 발열 임계값 상향', () => {
    const normal = computeAdjustedThresholds({
      breed: 'holstein', breedType: 'dairy', parity: 2, daysInMilk: 100, lactationStatus: 'milking',
    });
    const postpartum = computeAdjustedThresholds({
      breed: 'holstein', breedType: 'dairy', parity: 2, daysInMilk: 3, lactationStatus: 'milking',
    });
    expect(postpartum.temperature.feverThreshold).toBeGreaterThan(normal.temperature.feverThreshold);
    expect(postpartum.adjustmentReasons.some((r) => r.includes('분만 직후'))).toBe(true);
  });

  it('건유기 반추 기준 하향', () => {
    const result = computeAdjustedThresholds({
      breed: 'holstein', breedType: 'dairy', parity: 3, daysInMilk: null, lactationStatus: 'dry',
    });
    expect(result.rumination.normalMin).toBeLessThan(300);
  });

  it('초산우 보정 사유 포함', () => {
    const result = computeAdjustedThresholds({
      breed: 'holstein', breedType: 'dairy', parity: 1, daysInMilk: 50, lactationStatus: 'milking',
    });
    expect(result.adjustmentReasons.some((r) => r.includes('초산우'))).toBe(true);
  });
});
