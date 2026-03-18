// 데이터 정규화 (Normalization)
// smaXtec 포맷 → CowTalk 표준 포맷
// 공공데이터 포맷 → CowTalk 표준 포맷
// 타임존 통일 (KST)
// ID 매핑 (smaXtec animal_id ↔ 이력번호 ↔ CowTalk animal_id)

import type { SmaxtecRawEvent, SmaxtecAnimal } from './connectors/smaxtec.connector.js';
import type { Severity, SmaxtecEventType } from '@cowtalk/shared';
import { logger } from '../lib/logger.js';

// ===========================
// smaXtec 이벤트 → CowTalk 표준
// ===========================

export interface NormalizedSmaxtecEvent {
  readonly externalEventId: string;
  readonly animalExternalId: string;
  readonly eventType: SmaxtecEventType;
  readonly confidence: number;
  readonly severity: Severity;
  readonly stage: string | null;
  readonly detectedAt: Date;
  readonly details: Record<string, unknown>;
  readonly rawData: Record<string, unknown>;
}

const SEVERITY_MAP: Readonly<Record<string, Severity>> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
  warning: 'medium',
  alert: 'high',
  info: 'low',
};

const EVENT_TYPE_MAP: Readonly<Record<string, SmaxtecEventType>> = {
  heat: 'estrus',
  estrus: 'estrus',
  health: 'health_warning',
  health_warning: 'health_warning',
  calving: 'calving',
  feeding: 'feeding_warning',
  feeding_anomaly: 'feeding_warning',
  feeding_warning: 'feeding_warning',
  temperature: 'temperature_warning',
  temperature_alert: 'temperature_warning',
  temperature_warning: 'temperature_warning',
  activity: 'activity_warning',
  activity_change: 'activity_warning',
  activity_warning: 'activity_warning',
  rumination: 'rumination_warning',
  rumination_drop: 'rumination_warning',
  rumination_warning: 'rumination_warning',
  drinking: 'drinking_warning',
  drinking_warning: 'drinking_warning',
};

export function normalizeSmaxtecEvent(raw: SmaxtecRawEvent): NormalizedSmaxtecEvent {
  // Real API uses _id / event_ts; legacy uses event_id / timestamp
  const eventId = raw._id ?? raw.event_id ?? '';
  const eventTimestamp = raw.event_ts ?? raw.timestamp ?? new Date().toISOString();
  const confidence = raw.confidence ?? (raw.event_type === 'heat' ? 0.95 : 0.85);
  const severity = raw.severity ?? inferSeverity(raw.event_type);

  // Build details from real API fields
  const details: Record<string, unknown> = {};
  if (raw.cycle_length != null) details.cycle_length = raw.cycle_length;
  if (raw.days_to_calving != null) details.days_to_calving = raw.days_to_calving;
  if (raw.expected_calving_date != null) details.expected_calving_date = raw.expected_calving_date;
  if (raw.insemination_date != null) details.insemination_date = raw.insemination_date;
  if (raw.pregnant != null) details.pregnant = raw.pregnant;
  if (raw.number != null) details.number = raw.number;
  if (raw.value != null) details.value = raw.value;
  if (raw.data != null) Object.assign(details, raw.data);

  return {
    externalEventId: eventId,
    animalExternalId: raw.animal_id,
    eventType: EVENT_TYPE_MAP[raw.event_type] ?? 'health_warning',
    confidence: Math.min(Math.max(confidence, 0), 1),
    severity: SEVERITY_MAP[severity] ?? 'low',
    stage: raw.stage ?? null,
    detectedAt: toKST(eventTimestamp),
    details,
    rawData: raw as unknown as Record<string, unknown>,
  };
}

function inferSeverity(eventType: string): string {
  const severityByType: Readonly<Record<string, string>> = {
    heat: 'medium',
    estrus: 'medium',
    health: 'high',
    health_warning: 'high',
    calving: 'critical',
    temperature: 'medium',
    activity: 'low',
    rumination: 'low',
    feeding: 'medium',
  };
  return severityByType[eventType] ?? 'low';
}

export function normalizeSmaxtecEvents(
  events: readonly SmaxtecRawEvent[],
): readonly NormalizedSmaxtecEvent[] {
  return events.map(normalizeSmaxtecEvent);
}

// ===========================
// smaXtec 동물 → CowTalk 표준
// ===========================

export interface NormalizedAnimal {
  readonly externalId: string;
  readonly officialId: string | null;
  readonly name: string | null;
  readonly organisationId: string;
  readonly groupId: string | null;
  readonly sensorId: string | null;
}

export function normalizeSmaxtecAnimal(raw: SmaxtecAnimal): NormalizedAnimal {
  return {
    externalId: raw._id ?? raw.animal_id ?? '',
    officialId: raw.official_id,
    name: raw.name ?? raw.display_name,
    organisationId: raw.organisation_id,
    groupId: raw.group_id,
    sensorId: raw.sensor ?? raw.sensor_id ?? raw.current_device_id,
  };
}

// ===========================
// ID 매핑 레지스트리
// ===========================

export interface IdMapping {
  readonly smaxtecId: string;
  readonly traceId: string | null;  // 이력번호
  readonly cowtalkId: string;       // CowTalk animal_id (UUID)
}

/**
 * smaXtec animal_id → CowTalk animal_id 매핑.
 * DB에서 external_id 또는 official_id로 조회하여 매핑.
 * 매핑 실패 시 null 반환 (새 동물이거나 매핑 테이블 미등록).
 */
export function buildIdMappingIndex(
  mappings: readonly IdMapping[],
): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const m of mappings) {
    index.set(m.smaxtecId, m.cowtalkId);
    if (m.traceId) {
      index.set(m.traceId, m.cowtalkId);
    }
  }
  return index;
}

// ===========================
// 타임존 통일 (KST)
// ===========================

function toKST(isoString: string): Date {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    logger.warn({ raw: isoString }, '[Normalization] Invalid date string');
    return new Date();
  }
  return date; // JS Date는 내부적으로 UTC, 표시만 KST
}
