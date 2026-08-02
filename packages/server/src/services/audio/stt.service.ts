// OpenAI Whisper — 오디오 바이너리 → 텍스트 전사
// 사용처: /api/audio/transcribe (audio.routes.ts)
//
// iOS Safari Web Speech API 한계 우회용. MediaRecorder로 녹음 → 서버로 업로드 → Whisper 전사.
// Whisper는 우즈벡어·한국어·러시아어·몽골어·영어 모두 지원.

import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import { getAudioModels } from './model-registry.js';

export interface TranscribeOptions {
  readonly audio: Buffer;
  readonly contentType: string;          // 예: 'audio/webm' / 'audio/mp4' / 'audio/m4a'
  readonly language?: string;            // ISO-639-1 ('ko', 'uz', 'ru', 'en', 'mn') — 정확도 향상
  readonly prompt?: string;              // 도메인 단어 힌트 (미지정 시 LIVESTOCK_STT_PROMPT)
  readonly model?: SttModel;             // 미지정 시 config.OPENAI_STT_MODEL
}

/** whisper-1은 저렴·안정, gpt-4o-transcribe는 한국어 전문어 정확도가 눈에 띄게 높다. */
export type SttModel = 'whisper-1' | 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe';

export interface TranscribeResult {
  readonly text: string;
  readonly language?: string;
  readonly duration?: number;
}

const MAX_BYTES = 25 * 1024 * 1024; // OpenAI 오디오 한도 25MB

/**
 * 축산 도메인 힌트 — 인식 전 단계에서 전문어 정확도를 올린다.
 * "발정"이 "발전"으로, "케토시스"가 "게토시스"로 들리는 문제를 상당 부분 흡수한다.
 * (인식 후 보정은 웹의 stt-correction.ts가 담당 — 2단 방어)
 */
export const LIVESTOCK_STT_PROMPT =
  '한국 목장에서 나눈 축산 대화입니다. 다음 용어가 자주 등장합니다: ' +
  '발정, 수정, 인공수정, 임신감정, 분만, 건유, 유방염, 케토시스, 유열, 자궁내막염, 후산정체, ' +
  '반추, 산차, 공태일, 수태율, 체세포수, 유량, 유지방, 유단백, 이력제, 개체번호, 귀표번호, ' +
  '두수, 착유우, 육성우, 한우, 젖소, TMR, DIM, BCS, SCC, THI, 팅커벨, 카우톡.';

function buildForm(opts: TranscribeOptions, model: SttModel, ext: string): FormData {
  const blob = new Blob([new Uint8Array(opts.audio)], { type: opts.contentType });
  const form = new FormData();
  form.append('file', blob, `recording.${ext}`);
  form.append('model', model);
  if (opts.language) form.append('language', opts.language);
  form.append('prompt', opts.prompt ?? LIVESTOCK_STT_PROMPT);
  form.append('response_format', 'json');
  return form;
}

async function callTranscribeApi(apiKey: string, form: FormData): Promise<Response> {
  return fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
  });
}

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

  // FormData 구성 — Node 18+ 글로벌 FormData/Blob 사용
  // 모델은 레지스트리가 "이 키로 실제 사용 가능함"을 확인한 것만 넘어온다
  const ext = inferExt(opts.contentType);
  const model: SttModel = opts.model ?? (await getAudioModels()).stt;

  const startedAt = Date.now();
  const response = await callTranscribeApi(apiKey, buildForm(opts, model, ext));

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    logger.error({
      status: response.status,
      errBody: errBody.slice(0, 400),
      audioBytes: opts.audio.length,
      contentType: opts.contentType,
      ext,
    }, '[stt.service] STT 호출 실패');
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
      : response.status === 403 ? '키 권한 부족 — Audio/Whisper 스코프 필요'
      : response.status === 400 ? `요청 형식 오류 — ${upstreamDetail || '오디오 디코드 실패'}`
      : response.status === 413 ? '오디오 크기 초과 (25MB 한도)'
      : response.status === 429 ? '요청 한도 초과 — credit 또는 rate limit 확인'
      : upstreamDetail || '일시 장애';
    throw new Error(`OpenAI STT 실패 (HTTP ${response.status}): ${hint}`);
  }

  const data = await response.json() as { text?: string; language?: string; duration?: number };
  const elapsed = Date.now() - startedAt;
  logger.info({ elapsed, model, lang: data.language, textLen: (data.text ?? '').length, audioBytes: opts.audio.length }, '[stt.service] 전사 완료');

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
