// 소버린 AI 지식 강화 루프 API 클라이언트

import { apiGet, apiPost, apiClient } from './client';
import type {
  EventContext,
  SubmitLabelRequest,
  SovereignAiStats,
  EventLabel,
} from '@cowtalk/shared';

export function getEventContext(eventId: string): Promise<EventContext> {
  return apiGet<EventContext>(`/label-chat/context/${eventId}`);
}

export function submitLabel(data: SubmitLabelRequest): Promise<EventLabel> {
  return apiPost<EventLabel>('/label-chat/label', data);
}

export function getSovereignStats(): Promise<SovereignAiStats> {
  return apiGet<SovereignAiStats>('/label-chat/sovereign-stats');
}

export interface AnimalEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly smaxtecOriginalType: string;
  readonly severity: string;
  readonly detectedAt: string;
  readonly acknowledged: boolean;
  readonly farmId: string;
  readonly hasLabel: boolean;
}

export function getAnimalEvents(animalId: string): Promise<readonly AnimalEvent[]> {
  return apiGet<readonly AnimalEvent[]>(`/label-chat/events/${animalId}`);
}

export interface AnimalInfo {
  readonly animalId: string;
  readonly earTag: string;
  readonly name: string | null;
  readonly breed: string;
  readonly sex: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly status: string;
}

export function getAnimalInfo(animalId: string): Promise<AnimalInfo> {
  return apiGet<AnimalInfo>(`/label-chat/animal-info/${animalId}`);
}

// SSE 스트리밍 채팅 (레이블 컨텍스트 포함 + 대화 기록 추출)
export function streamLabelChat(
  data: {
    readonly question: string;
    readonly eventId: string;
    readonly animalId?: string;
    readonly farmId?: string;
    readonly conversationHistory?: readonly { role: string; content: string }[];
    readonly eventContext?: string;
  },
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  onExtractedRecords?: (records: readonly ExtractedRecordClient[]) => void,
): () => void {
  const controller = new AbortController();
  let lastProcessedLength = 0;
  let isDone = false;

  (async () => {
    try {
      const response = await apiClient.post('/label-chat/stream', data, {
        responseType: 'text',
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
        onDownloadProgress: (event) => {
          if (isDone) return;

          const fullText = (event.event?.target as XMLHttpRequest | undefined)?.responseText ?? '';
          const newText = fullText.slice(lastProcessedLength);
          lastProcessedLength = fullText.length;

          const lines = newText.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;

            try {
              const parsed = JSON.parse(payload) as { type: string; content: unknown };
              if (parsed.type === 'text' && parsed.content) {
                onChunk(parsed.content as string);
              } else if (parsed.type === 'extracted_records' && onExtractedRecords) {
                onExtractedRecords(parsed.content as readonly ExtractedRecordClient[]);
              } else if (parsed.type === 'done') {
                isDone = true;
                onDone();
                return;
              } else if (parsed.type === 'error') {
                isDone = true;
                onError(new Error((parsed.content as string) ?? 'Stream error'));
                return;
              }
            } catch {
              // partial JSON — ignore
            }
          }
        },
      });

      if (!isDone && response.status === 200) {
        onDone();
      }
    } catch (err) {
      if (!controller.signal.aborted && !isDone) {
        onError(err instanceof Error ? err : new Error('Stream failed'));
      }
    }
  })();

  return () => controller.abort();
}

// ── 대화에서 추출된 기록 타입 (클라이언트용) ──

export interface ExtractedRecordClient {
  readonly eventType: string;
  readonly confidence: number;
  readonly summary: string;
  readonly structuredData: { readonly type: string; readonly data: Record<string, unknown> };
  readonly missingFields: readonly string[];
  readonly rawExcerpt: string;
}

// ── 대화 기록 저장 (사용자 확인 후) ──

export function saveConversationRecord(data: {
  readonly animalId: string;
  readonly farmId: string;
  readonly sessionId?: string;
  readonly record: ExtractedRecordClient;
  readonly conversationSummary: string;
}): Promise<{ readonly observationId: string }> {
  return apiPost<{ readonly observationId: string }>('/label-chat/save-conversation-record', data);
}

// ── 대화 세션 ──

export function saveSession(data: {
  readonly animalId: string;
  readonly farmId: string;
  readonly eventId?: string;
  readonly messages: readonly { role: string; content: string; timestamp: string }[];
}): Promise<{ readonly sessionId: string; readonly updated: boolean }> {
  return apiPost<{ readonly sessionId: string; readonly updated: boolean }>('/label-chat/session', data);
}

export function getActiveSession(animalId: string): Promise<unknown> {
  return apiGet<unknown>(`/label-chat/session/${animalId}`);
}

// ── 예후 추적 (Follow-Up) ──

export interface FollowUpData {
  readonly followUpId: string;
  readonly daysSinceLabel: number;
  readonly followUpDate: string;
  readonly status: string;
  readonly clinicalNotes: string | null;
  readonly temperature: number | null;
  readonly appetite: string | null;
  readonly mobility: string | null;
  readonly milkYieldChange: string | null;
  readonly additionalTreatment: string | null;
  readonly treatmentChanged: boolean;
  readonly createdAt: string;
}

export interface LabelWithFollowUps {
  readonly labelId: string;
  readonly verdict: string;
  readonly actualDiagnosis: string | null;
  readonly actionTaken: string | null;
  readonly outcome: string | null;
  readonly notes: string | null;
  readonly labeledAt: string;
  readonly followUps: readonly FollowUpData[];
}

export interface SubmitFollowUpRequest {
  readonly labelId: string;
  readonly eventId: string;
  readonly animalId: string;
  readonly status: string;
  readonly clinicalNotes?: string;
  readonly temperature?: number;
  readonly appetite?: string;
  readonly mobility?: string;
  readonly milkYieldChange?: string;
  readonly additionalTreatment?: string;
  readonly treatmentChanged?: boolean;
  readonly conversationSummary?: string;
}

export function submitFollowUp(data: SubmitFollowUpRequest): Promise<FollowUpData> {
  return apiPost<FollowUpData>('/label-chat/follow-up', data);
}

export function getFollowUps(labelId: string): Promise<readonly FollowUpData[]> {
  return apiGet<readonly FollowUpData[]>(`/label-chat/follow-ups/${labelId}`);
}

export function getLabelHistory(eventId: string): Promise<readonly LabelWithFollowUps[]> {
  return apiGet<readonly LabelWithFollowUps[]>(`/label-chat/label-history/${eventId}`);
}

// ── 임상 관찰 기록 (Manual Observation) ──

export interface ClinicalObservation {
  readonly observationId: string;
  readonly observationType: string;
  readonly description: string;
  readonly temperature: number | null;
  readonly bodyConditionScore: number | null;
  readonly weight: number | null;
  readonly medication: string | null;
  readonly observedAt: string;
  readonly breedingInfo: string | null;
  readonly calvingInfo: string | null;
}

export interface SubmitObservationRequest {
  readonly animalId: string;
  readonly farmId: string;
  readonly observationType: string;
  readonly description: string;
  readonly temperature?: number;
  readonly bodyConditionScore?: number;
  readonly weight?: number;
  readonly medication?: string;
  readonly dosage?: string;
  readonly treatmentDuration?: string;
  readonly breedingInfo?: string;
  readonly calvingInfo?: string;
  readonly conversationSummary?: string;
}

export function submitObservation(data: SubmitObservationRequest): Promise<ClinicalObservation> {
  return apiPost<ClinicalObservation>('/label-chat/observation', data);
}

export function getObservations(animalId: string): Promise<readonly ClinicalObservation[]> {
  return apiGet<readonly ClinicalObservation[]>(`/label-chat/observations/${animalId}`);
}
