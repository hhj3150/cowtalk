// 데이터 검증 (Validation) — 필수 필드, 타입, 범위 검증, 이상값 감지

import { SENSOR_NORMAL_RANGES } from '@cowtalk/shared';
import { logger } from '../lib/logger.js';

// ===========================
// 검증 결과 타입
// ===========================

export interface ValidationResult<T> {
  readonly valid: readonly T[];
  readonly invalid: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
}

export interface ValidationError {
  readonly field: string;
  readonly value: unknown;
  readonly rule: string;
  readonly message: string;
}

export interface ValidationWarning {
  readonly field: string;
  readonly value: unknown;
  readonly rule: string;
  readonly message: string;
}

// ===========================
// 센서 수치 범위 검증
// ===========================

const SENSOR_RANGES: Readonly<Record<string, { readonly min: number; readonly max: number }>> = {
  temperature: { min: 35.0, max: 42.0 },  // 체온 (℃)
  activity: { min: 0, max: 1000 },
  rumination: { min: 0, max: 800 },         // 분/일
  water_intake: { min: 0, max: 200 },       // 리터/일
  ph: { min: 5.0, max: 8.0 },
};

export function validateSensorValue(
  metricType: string,
  value: number,
): { valid: boolean; warning: boolean; message: string | null } {
  const range = SENSOR_RANGES[metricType];
  if (!range) {
    return { valid: true, warning: false, message: null };
  }

  if (value < range.min || value > range.max) {
    return {
      valid: false,
      warning: false,
      message: `${metricType} value ${String(value)} out of range [${String(range.min)}, ${String(range.max)}]`,
    };
  }

  // smaXtec 정상 범위에서 벗어나면 경고 (데이터는 그대로 저장)
  const normalRange = SENSOR_NORMAL_RANGES.find((r) => r.metricType === metricType);
  if (normalRange && (value < normalRange.min || value > normalRange.max)) {
    return {
      valid: true,
      warning: true,
      message: `${metricType} value ${String(value)} outside normal range [${String(normalRange.min)}, ${String(normalRange.max)}]`,
    };
  }

  return { valid: true, warning: false, message: null };
}

// ===========================
// smaXtec 이벤트 검증
// ===========================

interface RawSmaxtecEvent {
  readonly _id?: string;
  readonly event_id?: string;
  readonly animal_id?: string;
  readonly event_type?: string;
  readonly event_ts?: string;
  readonly timestamp?: string;
  readonly confidence?: number;
  readonly severity?: string;
  readonly [key: string]: unknown;
}

export function validateSmaxtecEvent(event: RawSmaxtecEvent): {
  valid: boolean;
  errors: readonly ValidationError[];
} {
  const errors: ValidationError[] = [];

  if (!event.animal_id) {
    errors.push({ field: 'animal_id', value: event.animal_id, rule: 'required', message: 'animal_id is required' });
  }
  if (!event.event_type) {
    errors.push({ field: 'event_type', value: event.event_type, rule: 'required', message: 'event_type is required' });
  }
  // Real API uses event_ts, legacy uses timestamp
  if (!event.event_ts && !event.timestamp) {
    errors.push({ field: 'event_ts', value: event.event_ts, rule: 'required', message: 'event_ts or timestamp is required' });
  }
  if (event.confidence !== undefined && (event.confidence < 0 || event.confidence > 1)) {
    errors.push({ field: 'confidence', value: event.confidence, rule: 'range', message: 'confidence must be 0-1' });
  }

  return { valid: errors.length === 0, errors };
}

// ===========================
// 센서 측정값 배치 검증
// ===========================

export interface SensorMeasurementInput {
  readonly animalId: string;
  readonly metricType: string;
  readonly value: number;
  readonly timestamp: Date;
}

export function validateSensorBatch(
  measurements: readonly SensorMeasurementInput[],
): ValidationResult<SensorMeasurementInput> {
  const valid: SensorMeasurementInput[] = [];
  const invalid: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  for (const m of measurements) {
    if (!m.animalId) {
      invalid.push({ field: 'animalId', value: m.animalId, rule: 'required', message: 'animalId required' });
      continue;
    }
    if (!m.metricType) {
      invalid.push({ field: 'metricType', value: m.metricType, rule: 'required', message: 'metricType required' });
      continue;
    }

    const check = validateSensorValue(m.metricType, m.value);
    if (!check.valid) {
      invalid.push({ field: 'value', value: m.value, rule: 'range', message: check.message ?? '' });
      continue;
    }

    if (check.warning) {
      warnings.push({ field: 'value', value: m.value, rule: 'anomaly', message: check.message ?? '' });
      logger.debug({ metric: m.metricType, value: m.value }, `[Validation] Anomaly detected`);
    }

    // 이상값이어도 데이터는 그대로 저장
    valid.push(m);
  }

  if (invalid.length > 0) {
    logger.warn({ invalidCount: invalid.length }, '[Validation] Some measurements failed validation');
  }

  return { valid, invalid, warnings };
}
