// 오디오 API 클라이언트 — TTS 호출 (mp3 Blob 수신)

import { apiClient } from './client';

export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TtsModel = 'tts-1' | 'tts-1-hd';

export interface SpeakRequest {
  readonly text: string;
  readonly voice?: TtsVoice;
  readonly model?: TtsModel;
  readonly maxChars?: number;
}

export interface SpeakResult {
  readonly audioBlob: Blob;
  readonly cached: boolean;
  readonly truncated: boolean;
  readonly originalLength: number;
  readonly synthesizedLength: number;
}

/**
 * 텍스트를 음성으로 합성하여 mp3 Blob 반환.
 * 호출자는 Blob을 URL.createObjectURL → <audio>.src 또는 new Audio()로 재생.
 */
export async function speak(request: SpeakRequest): Promise<SpeakResult> {
  const response = await apiClient.post<ArrayBuffer>('/audio/speak', request, {
    responseType: 'arraybuffer',
    timeout: 30_000, // TTS는 평균 1~3초, 긴 텍스트도 10초 이내
  });

  const audioBlob = new Blob([response.data], { type: response.headers['content-type'] ?? 'audio/mpeg' });

  return {
    audioBlob,
    cached: response.headers['x-tts-cached'] === 'true',
    truncated: response.headers['x-tts-truncated'] === 'true',
    originalLength: Number(response.headers['x-tts-original-length'] ?? 0),
    synthesizedLength: Number(response.headers['x-tts-synthesized-length'] ?? 0),
  };
}

export interface VoicesResponse {
  readonly voices: ReadonlyArray<{ id: TtsVoice; label: string; recommended: boolean }>;
  readonly models: ReadonlyArray<{ id: TtsModel; label: string; costPer1MChars: number }>;
}

export async function getVoices(): Promise<VoicesResponse> {
  const response = await apiClient.get<{ data: VoicesResponse }>('/audio/voices');
  return response.data.data;
}
