// 소버린 AI 지식 강화 루프 API 클라이언트

import axios from 'axios';
import { apiGet, apiPost } from './client';
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
  readonly parity: number;
  readonly daysInMilk: number | null;
  readonly lactationStatus: string;
  readonly birthDate: string | null;
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

  (async () => {
    try {
      // 팅커벨 메인과 동일: /api/chat/stream + axios (전체 응답 후 파싱)
      const token = (await import('@web/stores/auth.store')).useAuthStore.getState().accessToken;

      // label-chat 전용 질문 래핑 — 이벤트 컨텍스트를 질문에 포함
      const wrappedQuestion = data.eventContext
        ? `[팅커벨 AI — 알람 분석 모드]\n${data.eventContext}\n\n사용자 질문: ${data.question}`
        : data.question;

      const response = await axios.post<string>(
        '/api/chat/stream',
        {
          question: wrappedQuestion,
          role: 'veterinarian',
          farmId: data.farmId ?? undefined,
          animalId: data.animalId ?? undefined,
          dashboardContext: data.eventContext ?? undefined,
          conversationHistory: data.conversationHistory ?? [],
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'text',
          signal: controller.signal,
          timeout: 60000, // 60초 (Claude 응답 대기)
        },
      );

      const raw = typeof response.data === 'string' ? response.data : '';
      const lines = raw.split('\n');
      let fullText = '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6)) as { type: string; content: unknown };
          if (parsed.type === 'text' && parsed.content) {
            fullText += parsed.content as string;
            onChunk(parsed.content as string);
          } else if (parsed.type === 'extracted_records' && onExtractedRecords) {
            onExtractedRecords(parsed.content as readonly ExtractedRecordClient[]);
          } else if (parsed.type === 'done') {
            fullText = (parsed.content as string) || fullText;
            break;
          } else if (parsed.type === 'error') {
            onError(new Error((parsed.content as string) ?? 'AI 응답 오류'));
            return;
          }
        } catch {
          // skip partial JSON
        }
      }

      if (fullText) {
        onDone();
      } else {
        onError(new Error('AI 응답이 비어 있습니다'));
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        onError(err instanceof Error ? err : new Error('AI 연결 실패'));
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
