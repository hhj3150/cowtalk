// OpenAI Whisper — 오디오 바이너리 → 텍스트 전사
// 사용처: /api/audio/transcribe (audio.routes.ts)
//
// iOS Safari Web Speech API 한계 우회용. MediaRecorder로 녹음 → 서버로 업로드 → Whisper 전사.
// Whisper는 우즈벡어·한국어·러시아어·몽골어·영어 모두 지원.

import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';

// 도메인 + 브랜드 어휘 — Whisper prompt 파라미터에 주입하여 인식 정확도 ↑.
// 코드스위칭 핵심: 브랜드명(CowTalk, smaXtec)과 약어(DIM, SCC, THI, KAHIS, DHI)는
// 어느 언어든 원형으로 유지되어야 함 — 모든 언어 프롬프트에 라틴 표기로 포함.
const BRAND_TERMS = 'CowTalk smaXtec KAHIS DHI EKAPE DIM SCC THI KPN';

const DOMAIN_PROMPTS: Readonly<Record<string, string>> = {
  ko: `${BRAND_TERMS} 팅커벨 한우 젖소 홀스타인 발정 수정 분만 임신 건유 유방염 케토시스 산차 이력제 해돋이목장 우즈베키스탄 카자흐스탄`,
  en: `${BRAND_TERMS} Tinkerbell Korean cattle Holstein heat insemination calving pregnancy mastitis ketosis traceability Sultan-farm Hae-dot-i Uzbekistan Kazakhstan`,
  uz: `${BRAND_TERMS} Tinkerbell qoramol sigir mol sutchilik chorvachilik sun'iy urug'lantirish O'zbekiston Qozog'iston Janubiy Koreya`,
  ru: `${BRAND_TERMS} Тинкербел крупный рогатый скот корова молочное животноводство искусственное осеменение Узбекистан Казахстан Южная Корея`,
  mn: `${BRAND_TERMS} Тинкербелл үхэр сүүний мал хиймэл хээлтүүлэг Узбекистан Казахстан Өмнөд Солонгос`,
};

/**
 * 언어별 도메인 프롬프트를 반환. 미지정 시 한국어 + 영어 통합 프롬프트(코드스위칭 견고).
 * Whisper는 prompt를 통해 어휘 분포를 학습하므로, 예상되는 모든 언어 어휘를 포함하면
 * 한국어 발화 중간에 영어 브랜드명이 섞여도 라틴 표기로 정확히 전사된다.
 */
export function getDomainPrompt(language?: string): string {
  const lang = (language ?? 'ko').toLowerCase();
  return DOMAIN_PROMPTS[lang] ?? `${DOMAIN_PROMPTS.ko ?? BRAND_TERMS} ${DOMAIN_PROMPTS.en ?? ''}`.trim();
}

export interface TranscribeOptions {
  readonly audio: Buffer;
  readonly contentType: string;          // 예: 'audio/webm' / 'audio/mp4' / 'audio/m4a'
  readonly language?: string;            // ISO-639-1 ('ko', 'uz', 'ru', 'en', 'mn') — 정확도 향상
  readonly prompt?: string;              // 도메인 단어 힌트 (예: '한우 술탄팜 발정 분만')
}

export interface TranscribeResult {
  readonly text: string;
  readonly language?: string;
  readonly duration?: number;
}

const WHISPER_MODEL = 'whisper-1';
const MAX_BYTES = 25 * 1024 * 1024; // OpenAI Whisper 한도 25MB

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
  const blob = new Blob([new Uint8Array(opts.audio)], { type: opts.contentType });
  const form = new FormData();
  form.append('file', blob, `recording.${ext}`);
  form.append('model', WHISPER_MODEL);
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
      errBody: errBody.slice(0, 400),
      audioBytes: opts.audio.length,
      contentType: opts.contentType,
      ext,
    }, '[stt.service] Whisper 호출 실패');
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
  logger.info({ elapsed, lang: data.language, textLen: (data.text ?? '').length, audioBytes: opts.audio.length }, '[stt.service] Whisper 전사 완료');

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
