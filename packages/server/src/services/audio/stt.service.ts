// OpenAI STT — 오디오 바이너리 → 텍스트 전사
// 사용처: /api/audio/transcribe (audio.routes.ts)
//
// iOS Safari Web Speech API 한계 우회용. MediaRecorder로 녹음 → 서버로 업로드 → Whisper 전사.
// Whisper는 우즈벡어·한국어·러시아어·몽골어·영어 모두 지원.

import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';

export interface TranscribeOptions {
  readonly audio: Buffer;
  readonly contentType: string;          // 예: 'audio/webm' / 'audio/mp4' / 'audio/m4a'
  readonly language?: string;            // ISO-639-1 ('ko', 'uz', 'ru', 'en', 'mn') — 정확도 향상
  readonly prompt?: string;              // 도메인 단어 힌트 (예: '한우 술탄팜 발정 분만')
  readonly model?: string;               // 미지정 시 config.OPENAI_STT_MODEL
}

export interface TranscribeResult {
  readonly text: string;
  readonly language?: string;
  readonly duration?: number;
}

// 기본 모델은 config.OPENAI_STT_MODEL (기본값 gpt-4o-transcribe).
// gpt-4o-transcribe 는 같은 키·같은 엔드포인트로 whisper-1 보다 오류율이 낮다.
// 모델을 못 쓰는 계정(권한·리전)에서는 아래 FALLBACK_MODEL 로 한 번만 재시도한다 —
// 음성이 통째로 죽는 것보다 낮은 정확도로라도 답하는 편이 낫다.
const FALLBACK_MODEL = 'whisper-1';
const MAX_BYTES = 25 * 1024 * 1024; // OpenAI 오디오 업로드 한도 25MB

export async function transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
  const apiKey = config.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY 미설정 — STT 사용 불가');
  }

  if (opts.audio.length === 0) {
    throw new Error('빈 오디오 데이터');
  }
  if (opts.audio.length > MAX_BYTES) {
    throw new Error(`오디오 크기가 너무 큼 (${opts.audio.length} bytes, 한도 25MB)`);
  }

  const primary = opts.model ?? config.OPENAI_STT_MODEL;
  try {
    return await callOpenAi(apiKey, opts, primary);
  } catch (err) {
    // 모델 자체를 못 쓰는 경우에만 폴백. 오디오 형식 오류·한도 초과는 재시도해도 같다.
    if (primary !== FALLBACK_MODEL && isModelUnavailable(err)) {
      logger.warn({ primary, fallback: FALLBACK_MODEL }, '[stt.service] 모델 사용 불가 — 폴백 재시도');
      return await callOpenAi(apiKey, opts, FALLBACK_MODEL);
    }
    throw err;
  }
}

/** 모델을 쓸 수 없다는 신호인가 (권한/미존재) — 형식 오류와 구분한다 */
function isModelUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /model/i.test(msg) && /(not exist|not found|does not have access|unsupported|invalid)/i.test(msg);
}

async function callOpenAi(
  apiKey: string,
  opts: TranscribeOptions,
  model: string,
): Promise<TranscribeResult> {
  // FormData 구성 — Node 18+ 글로벌 FormData/Blob 사용
  const ext = inferExt(opts.contentType);
  const blob = new Blob([new Uint8Array(opts.audio)], { type: opts.contentType });
  const form = new FormData();
  form.append('file', blob, `recording.${ext}`);
  form.append('model', model);
  if (opts.language) form.append('language', opts.language);
  if (opts.prompt) form.append('prompt', opts.prompt);
  form.append('response_format', 'json');

  const startedAt = Date.now();
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    logger.error({
      status: response.status,
      model,
      errBody: errBody.slice(0, 400),
      audioBytes: opts.audio.length,
      contentType: opts.contentType,
      ext,
    }, '[stt.service] OpenAI STT 호출 실패');
    // OpenAI 에러 본문에서 메시지 추출 시도 (JSON 또는 raw)
    let upstreamDetail = '';
    try {
      const parsed = JSON.parse(errBody) as { error?: { message?: string; code?: string; type?: string } };
      upstreamDetail = parsed.error?.message ?? parsed.error?.code ?? '';
    } catch {
      upstreamDetail = errBody.slice(0, 200);
    }
    // 401/403은 키 권한, 400은 포맷, 413은 크기, 429는 한도
    const hint =
      response.status === 401 ? '키 인증 실패 — OPENAI_API_KEY 또는 권한 확인'
      : response.status === 403 ? '키 권한 부족 — Audio 스코프 필요'
      : response.status === 400 ? `요청 형식 오류 — ${upstreamDetail || '오디오 디코드 실패'}`
      : response.status === 413 ? '오디오 크기 초과 (25MB 한도)'
      : response.status === 429 ? '요청 한도 초과 — credit 또는 rate limit 확인'
      : upstreamDetail || '일시 장애';
    throw new Error(`OpenAI STT 실패 (HTTP ${response.status}, model=${model}): ${hint}`);
  }

  const data = await response.json() as { text?: string; language?: string; duration?: number };
  const elapsed = Date.now() - startedAt;
  logger.info({ elapsed, model, lang: data.language, textLen: (data.text ?? '').length, audioBytes: opts.audio.length }, '[stt.service] STT 전사 완료');

  return {
    text: (data.text ?? '').trim(),
    language: data.language,
    duration: data.duration,
  };
}

function inferExt(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('webm')) return 'webm';
  if (ct.includes('ogg')) return 'ogg';
  if (ct.includes('mp4') || ct.includes('m4a')) return 'm4a';
  if (ct.includes('wav')) return 'wav';
  if (ct.includes('mpeg') || ct.includes('mp3')) return 'mp3';
  if (ct.includes('flac')) return 'flac';
  return 'webm'; // 기본값 — iOS Safari MediaRecorder는 audio/mp4, Android는 audio/webm
}
