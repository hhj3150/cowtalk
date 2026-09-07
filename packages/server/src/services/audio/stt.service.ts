// OpenAI STT (Whisper / gpt-4o-transcribe) — 오디오 바이너리 → 텍스트 전사
// 사용처: /api/audio/transcribe (audio.routes.ts)
//
// iOS Safari Web Speech API 한계 우회용. MediaRecorder로 녹음 → 서버로 업로드 → 전사.
// 모델 라우팅: 기본 OPENAI_STT_MODEL(whisper-1). NATIVE_VOICE_LANGS(우즈벡어·몽골어)는
// OPENAI_STT_MODEL_NATIVE(gpt-4o-transcribe) — whisper-1 의 우즈벡어 인식률이 낮아 현장에서 오인식 빈발.
// 힌트 프롬프트도 언어별로 — 한국어 단어 힌트를 우즈벡 발화에 주면 한국어 쪽으로 편향된다.

import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import { isTtsLang, parseLangList, type TtsLang } from './tts-language.js';

export interface TranscribeOptions {
  readonly audio: Buffer;
  readonly contentType: string;          // 예: 'audio/webm' / 'audio/mp4' / 'audio/m4a'
  readonly language?: string;            // ISO-639-1 ('ko', 'uz', 'ru', 'en', 'mn') — 정확도 향상
  readonly prompt?: string;              // 도메인 단어 힌트. 미지정 시 언어별 기본 힌트(STT_DOMAIN_PROMPTS)
}

export interface TranscribeResult {
  readonly text: string;
  readonly language?: string;
  readonly duration?: number;
}

const MAX_BYTES = 25 * 1024 * 1024; // OpenAI 오디오 업로드 한도 25MB

// 언어별 도메인 단어 힌트 — 전사 모델이 축산 용어를 해당 언어 철자로 적도록 유도
// (system-prompt.ts 의 우즈벡어·몽골어 축산 용어 기준과 일치)
export const STT_DOMAIN_PROMPTS: Readonly<Record<TtsLang, string>> = {
  ko: '한우 젖소 발정 분만 임신 건강 술탄팜 CowTalk',
  en: 'Hanwoo dairy cow heat calving pregnancy health Sultan Farm CowTalk',
  uz: "sigir, qoramol, buzoq, qizishish, tug'ish, bo'g'ozlik, sun'iy urug'lantirish, mastit, tana harorati, veterinar, ferma, Sulton ferma, CowTalk",
  ru: 'корова, тёлка, телёнок, охота, отёл, стельность, осеменение, мастит, температура, ветеринар, ферма, Султан ферма, CowTalk',
  mn: 'үхэр, үнээ, тугал, хөөцөлдөх, төллөх, хээлтэй, зохиомол хээлтүүлэг, дэлэнгийн үрэвсэл, халуун, мал эмнэлэг, ферм, CowTalk',
};

/** 언어별 STT 모델 선택 — 네이티브 음성 언어는 인식률이 높은 세대로 */
export function resolveSttModel(language: string | undefined): string {
  if (isTtsLang(language) && parseLangList(config.NATIVE_VOICE_LANGS).has(language)) {
    return config.OPENAI_STT_MODEL_NATIVE;
  }
  return config.OPENAI_STT_MODEL;
}

/** 언어별 도메인 힌트 (언어 미지정 시 한국어 힌트 — 기존 동작) */
export function resolveSttPrompt(language: string | undefined): string {
  return STT_DOMAIN_PROMPTS[isTtsLang(language) ? language : 'ko'];
}

export async function transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
  const apiKey = config.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY 미설정 — Whisper STT 사용 불가');
  }

  if (opts.audio.length === 0) {
    throw new Error('빈 오디오 데이터');
  }
  if (opts.audio.length > MAX_BYTES) {
    throw new Error(`오디오 크기가 너무 큼 (${opts.audio.length} bytes, 한도 25MB)`);
  }

  // FormData 구성 — Node 18+ 글로벌 FormData/Blob 사용
  const ext = inferExt(opts.contentType);
  const model = resolveSttModel(opts.language);
  const prompt = opts.prompt ?? resolveSttPrompt(opts.language);
  const blob = new Blob([new Uint8Array(opts.audio)], { type: opts.contentType });
  const form = new FormData();
  form.append('file', blob, `recording.${ext}`);
  form.append('model', model);
  if (opts.language) form.append('language', opts.language);
  if (prompt) form.append('prompt', prompt);
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
      errBody: errBody.slice(0, 400),
      audioBytes: opts.audio.length,
      contentType: opts.contentType,
      ext,
      model,
      language: opts.language,
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
    throw new Error(`OpenAI Whisper 실패 (HTTP ${response.status}): ${hint}`);
  }

  const data = await response.json() as { text?: string; language?: string; duration?: number };
  const elapsed = Date.now() - startedAt;
  logger.info({ elapsed, model, requestedLang: opts.language, lang: data.language, textLen: (data.text ?? '').length, audioBytes: opts.audio.length }, '[stt.service] STT 전사 완료');

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
