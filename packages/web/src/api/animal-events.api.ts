// 개체 이벤트 API
import { apiGet, apiPost } from './client';

export type AnimalEventType =
  | 'calving'
  | 'insemination'
  | 'pregnancy_check'
  | 'treatment'
  | 'dry_off'
  | 'dhi'
  | 'cull'
  | 'vaccination'
  | 'herd_move';

export interface AnimalEvent {
  readonly eventId: string;
  readonly animalId: string;
  readonly farmId: string;
  readonly eventType: AnimalEventType;
  readonly eventDate: string;
  readonly recordedBy: string | null;
  readonly recordedByName: string | null;
  readonly details: Record<string, unknown>;
  readonly notes: string | null;
  readonly createdAt: string;
}

export interface AnimalEventCreateInput {
  readonly eventType: AnimalEventType;
  readonly eventDate: string;
  readonly notes?: string;
  readonly recordedByName?: string;
  readonly details: Record<string, unknown>;
}

export function getAnimalEvents(animalId: string, eventType?: string): Promise<AnimalEvent[]> {
  const params = eventType ? `?eventType=${eventType}` : '';
  return apiGet<AnimalEvent[]>(`/animal-events/${animalId}${params}`);
}

export function createAnimalEvent(animalId: string, input: AnimalEventCreateInput): Promise<AnimalEvent> {
  return apiPost<AnimalEvent>(`/animal-events/${animalId}`, input);
}
