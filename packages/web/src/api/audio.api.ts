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

// === Whisper STT (iOS Safari Web Speech API 한계 우회용) ===

export interface TranscribeResult {
  readonly text: string;
  readonly language?: string;
  readonly duration?: number;
}

/**
 * 녹음한 오디오 Blob을 서버로 전송하여 Whisper로 전사한다.
 * iOS Safari에서 가장 신뢰성 있는 STT 경로.
 *
 * Netlify 프록시가 audio/* 바이너리를 변조할 위험이 있어 Railway 백엔드를 직접 호출한다
 * (팅커벨 SSE도 동일 패턴 — netlify.toml 주석 참조).
 */
export async function transcribeAudio(audioBlob: Blob, language?: string): Promise<TranscribeResult> {
  const contentType = audioBlob.type || 'audio/webm';
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  const root = apiBase ? `${apiBase}/api` : '/api';
  const url = language ? `${root}/audio/transcribe?lang=${encodeURIComponent(language)}` : `${root}/audio/transcribe`;

  // axios 대신 fetch 직접 — axios의 자동 헤더/변환을 우회하여 바이너리 그대로 전송
  const token = (await import('@web/stores/auth.store')).useAuthStore.getState().accessToken;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: audioBlob,
    credentials: 'omit',
  });

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json() as { error?: { code?: string; message?: string } };
      detail = `${errBody?.error?.code ?? ''} ${errBody?.error?.message ?? ''}`.trim();
    } catch { /* ignore */ }
    const err = new Error(detail || `HTTP ${res.status}`) as Error & { response?: { status: number; data?: unknown } };
    err.response = { status: res.status, data: { error: { message: detail } } };
    throw err;
  }

  const data = await res.json() as { success: boolean; data: TranscribeResult };
  return data.data;
}

export interface VoicesResponse {
  readonly voices: ReadonlyArray<{ id: TtsVoice; label: string; recommended: boolean }>;
  readonly models: ReadonlyArray<{ id: TtsModel; label: string; costPer1MChars: number }>;
}

export async function getVoices(): Promise<VoicesResponse> {
  const response = await apiClient.get<{ data: VoicesResponse }>('/audio/voices');
  return response.data.data;
}
