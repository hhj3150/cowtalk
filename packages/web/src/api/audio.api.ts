// 오디오 API 클라이언트 — TTS 호출 (mp3 Blob 수신)

import { apiClient } from './client';

export type TtsVoice =
  | 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
  | 'coral' | 'sage' | 'ash' | 'ballad' | 'verse';
export type TtsModel = 'tts-1' | 'tts-1-hd' | 'gpt-4o-mini-tts';

export interface SpeakRequest {
  readonly text: string;
  readonly voice?: TtsVoice;
  readonly model?: TtsModel;
  readonly maxChars?: number;
  /** 말투 지시 (gpt-4o-mini-tts 전용) */
  readonly instructions?: string;
}

export interface SpeakResult {
  readonly audioBlob: Blob;
  readonly cached: boolean;
  readonly truncated: boolean;
  readonly originalLength: number;
  readonly synthesizedLength: number;
}

/**
 * 받은 바이트가 MP3인지 판별한다.
 * MP3는 ID3 태그("ID3")로 시작하거나 프레임 싱크(0xFF 0xEx~0xFx)로 시작한다.
 * 게이트웨이가 본문을 압축하거나 텍스트로 변형하면 여기서 걸린다.
 */
export function looksLikeMp3(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 3) return false;
  const b = new Uint8Array(buf, 0, 3);
  // "ID3"
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return true;
  // 프레임 싱크: 상위 11비트가 모두 1
  if (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0) return true;
  // gzip 매직(0x1f 0x8b) — 압축된 채로 왔다는 뜻이라 명시적으로 거짓
  return false;
}

/**
 * 텍스트를 음성으로 합성하여 mp3 Blob 반환.
 * 호출자는 Blob을 URL.createObjectURL → <audio>.src 로 재생.
 *
 * ⚠️ Netlify 프록시를 경유하지 않고 Railway를 직접 호출한다.
 *    transcribeAudio가 이미 같은 이유로 그렇게 하고 있다 —
 *    Netlify 프록시가 audio/* 바이너리를 변조해 재생이 깨진다.
 *    (서버는 no-transform / Accept-Ranges: none 으로 함께 방어한다.
 *     Content-Encoding: identity 는 HTTP/2에서 디코드 실패를 유발해 제거했다)
 *    (MP3가 한 바이트라도 변형되면 브라우저는 NotSupportedError만 던지고 조용히 죽는다)
 */
export async function speak(request: SpeakRequest): Promise<SpeakResult> {
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
  const url = `${apiBase}/api/audio/speak`;
  const token = (await import('@web/stores/auth.store')).useAuthStore.getState().accessToken;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
      credentials: 'omit',
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json() as { error?: { code?: string; message?: string } };
      detail = `${body?.error?.code ?? ''} ${body?.error?.message ?? ''}`.trim();
    } catch { /* 본문이 JSON이 아닐 수 있다 */ }
    const err = new Error(detail || `HTTP ${String(res.status)}`) as Error & {
      response?: { status: number; data?: unknown };
      status?: number;
    };
    err.status = res.status;
    err.response = { status: res.status, data: { error: { message: detail } } };
    throw err;
  }

  const buf = await res.arrayBuffer();
  const contentType = res.headers.get('content-type') ?? 'audio/mpeg';

  // 빈 응답·HTML 오류 페이지를 오디오로 재생하려다 조용히 실패하는 경우를 미리 잡는다
  if (buf.byteLength === 0) {
    throw new Error('음성 데이터가 비어 있습니다 (서버 또는 프록시 문제)');
  }
  if (contentType.includes('html') || contentType.includes('json')) {
    throw new Error(`음성 대신 ${contentType} 응답이 왔습니다 — 프록시 경유 의심`);
  }
  // 실제 바이트가 MP3인지 확인한다. 헤더는 audio/mpeg인데 본문이 깨져 오는 경우가 있어
  // (중간 게이트웨이의 인코딩 처리), 여기서 잡지 않으면 브라우저가 NotSupportedError만 던지고
  // 원인을 알 수 없게 된다.
  if (!looksLikeMp3(buf)) {
    throw new Error(
      `음성 데이터가 MP3가 아닙니다 (${String(buf.byteLength)}바이트, ${contentType}) — 전송 중 손상`,
    );
  }

  return {
    // 서버 헤더를 그대로 믿지 않고 요청한 형식으로 고정한다.
    // 엉뚱한 MIME이 붙어 오면 브라우저가 디코드를 시도조차 하지 않는다.
    audioBlob: new Blob([buf], { type: 'audio/mpeg' }),
    cached: res.headers.get('x-tts-cached') === 'true',
    truncated: res.headers.get('x-tts-truncated') === 'true',
    originalLength: Number(res.headers.get('x-tts-original-length') ?? 0),
    synthesizedLength: Number(res.headers.get('x-tts-synthesized-length') ?? 0),
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
