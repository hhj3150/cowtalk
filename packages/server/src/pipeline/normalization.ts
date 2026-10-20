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
  // ── 발정 ──
  heat: 'estrus',
  estrus: 'estrus',
  heat_dnb: 'estrus_dnb',

  // ── 번식 ──
  insemination: 'insemination',
  pregnancy_result: 'pregnancy_check',
  fertility_105: 'fertility_warning',
  fertility_705: 'fertility_warning',
  no_insemination: 'no_insemination',

  // ── 분만 ──
  calving: 'calving',
  calving_detection: 'calving_detection',
  calving_confirmation: 'calving_confirmation',
  waiting_for_calving: 'calving_waiting',
  abort: 'abortion',

  // ── 체온 ──
  health_104: 'temperature_high',   // 체온 상승
  health_103: 'temperature_high',   // 체온 관련
  health_106: 'temperature_low',    // 체온 하강
  temperature: 'temperature_warning',
  temperature_alert: 'temperature_warning',
  temperature_warning: 'temperature_warning',

  // ── 반추 ──
  health_305: 'rumination_decrease',  // 반추시간 감소
  health_301: 'rumination_decrease',
  health_302: 'rumination_decrease',
  health_303: 'rumination_decrease',
  health_304: 'rumination_decrease',
  health_306: 'rumination_decrease',
  health_307: 'rumination_decrease',
  health_308: 'rumination_decrease',
  health_309: 'rumination_decrease',
  health_310: 'rumination_decrease',  // 반추시간 변화
  health_317: 'rumination_decrease',  // 반추 장기 감소
  health_318: 'rumination_decrease',  // 반추 극심 감소
  rumination: 'rumination_warning',
  rumination_drop: 'rumination_warning',
  rumination_warning: 'rumination_warning',

  // ── 활동 ──
  actincrease_704: 'activity_increase',  // 활동량 증가
  health_703: 'activity_decrease',       // 활동량 감소
  activity: 'activity_warning',
  activity_change: 'activity_warning',
  activity_warning: 'activity_warning',

  // ── 건강 종합 ──
  health_101: 'health_general',      // 종합 건강 경고 1단계
  health_109: 'health_general',      // 종합 건강 경고 기타
  health: 'health_warning',
  health_warning: 'health_warning',
  clinical_condition_401: 'clinical_condition',  // 임상 증상 1단계
  clinical_condition_402: 'clinical_condition',  // 임상 증상 2단계
  clinical_condition_403: 'clinical_condition',  // 임상 증상 3단계

  // ── 사양 ──
  feeding: 'feeding_warning',
  feeding_anomaly: 'feeding_warning',
  feeding_warning: 'feeding_warning',
  feeding_201: 'feeding_warning',
  feeding_202: 'feeding_warning',
  feeding_203: 'feeding_warning',
  feeding_204: 'feeding_warning',
  drinking: 'drinking_warning',
  drinking_warning: 'drinking_warning',

  // ── 관리 ──
  dry_off: 'dry_off',
  management_904: 'management',
};

export function normalizeSmaxtecEvent(raw: SmaxtecRawEvent): NormalizedSmaxtecEvent {
  // Real API uses _id / event_ts; legacy uses event_id / timestamp
  const eventId = raw._id ?? raw.event_id ?? '';
  // DI-03: 시각이 없거나 깨졌을 때 조용히 '지금'으로 바꾸면 감지 시각이 만들어진다 → 출처를 details 에 남긴다
  const ts = resolveEventTimestamp(raw.event_ts ?? raw.timestamp, (raw as { create_ts?: string }).create_ts, new Date());
  const confidence = raw.confidence ?? inferConfidence(raw.event_type);
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
  if (ts.source !== 'event_ts') details.timestampSource = ts.source;
  if (ts.future) details.timestampInFuture = true;

  return {
    externalEventId: eventId,
    animalExternalId: raw.animal_id,
    eventType: EVENT_TYPE_MAP[raw.event_type] ?? 'health_warning',
    confidence: Math.min(Math.max(confidence, 0), 1),
    severity: SEVERITY_MAP[severity] ?? 'low',
    stage: raw.stage ?? null,
    detectedAt: ts.date,
    details,
    rawData: raw as unknown as Record<string, unknown>,
  };
}

function inferSeverity(eventType: string): string {
  // 분만 관련 — critical
  if (eventType === 'calving_detection' || eventType === 'abort') return 'critical';
  if (eventType === 'calving' || eventType === 'calving_confirmation') return 'high';
  if (eventType === 'waiting_for_calving') return 'medium';

  // 발정 — medium
  if (eventType === 'heat' || eventType === 'heat_dnb') return 'medium';

  // 체온 — high
  if (eventType.startsWith('health_104') || eventType.startsWith('health_106')) return 'high';
  if (eventType.startsWith('health_103')) return 'medium';

  // 반추 감소 — 장기/극심은 high
  if (eventType === 'health_317' || eventType === 'health_318') return 'high';
  if (eventType.startsWith('health_3')) return 'medium';

  // 활동 — low~medium
  if (eventType === 'actincrease_704') return 'low';
  if (eventType === 'health_703') return 'medium';

  // 임상 증상 — severity by level
  if (eventType === 'clinical_condition_403') return 'critical';
  if (eventType === 'clinical_condition_402') return 'high';
  if (eventType === 'clinical_condition_401') return 'medium';

  // 건강 종합
  if (eventType === 'health_101') return 'high';
  if (eventType === 'health_109') return 'medium';

  // 번식
  if (eventType === 'insemination' || eventType === 'pregnancy_result') return 'low';
  if (eventType === 'no_insemination') return 'medium';
  if (eventType.startsWith('fertility')) return 'medium';

  // 사양
  if (eventType.startsWith('feeding')) return 'medium';

  // 관리
  if (eventType === 'dry_off' || eventType === 'management_904') return 'low';

  const severityByType: Readonly<Record<string, string>> = {
    heat: 'medium',
    estrus: 'medium',
    health: 'high',
    health_warning: 'high',
    calving: 'high',
    temperature: 'medium',
    activity: 'low',
    rumination: 'low',
    feeding: 'medium',
  };
  return severityByType[eventType] ?? 'low';
}

function inferConfidence(eventType: string): number {
  // smaXtec 이벤트별 기본 신뢰도
  // 발정/분만은 smaXtec 자체가 95%+ 정확도
  if (eventType === 'heat' || eventType === 'heat_dnb') return 0.95;
  if (eventType.startsWith('calving')) return 0.93;
  if (eventType === 'abort') return 0.90;
  // 번식 기록은 팩트 데이터
  if (eventType === 'insemination' || eventType === 'pregnancy_result') return 0.99;
  if (eventType === 'dry_off') return 0.99;
  // 건강/센서 기반은 약간 낮음
  if (eventType.startsWith('health_1')) return 0.85;  // 체온/종합
  if (eventType.startsWith('health_3')) return 0.82;  // 반추
  if (eventType.startsWith('health_7') || eventType.startsWith('actincrease')) return 0.80;  // 활동
  if (eventType.startsWith('clinical_condition')) return 0.88;
  if (eventType.startsWith('fertility')) return 0.85;
  if (eventType.startsWith('feeding')) return 0.78;
  return 0.85;
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
// 이벤트 시각 해석 (DI-03)
// ===========================
//
// smaXtec 시각에 시간대 표기가 없으면 JS 는 UTC 로 읽는다. 운영에서 감지 시각이 조회 시각보다
// 몇 시간 뒤(미래)로 저장된 정황이 있어, 표기 없는 값이 한국 시각일 가능성이 제기됐다(감사 DI-03).
// 운영 원본 샘플로 확인하기 전까지 해석 규칙은 바꾸지 않고(오판 시 전 이벤트가 9시간 어긋난다),
// 아래만 한다:
//   - 시각 없음·깨짐 → event_ts 대신 create_ts, 그것도 없으면 현재 시각 + 출처 표시(timestampSource)
//   - 현재보다 10분 넘게 미래면 timestampInFuture 표시 + 경고 로그 (운영 확인 근거)

const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

export interface ResolvedEventTimestamp {
  readonly date: Date;
  readonly source: 'event_ts' | 'create_ts' | 'fallback_now';
  readonly future: boolean;
}

function parseTs(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveEventTimestamp(
  eventTs: string | undefined,
  createTs: string | undefined,
  now: Date,
): ResolvedEventTimestamp {
  const fromEvent = parseTs(eventTs);
  const fromCreate = fromEvent ? null : parseTs(createTs);
  const date = fromEvent ?? fromCreate ?? now;
  const source = fromEvent ? 'event_ts' : fromCreate ? 'create_ts' : 'fallback_now';
  if (source !== 'event_ts') {
    logger.warn({ eventTs, createTs, source }, '[Normalization] 이벤트 시각 없음/오류 — 대체 시각 사용');
  }
  const future = date.getTime() - now.getTime() > FUTURE_TOLERANCE_MS;
  if (future) {
    logger.warn({ eventTs, aheadMinutes: Math.round((date.getTime() - now.getTime()) / 60000) }, '[Normalization] 미래 시각 이벤트 — 시간대 해석 확인 필요 (DI-03)');
  }
  return { date, source, future };
}
