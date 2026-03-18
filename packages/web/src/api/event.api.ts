// 농장 이벤트 기록 API

import { apiGet, apiPost } from './client';

export type EventCategory = 'breeding' | 'health' | 'management' | 'movement' | 'production_dairy' | 'production_beef' | 'feed' | 'other';

export interface EventType {
  readonly eventTypeId: string;
  readonly category: EventCategory;
  readonly name: string;
  readonly nameKo: string;
  readonly fields: readonly EventField[];
  readonly roleRelevance: readonly string[];
}

export interface EventField {
  readonly key: string;
  readonly label: string;
  readonly type: 'text' | 'number' | 'date' | 'select' | 'boolean' | 'file';
  readonly required: boolean;
  readonly options?: readonly string[];
}

export interface FarmEvent {
  readonly eventId: string;
  readonly animalId: string | null;
  readonly farmId: string;
  readonly eventTypeId: string;
  readonly eventTypeName: string;
  readonly category: EventCategory;
  readonly data: Record<string, unknown>;
  readonly attachments: readonly string[];
  readonly recordedBy: string;
  readonly recordedAt: string;
}

export interface BulkEventInput {
  readonly animalIds: readonly string[];
  readonly farmId: string;
  readonly eventTypeId: string;
  readonly data: Record<string, unknown>;
}

export function getEventTypes(): Promise<readonly EventType[]> {
  return apiGet<readonly EventType[]>('/events/types');
}

export function recordEvent(input: {
  animalId: string | null;
  farmId: string;
  eventTypeId: string;
  data: Record<string, unknown>;
}): Promise<FarmEvent> {
  return apiPost<FarmEvent>('/events', input);
}

export function recordBulkEvents(input: BulkEventInput): Promise<readonly FarmEvent[]> {
  return apiPost<readonly FarmEvent[]>('/events/bulk', input);
}

export function getAnimalEvents(animalId: string): Promise<readonly FarmEvent[]> {
  return apiGet<readonly FarmEvent[]>(`/events/${animalId}`);
}

export function getFarmEvents(farmId: string, params?: { category?: EventCategory; limit?: number }): Promise<readonly FarmEvent[]> {
  return apiGet<readonly FarmEvent[]>(`/events/farm/${farmId}`, params);
}

export function processVoiceEvent(input: { text: string; farmId: string }): Promise<FarmEvent> {
  return apiPost<FarmEvent>('/events/voice', input);
}
