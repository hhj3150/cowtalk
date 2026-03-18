// Validation 유닛 테스트

import { describe, it, expect } from 'vitest';
import {
  validateSensorValue,
  validateSmaxtecEvent,
  validateSensorBatch,
} from '@server/pipeline/validation';

describe('validateSensorValue', () => {
  it('정상 범위 체온 → valid, no warning', () => {
    const result = validateSensorValue('temperature', 38.5);
    expect(result.valid).toBe(true);
    expect(result.warning).toBe(false);
  });

  it('범위 밖 체온 → invalid', () => {
    const result = validateSensorValue('temperature', 43.0);
    expect(result.valid).toBe(false);
  });

  it('정상 범위 밖이지만 절대 범위 안 → valid + warning', () => {
    // 체온 39.5: 절대 범위(35~42) 안이지만 정상 범위(38~39.3) 밖
    const result = validateSensorValue('temperature', 39.5);
    expect(result.valid).toBe(true);
    expect(result.warning).toBe(true);
  });

  it('pH 정상 범위 → valid', () => {
    const result = validateSensorValue('ph', 6.5);
    expect(result.valid).toBe(true);
  });

  it('pH 절대 범위 밖 → invalid', () => {
    const result = validateSensorValue('ph', 9.0);
    expect(result.valid).toBe(false);
  });

  it('알 수 없는 메트릭 → valid (검증 스킵)', () => {
    const result = validateSensorValue('unknown_metric', 999);
    expect(result.valid).toBe(true);
  });
});

describe('validateSmaxtecEvent', () => {
  it('유효한 이벤트 → valid', () => {
    const result = validateSmaxtecEvent({
      event_id: 'e1',
      animal_id: 'a1',
      event_type: 'estrus',
      timestamp: '2026-03-17T10:00:00Z',
      confidence: 0.95,
      severity: 'high',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('animal_id 없음 → invalid', () => {
    const result = validateSmaxtecEvent({
      event_type: 'estrus',
      timestamp: '2026-03-17T10:00:00Z',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('event_type 없음 → invalid', () => {
    const result = validateSmaxtecEvent({
      animal_id: 'a1',
      timestamp: '2026-03-17T10:00:00Z',
    });
    expect(result.valid).toBe(false);
  });

  it('confidence 범위 밖 → invalid', () => {
    const result = validateSmaxtecEvent({
      animal_id: 'a1',
      event_type: 'estrus',
      timestamp: '2026-03-17T10:00:00Z',
      confidence: 1.5,
    });
    expect(result.valid).toBe(false);
  });
});

describe('validateSensorBatch', () => {
  it('유효한 배치 → 모두 valid', () => {
    const result = validateSensorBatch([
      { animalId: 'a1', metricType: 'temperature', value: 38.5, timestamp: new Date() },
      { animalId: 'a2', metricType: 'rumination', value: 450, timestamp: new Date() },
    ]);
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
  });

  it('animalId 누락 → invalid', () => {
    const result = validateSensorBatch([
      { animalId: '', metricType: 'temperature', value: 38.5, timestamp: new Date() },
    ]);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
  });

  it('범위 밖 값 → invalid', () => {
    const result = validateSensorBatch([
      { animalId: 'a1', metricType: 'temperature', value: 50, timestamp: new Date() },
    ]);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(1);
  });

  it('이상값(경고) → valid + warning', () => {
    const result = validateSensorBatch([
      { animalId: 'a1', metricType: 'temperature', value: 39.8, timestamp: new Date() },
    ]);
    expect(result.valid).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
  });
});
