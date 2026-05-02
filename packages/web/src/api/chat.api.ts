// 대화 API — JSON + SSE 스트리밍

import { apiPost, apiGet, apiClient } from './client';
import type { ChatResponse } from '@cowtalk/shared';

export interface ChatMessageRequest {
  readonly question: string;
  readonly role?: string;
  readonly farmId?: string | null;
  readonly animalId?: string | null;
  readonly conversationHistory?: readonly { role: string; content: string }[];
  readonly dashboardContext?: string;
  readonly uiLang?: 'ko' | 'en' | 'uz' | 'ru' | 'mn';
}

export interface ChatSuggestionsResponse {
  readonly suggestions: readonly string[];
  readonly aiAvailable: boolean;
}

export function sendChatMessage(data: ChatMessageRequest): Promise<ChatResponse> {
  return apiPost<ChatResponse>('/chat/message', data);
}

export function getChatHistory(params?: {
  page?: number;
  limit?: number;
}): Promise<readonly ChatResponse[]> {
  return apiGet<readonly ChatResponse[]>('/chat/history', params);
}

export function getChatSuggestions(): Promise<ChatSuggestionsResponse> {
  return apiGet<ChatSuggestionsResponse>('/chat/suggestions');
}

// SSE 스트리밍 — 증분 파싱 (중복 방지)
export function streamChat(
  data: ChatMessageRequest,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
): () => void {
  const controller = new AbortController();
  let lastProcessedLength = 0;
  let isDone = false;

  (async () => {
    try {
      const response = await apiClient.post('/chat/stream', data, {
        responseType: 'text',
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
        onDownloadProgress: (event) => {
          if (isDone) return;

          const fullText = (event.event?.target as XMLHttpRequest | undefined)?.responseText ?? '';
          // 증분 처리: 이전에 처리한 부분 이후만 파싱
          const newText = fullText.slice(lastProcessedLength);
          lastProcessedLength = fullText.length;

          const lines = newText.split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const payload = line.slice(6).trim();
            if (!payload) continue;

            try {
              const parsed = JSON.parse(payload) as { type: string; content: string };

              if (parsed.type === 'text' && parsed.content) {
                onChunk(parsed.content);
              } else if (parsed.type === 'done') {
                isDone = true;
                onDone();
                return;
              } else if (parsed.type === 'error') {
                isDone = true;
                onError(new Error(parsed.content ?? 'Stream error'));
                return;
              }
            } catch {
              // 부분 JSON — 무시
            }
          }
        },
      });

      // 응답 완료인데 done 이벤트를 못 받은 경우
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
