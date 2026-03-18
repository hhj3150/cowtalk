// Normalization 유닛 테스트

import { describe, it, expect } from 'vitest';
import {
  normalizeSmaxtecEvent,
  normalizeSmaxtecEvents,
  normalizeSmaxtecAnimal,
  buildIdMappingIndex,
} from '@server/pipeline/normalization';
import type { SmaxtecRawEvent, SmaxtecAnimal } from '@server/pipeline/connectors/smaxtec.connector';

describe('normalizeSmaxtecEvent', () => {
  const rawEvent: SmaxtecRawEvent = {
    event_id: 'evt-001',
    animal_id: 'smax-a1',
    organisation_id: 'org-1',
    event_type: 'heat',
    timestamp: '2026-03-17T10:30:00Z',
    confidence: 0.95,
    severity: 'high',
    stage: 'peak',
    data: { duration_hours: 12 },
  };

  it('event_type heat → estrus 매핑', () => {
    const result = normalizeSmaxtecEvent(rawEvent);
    expect(result.eventType).toBe('estrus');
  });

  it('severity 매핑', () => {
    const result = normalizeSmaxtecEvent(rawEvent);
    expect(result.severity).toBe('high');
  });

  it('confidence 보존', () => {
    const result = normalizeSmaxtecEvent(rawEvent);
    expect(result.confidence).toBe(0.95);
  });

  it('stage 보존', () => {
    const result = normalizeSmaxtecEvent(rawEvent);
    expect(result.stage).toBe('peak');
  });

  it('detectedAt가 Date 객체', () => {
    const result = normalizeSmaxtecEvent(rawEvent);
    expect(result.detectedAt).toBeInstanceOf(Date);
  });

  it('rawData에 원본 데이터 보존', () => {
    const result = normalizeSmaxtecEvent(rawEvent);
    expect(result.rawData).toBeDefined();
  });

  it('알 수 없는 event_type → health_warning 기본값', () => {
    const result = normalizeSmaxtecEvent({ ...rawEvent, event_type: 'unknown_type' });
    expect(result.eventType).toBe('health_warning');
  });

  it('confidence 범위 클램핑', () => {
    const result = normalizeSmaxtecEvent({ ...rawEvent, confidence: 1.5 });
    expect(result.confidence).toBe(1);
  });
});

describe('normalizeSmaxtecEvents (batch)', () => {
  it('여러 이벤트 일괄 정규화', () => {
    const events: SmaxtecRawEvent[] = [
      { event_id: 'e1', animal_id: 'a1', organisation_id: 'o1', event_type: 'heat', timestamp: '2026-03-17T10:00:00Z', confidence: 0.9, severity: 'high', data: {} },
      { event_id: 'e2', animal_id: 'a2', organisation_id: 'o1', event_type: 'health', timestamp: '2026-03-17T11:00:00Z', confidence: 0.8, severity: 'medium', data: {} },
    ];
    const result = normalizeSmaxtecEvents(events);
    expect(result).toHaveLength(2);
    expect(result[0]!.eventType).toBe('estrus');
    expect(result[1]!.eventType).toBe('health_warning');
  });
});

describe('normalizeSmaxtecAnimal', () => {
  it('동물 정보 정규화', () => {
    const raw: SmaxtecAnimal = {
      animal_id: 'smax-a1',
      official_id: '002-1234-5678',
      name: 'Bessie',
      organisation_id: 'org-1',
      group_id: 'g1',
      mark: null,
      sensor_id: 'sensor-001',
    };
    const result = normalizeSmaxtecAnimal(raw);
    expect(result.externalId).toBe('smax-a1');
    expect(result.officialId).toBe('002-1234-5678');
    expect(result.sensorId).toBe('sensor-001');
  });
});

describe('buildIdMappingIndex', () => {
  it('smaxtecId → cowtalkId 매핑', () => {
    const mappings = [
      { smaxtecId: 'smax-a1', traceId: '002-1234-5678', cowtalkId: 'uuid-1' },
      { smaxtecId: 'smax-a2', traceId: null, cowtalkId: 'uuid-2' },
    ];
    const index = buildIdMappingIndex(mappings);
    expect(index.get('smax-a1')).toBe('uuid-1');
    expect(index.get('002-1234-5678')).toBe('uuid-1');
    expect(index.get('smax-a2')).toBe('uuid-2');
  });
});
