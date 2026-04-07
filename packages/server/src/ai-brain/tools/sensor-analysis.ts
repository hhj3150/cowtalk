// 센서 분석 유틸리티 — 비교 통계, 개체 기준선, 시간대 패턴, 품종 보정
// tool-executor.ts의 querySensorData에서 호출

// ── 타입 ──

export interface DailyAggRow {
  readonly date: string;
  readonly avg: number;
  readonly min: number;
  readonly max: number;
  readonly count: number;
  readonly stddev?: number;
}

export interface HourlyAggRow {
  readonly hour: string;  // ISO timestamp
  readonly avg: number;
  readonly min: number;
  readonly max: number;
  readonly count: number;
}

// ── Phase 1: 비교 통계 ──

export interface ComparisonStats {
  readonly todayVsYesterday: {
    readonly todayAvg: number;
    readonly yesterdayAvg: number;
    readonly delta: number;
    readonly pctChange: number;
  } | null;
  readonly threeDayVsSevenDay: {
    readonly avg3d: number;
    readonly avg7d: number;
    readonly delta: number;
  } | null;
  readonly sevenDayVsThirtyDay: {
    readonly avg7d: number;
    readonly avg30d: number;
    readonly delta: number;
  } | null;
  readonly rateOfChange: number;     // 단위/일 (선형회귀 기울기)
  readonly anomalyScore: number;     // 30일 평균 대비 σ
}

export function computeComparisonStats(rows: readonly DailyAggRow[]): ComparisonStats {
  if (rows.length === 0) {
    return { todayVsYesterday: null, threeDayVsSevenDay: null, sevenDayVsThirtyDay: null, rateOfChange: 0, anomalyScore: 0 };
  }

  // rows는 DESC 정렬 (rows[0] = 가장 최근)
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date)); // ASC로 변환
  const avgs = sorted.map((r) => r.avg);

  // 어제 vs 오늘
  const todayVsYesterday = rows.length >= 2
    ? (() => {
        const todayAvg = round2(rows[0]!.avg);
        const yesterdayAvg = round2(rows[1]!.avg);
        const delta = round2(todayAvg - yesterdayAvg);
        const pctChange = yesterdayAvg !== 0 ? round2((delta / yesterdayAvg) * 100) : 0;
        return { todayAvg, yesterdayAvg, delta, pctChange };
      })()
    : null;

  // 3일 평균 vs 7일 평균
  const threeDayVsSevenDay = rows.length >= 7
    ? (() => {
        const avg3d = round2(mean(rows.slice(0, 3).map((r) => r.avg)));
        const avg7d = round2(mean(rows.slice(0, 7).map((r) => r.avg)));
        return { avg3d, avg7d, delta: round2(avg3d - avg7d) };
      })()
    : null;

  // 7일 평균 vs 30일 평균
  const sevenDayVsThirtyDay = rows.length >= 14
    ? (() => {
        const avg7d = round2(mean(rows.slice(0, 7).map((r) => r.avg)));
        const avg30d = round2(mean(rows.map((r) => r.avg)));
        return { avg7d, avg30d, delta: round2(avg7d - avg30d) };
      })()
    : null;

  // 변화율 (선형회귀 기울기)
  const rateOfChange = round3(linearSlope(avgs));

  // 이상치 점수
  const allMean = mean(avgs);
  const allStddev = stddev(avgs);
  const todayAvg = rows[0]!.avg;
  const anomalyScore = allStddev > 0 ? round2((todayAvg - allMean) / allStddev) : 0;

  return { todayVsYesterday, threeDayVsSevenDay, sevenDayVsThirtyDay, rateOfChange, anomalyScore };
}

// ── Phase 2: 개체별 기준선 ──

export interface PersonalBaseline {
  readonly metric: string;
  readonly avg: number;
  readonly stddev: number;
  readonly min95: number;
  readonly max95: number;
  readonly sampleDays: number;
}

export interface BaselineAssessment {
  readonly withinNormal: boolean;
  readonly deviationSigma: number;
  readonly interpretation: string;  // '정상' | '경미한 이탈' | '주의' | '심각한 이탈'
}

export function computePersonalBaseline(metric: string, rows: readonly DailyAggRow[]): PersonalBaseline {
  const avgs = rows.map((r) => r.avg);
  const avgVal = round2(mean(avgs));
  const sd = round2(stddev(avgs));

  return {
    metric,
    avg: avgVal,
    stddev: sd,
    min95: round2(avgVal - 1.96 * sd),
    max95: round2(avgVal + 1.96 * sd),
    sampleDays: rows.length,
  };
}

export function assessAgainstBaseline(
  currentValue: number,
  baseline: PersonalBaseline,
): BaselineAssessment {
  const sigma = baseline.stddev > 0
    ? round2((currentValue - baseline.avg) / baseline.stddev)
    : 0;
  const absSigma = Math.abs(sigma);

  let interpretation: string;
  if (absSigma <= 1) interpretation = '정상';
  else if (absSigma <= 2) interpretation = '경미한 이탈';
  else if (absSigma <= 3) interpretation = '주의';
  else interpretation = '심각한 이탈';

  return {
    withinNormal: absSigma <= 2,
    deviationSigma: sigma,
    interpretation,
  };
}

// ── Phase 3: 시간대별 패턴 ──

export type TimeBlock = 'dawn' | 'morning' | 'afternoon' | 'night';

export interface BlockPattern {
  readonly block: TimeBlock;
  readonly hours: string;
  readonly avg: number;
  readonly min: number;
  readonly max: number;
  readonly count: number;
}

export type FeverPattern = 'afternoon_fever' | 'whole_day_fever' | 'dawn_hypothermia' | 'normal';

export interface TimeOfDayAnalysis {
  readonly todayBlocks: readonly BlockPattern[];
  readonly weekAvgBlocks: readonly BlockPattern[];
  readonly patternType: FeverPattern;
  readonly todayVsWeekDelta: Readonly<Record<TimeBlock, number>>;
}

const BLOCK_DEFS: readonly { readonly block: TimeBlock; readonly hours: string; readonly startHour: number; readonly endHour: number }[] = [
  { block: 'dawn', hours: '00:00-06:00', startHour: 0, endHour: 6 },
  { block: 'morning', hours: '06:00-12:00', startHour: 6, endHour: 12 },
  { block: 'afternoon', hours: '12:00-18:00', startHour: 12, endHour: 18 },
  { block: 'night', hours: '18:00-24:00', startHour: 18, endHour: 24 },
];

export function computeTimeOfDayAnalysis(
  hourlyRows: readonly HourlyAggRow[],
  todayDate: string,  // YYYY-MM-DD
): TimeOfDayAnalysis {
  const KST_OFFSET = 9; // UTC+9

  const getBlock = (isoHour: string): TimeBlock => {
    const utcHour = new Date(isoHour).getUTCHours();
    const kstHour = (utcHour + KST_OFFSET) % 24;
    if (kstHour < 6) return 'dawn';
    if (kstHour < 12) return 'morning';
    if (kstHour < 18) return 'afternoon';
    return 'night';
  };

  const isToday = (isoHour: string): boolean => isoHour.startsWith(todayDate);

  // 오늘 데이터
  const todayRows = hourlyRows.filter((r) => isToday(r.hour));
  const weekRows = hourlyRows;

  const buildBlocks = (subset: readonly HourlyAggRow[]): readonly BlockPattern[] =>
    BLOCK_DEFS.map((def) => {
      const blockRows = subset.filter((r) => getBlock(r.hour) === def.block);
      if (blockRows.length === 0) {
        return { block: def.block, hours: def.hours, avg: 0, min: 0, max: 0, count: 0 };
      }
      return {
        block: def.block,
        hours: def.hours,
        avg: round2(mean(blockRows.map((r) => r.avg))),
        min: round2(Math.min(...blockRows.map((r) => r.min))),
        max: round2(Math.max(...blockRows.map((r) => r.max))),
        count: blockRows.reduce((sum, r) => sum + r.count, 0),
      };
    });

  const todayBlocks = buildBlocks(todayRows);
  const weekAvgBlocks = buildBlocks(weekRows);

  // 오늘 vs 주간 평균 차이
  const todayVsWeekDelta: Record<TimeBlock, number> = { dawn: 0, morning: 0, afternoon: 0, night: 0 };
  for (const def of BLOCK_DEFS) {
    const tb = todayBlocks.find((b) => b.block === def.block);
    const wb = weekAvgBlocks.find((b) => b.block === def.block);
    if (tb && wb && tb.count > 0 && wb.count > 0) {
      todayVsWeekDelta[def.block] = round2(tb.avg - wb.avg);
    }
  }

  // 패턴 분류
  const patternType = classifyFeverPattern(todayBlocks, weekAvgBlocks);

  return { todayBlocks, weekAvgBlocks, patternType, todayVsWeekDelta };
}

function classifyFeverPattern(
  todayBlocks: readonly BlockPattern[],
  weekBlocks: readonly BlockPattern[],
): FeverPattern {
  const afternoonToday = todayBlocks.find((b) => b.block === 'afternoon');
  const morningToday = todayBlocks.find((b) => b.block === 'morning');
  const dawnToday = todayBlocks.find((b) => b.block === 'dawn');
  const afternoonWeek = weekBlocks.find((b) => b.block === 'afternoon');

  if (!afternoonToday || afternoonToday.count === 0) return 'normal';

  // 새벽 저체온
  if (dawnToday && dawnToday.count > 0 && dawnToday.avg < 37.5) {
    return 'dawn_hypothermia';
  }

  // 오후만 발열 (열스트레스 패턴)
  const afternoonElevated = afternoonToday.avg > 39.5;
  const morningNormal = !morningToday || morningToday.count === 0 || morningToday.avg < 39.3;
  const dawnNormal = !dawnToday || dawnToday.count === 0 || dawnToday.avg < 39.3;

  if (afternoonElevated && morningNormal && dawnNormal) {
    return 'afternoon_fever';
  }

  // 전체 발열 (감염 패턴)
  const allElevated = todayBlocks.filter((b) => b.count > 0).every((b) => b.avg > 39.3);
  if (allElevated) {
    return 'whole_day_fever';
  }

  // 오후 블록이 주간 평균보다 0.5도 이상 높으면 afternoon_fever
  if (afternoonWeek && afternoonWeek.count > 0 && afternoonToday.avg - afternoonWeek.avg > 0.5) {
    return 'afternoon_fever';
  }

  return 'normal';
}

// ── Phase 4: 품종/산차/DIM 보정 ──

export interface AnimalContext {
  readonly breed: string;
  readonly breedType: string;
  readonly parity: number;
  readonly daysInMilk: number | null;
  readonly lactationStatus: string;
}

export interface AdjustedThresholds {
  readonly temperature: { readonly normalMin: number; readonly normalMax: number; readonly feverThreshold: number };
  readonly rumination: { readonly normalMin: number; readonly normalMax: number };
  readonly adjustmentReasons: readonly string[];
}

const BREED_BASELINES: Readonly<Record<string, { center: number; label: string }>> = {
  holstein:  { center: 38.5, label: '홀스타인' },
  jersey:    { center: 38.8, label: '저지' },
  hanwoo:    { center: 38.6, label: '한우' },
  angus:     { center: 38.5, label: '앵거스' },
  simmental: { center: 38.6, label: '짐멘탈' },
};

export function computeAdjustedThresholds(animal: AnimalContext): AdjustedThresholds {
  const reasons: string[] = [];

  // 품종별 기준 체온
  const breedInfo = BREED_BASELINES[animal.breed] ?? { center: 38.5, label: animal.breed };
  const tempCenter = breedInfo.center;
  let normalMin = round2(tempCenter - 0.8);
  let normalMax = round2(tempCenter + 0.8);
  let feverThreshold = round2(tempCenter + 1.2);
  reasons.push(`품종 ${breedInfo.label} 기준 (중심 ${tempCenter}°C)`);

  // 반추 기본값
  let rumMin = 300;
  let rumMax = 600;

  // DIM 보정
  const dim = animal.daysInMilk;
  if (dim !== null && dim >= 0 && dim <= 5) {
    feverThreshold = round2(feverThreshold + 0.3);
    rumMin = 200;
    reasons.push('분만 직후(DIM 0-5) — 발열 임계값 +0.3°C, 반추 저하 허용');
  } else if (dim !== null && dim >= 6 && dim <= 60) {
    reasons.push('초기 착유기(DIM 6-60) — 케토시스/LDA 위험 구간');
  }

  // 산차 1 (초산우)
  if (animal.parity === 1) {
    reasons.push('초산우(산차 1) — 활동량 기준선 ×1.2');
  }

  // 건유기/임신 후기
  if (animal.lactationStatus === 'dry' || animal.lactationStatus === 'Dry_Cow') {
    rumMin = Math.max(rumMin - 50, 150);
    reasons.push('건유기 — 반추 기준 하향(-50분/일)');
  }

  return {
    temperature: { normalMin, normalMax, feverThreshold },
    rumination: { normalMin: rumMin, normalMax: rumMax },
    adjustmentReasons: reasons,
  };
}

// ── 수학 유틸 ──

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function linearSlope(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  // y = values[i], x = i (0-indexed, ASC order)
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i]!;
    sumXY += i * values[i]!;
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
