// AI 성과 지표 단일 진실 공급원 (BUG-008)
// metrics-contract.md §16 / Decision Log D4·D5
//
// 사용 규칙:
// 1. AI 성과 지표(accuracy, precision, recall, F1)는 ground truth 표본 N건 이상일 때만 표시한다.
// 2. minSamples 미달 시 status='data_insufficient' + displayValue='—' 반환 (D5).
// 3. Hardcoded mock 수치 ("61.9%", "95%" 등) 사용 금지.
// 4. clampPct를 service 내부에서 강제 — caller는 displayValue를 직접 표시.
// 5. 분자(k) / 분모(n) 함께 노출 — 투명성 보장.

/** AI 성과 지표 상태 (D5). */
export type AccuracyStatus = 'ok' | 'data_insufficient';

/** AI 정확도/precision/recall/F1 계산 결과. */
export interface AccuracyResult {
  /** 분자: 정확한 예측 수 (true positive 등) */
  readonly numerator: number;
  /** 분모: 총 평가 표본 수 (ground truth labels) */
  readonly denominator: number;
  /** 0-100 정수 백분율. n < minSamples 이면 null (D5). */
  readonly rate: number | null;
  /** UI 직접 표시용. data_insufficient 시 "—", 그 외 "85.0%". */
  readonly displayValue: string;
  /** 상태 sentinel. UI가 "데이터 부족" 분기에 사용 (D5). */
  readonly status: AccuracyStatus;
}

/** 정확도 변화율 (current - previous). */
export interface ChangeResult {
  /** -100 ~ +100 사이 변화율 (%). null 이면 비교 불가. */
  readonly delta: number | null;
  /** UI 표시용. "+5.0%" / "-3.0%" / "—". */
  readonly displayValue: string;
  /** 상태. 둘 중 하나라도 부족하면 'data_insufficient'. */
  readonly status: AccuracyStatus;
}

/** 기본 최소 표본 수. 학습 신뢰도 확보를 위한 임계값. */
export const DEFAULT_MIN_SAMPLES = 10;

interface ComputeOpts {
  /** 최소 표본 수 임계값. 기본 10. */
  readonly minSamples?: number;
  /** 소수 자리수. 기본 1. */
  readonly fractionDigits?: 0 | 1;
}

/**
 * 분자/분모로부터 AccuracyResult 계산.
 * - n < minSamples → status='data_insufficient', displayValue='—'
 * - n >= minSamples → status='ok', displayValue='<XX.X>%'
 * - clampPct 내장 (음수/100+ 입력 방지)
 */
export function computeAccuracy(
  numerator: number,
  denominator: number,
  opts: ComputeOpts = {},
): AccuracyResult {
  const minSamples = opts.minSamples ?? DEFAULT_MIN_SAMPLES;
  const digits = opts.fractionDigits ?? 1;

  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0 ||
    denominator < minSamples
  ) {
    return {
      numerator: Math.max(0, Math.trunc(Number.isFinite(numerator) ? numerator : 0)),
      denominator: Math.max(0, Math.trunc(Number.isFinite(denominator) ? denominator : 0)),
      rate: null,
      displayValue: '—',
      status: 'data_insufficient',
    };
  }

  // 분자 ≤ 분모 보장 (시스템 버그 방어)
  const safeNum = Math.max(0, Math.min(numerator, denominator));
  const rawPct = (safeNum / denominator) * 100;
  const clamped = Math.max(0, Math.min(100, rawPct));
  const rounded = digits === 0
    ? Math.round(clamped)
    : Math.round(clamped * 10) / 10;

  return {
    numerator: safeNum,
    denominator,
    rate: rounded,
    displayValue: `${rounded.toFixed(digits)}%`,
    status: 'ok',
  };
}

/**
 * 0-1 fraction (precision/recall/F1) → AccuracyResult.
 * 분모(n)는 별도로 전달받아 minSamples 판정에 사용.
 */
export function computeAccuracyFromFraction(
  fraction: number,
  sampleSize: number,
  opts: ComputeOpts = {},
): AccuracyResult {
  const minSamples = opts.minSamples ?? DEFAULT_MIN_SAMPLES;
  const digits = opts.fractionDigits ?? 1;

  if (
    !Number.isFinite(fraction) ||
    !Number.isFinite(sampleSize) ||
    sampleSize < minSamples
  ) {
    return {
      numerator: 0,
      denominator: Math.max(0, Math.trunc(Number.isFinite(sampleSize) ? sampleSize : 0)),
      rate: null,
      displayValue: '—',
      status: 'data_insufficient',
    };
  }

  const clampedFraction = Math.max(0, Math.min(1, fraction));
  const pct = clampedFraction * 100;
  const rounded = digits === 0
    ? Math.round(pct)
    : Math.round(pct * 10) / 10;

  return {
    numerator: Math.round(clampedFraction * sampleSize),
    denominator: sampleSize,
    rate: rounded,
    displayValue: `${rounded.toFixed(digits)}%`,
    status: 'ok',
  };
}

/**
 * 두 AccuracyResult의 변화율 계산 (recent - previous).
 * 둘 중 하나라도 data_insufficient 면 status='data_insufficient'.
 */
export function computeChange(
  current: AccuracyResult,
  previous: AccuracyResult,
): ChangeResult {
  if (
    current.status === 'data_insufficient' ||
    previous.status === 'data_insufficient' ||
    current.rate === null ||
    previous.rate === null
  ) {
    return {
      delta: null,
      displayValue: '—',
      status: 'data_insufficient',
    };
  }

  const delta = Math.round((current.rate - previous.rate) * 10) / 10;
  const clamped = Math.max(-100, Math.min(100, delta));
  const sign = clamped > 0 ? '+' : '';
  return {
    delta: clamped,
    displayValue: `${sign}${clamped.toFixed(1)}%`,
    status: 'ok',
  };
}

/**
 * 데이터 부족 sentinel — caller가 계산 전에 일찍 분기할 때 사용.
 */
export function accuracyInsufficient(sampleSize = 0): AccuracyResult {
  return {
    numerator: 0,
    denominator: Math.max(0, Math.trunc(Number.isFinite(sampleSize) ? sampleSize : 0)),
    rate: null,
    displayValue: '—',
    status: 'data_insufficient',
  };
}
