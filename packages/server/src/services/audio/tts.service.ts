// TTS — 텍스트 → MP3 음성 변환 (언어별 공급자 라우팅)
// 사용처: /api/audio/speak (audio.routes.ts)
//
// 공급자 라우팅 (언어 = 답변 본문 문자 체계 + UI 언어 힌트로 판정):
//   1) NATIVE_VOICE_LANGS(기본 uz,mn) + Azure 키 설정  → Azure Neural 네이티브 음성 (현지 원어민 발음)
//   2) NATIVE_VOICE_LANGS + Azure 미설정              → OpenAI gpt-4o-mini-tts + 언어별 발음 지시(instructions)
//   3) 그 외(ko/en/ru)                                → OPENAI_TTS_MODEL (기본 tts-1-hd, 기존 동작 유지)
// 전처리(단위·약어 풀이)는 답변 언어의 어휘로만 한다 — tts-language.ts
//
// 비용 모델: tts-1 = $15 / 1M 문자, tts-1-hd·gpt-4o-mini-tts ≈ $30 / 1M 문자 상당
// - 절감 레버: OPENAI_TTS_MAX_CHARS로 앞 N자만 합성
// - 캐시: 동일 텍스트·언어·공급자·voice는 in-memory LRU로 24시간 재사용
//
// 보안: API 키는 절대 응답에 포함시키지 않음. 에러 시 원문 메시지 마스킹.

import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import { createHash } from 'node:crypto';
import {
  AZURE_NEURAL_VOICES,
  OPENAI_TTS_INSTRUCTIONS,
  detectTtsLang,
  naturalizeForTts,
  parseLangList,
  type TtsLang,
} from './tts-language.js';
import { isAzureTtsConfigured, synthesizeWithAzure } from './azure-tts.service.js';

// === 타입 ===

export type TtsVoice =
  | 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
  | 'ash' | 'ballad' | 'coral' | 'sage' | 'verse';
export type TtsModel = 'tts-1' | 'tts-1-hd' | 'gpt-4o-mini-tts';
export type TtsFormat = 'mp3' | 'opus' | 'aac' | 'flac';
export type TtsProvider = 'openai' | 'azure';

export interface SynthesizeOptions {
  readonly text: string;
  readonly voice?: TtsVoice;
  readonly model?: TtsModel;
  readonly format?: TtsFormat;
  readonly maxChars?: number; // 응답 앞 N자만 합성 (비용 절감)
  readonly lang?: string;     // UI 언어 힌트 (ko|en|uz|ru|mn). 본문 문자 체계와 함께 최종 판정
}

export interface SynthesizeResult {
  readonly audio: Buffer;
  readonly contentType: string;
  readonly cached: boolean;
  readonly truncated: boolean;
  readonly originalLength: number;
  readonly synthesizedLength: number;
  readonly lang: TtsLang;
  readonly provider: TtsProvider;
  readonly model: string;      // 'tts-1-hd' | 'gpt-4o-mini-tts' | 'uz-UZ-MadinaNeural' 등
}

// === 모델별 파라미터 분기 (claude-model-params.ts 와 같은 원칙: 분기는 한 곳에만) ===
// - instructions: gpt-4o-mini-tts 만 받는다 (tts-1 계열에 보내면 400)
// - speed: tts-1 계열만 받는다 (gpt-4o-mini-tts 는 거부)
export function buildOpenAiTtsBody(params: {
  readonly model: TtsModel;
  readonly voice: TtsVoice;
  readonly input: string;
  readonly format: TtsFormat;
  readonly speed: number;
  readonly lang: TtsLang;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    input: params.input,
    voice: params.voice,
    response_format: params.format,
  };
  if (params.model === 'gpt-4o-mini-tts') {
    body.instructions = OPENAI_TTS_INSTRUCTIONS[params.lang];
  } else {
    body.speed = params.speed;
  }
  return body;
}

// === 공급자 라우팅 ===

export interface TtsRoute {
  readonly provider: TtsProvider;
  readonly model: string;   // OpenAI 모델명 또는 Azure voice 이름
  readonly reason: string;  // 로그·진단용
}

export function resolveTtsRoute(lang: TtsLang, requestedModel?: TtsModel): TtsRoute {
  const nativeLangs = parseLangList(config.NATIVE_VOICE_LANGS);
  if (nativeLangs.has(lang)) {
    if (isAzureTtsConfigured()) {
      const override = lang === 'uz' ? config.AZURE_SPEECH_VOICE_UZ
        : lang === 'mn' ? config.AZURE_SPEECH_VOICE_MN
        : undefined;
      return { provider: 'azure', model: override ?? AZURE_NEURAL_VOICES[lang].female, reason: 'native-lang azure' };
    }
    return { provider: 'openai', model: config.OPENAI_TTS_MODEL_NATIVE, reason: 'native-lang openai-instructed' };
  }
  return { provider: 'openai', model: requestedModel ?? config.OPENAI_TTS_MODEL, reason: 'default' };
}

// === 캐시 (in-memory LRU, 최대 200건, 24시간 TTL) ===

interface CacheEntry {
  readonly audio: Buffer;
  readonly contentType: string;
  readonly expiresAt: number;
}

const CACHE_MAX = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const audioCache = new Map<string, CacheEntry>();

function makeCacheKey(text: string, lang: TtsLang, provider: TtsProvider, voice: string, model: string, format: TtsFormat): string {
  // 텍스트 해시 + 옵션으로 키 생성 (긴 텍스트도 짧은 키로)
  const hash = createHash('sha1').update(text).digest('hex').slice(0, 16);
  return `${hash}:${lang}:${provider}:${voice}:${model}:${format}`;
}

function getFromCache(key: string): CacheEntry | null {
  const entry = audioCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    audioCache.delete(key);
    return null;
  }
  // LRU: 사용 시 맨 뒤로
  audioCache.delete(key);
  audioCache.set(key, entry);
  return entry;
}

function setCache(key: string, audio: Buffer, contentType: string): void {
  if (audioCache.size >= CACHE_MAX) {
    // 가장 오래된 항목 제거
    const firstKey = audioCache.keys().next().value;
    if (firstKey) audioCache.delete(firstKey);
  }
  audioCache.set(key, {
    audio,
    contentType,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// === 텍스트 절단 (자연스러운 문장 경계 우선) ===

function truncateToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // maxChars 부근의 문장 끝(. ! ? 。 ! ?) 위치 탐색
  const slice = text.slice(0, maxChars + 50); // 약간 여유
  const sentenceEnders = /[.!?。！？]\s/g;
  let lastEnd = -1;
  let match;
  while ((match = sentenceEnders.exec(slice)) !== null) {
    if (match.index <= maxChars) lastEnd = match.index + 1;
    else break;
  }

  if (lastEnd > maxChars * 0.5) {
    // 문장 경계가 maxChars의 50% 이상 위치에 있으면 거기서 자름
    return text.slice(0, lastEnd).trim();
  }
  // 문장 경계 못 찾으면 그냥 자르고 "..." 추가
  return text.slice(0, maxChars).trim() + '...';
}

// === TTS 자연어 전처리 ===
// 언어별 사전(tts-language.ts)로 위임. 한국어 발음을 타 언어 답변에 주입하던 옛 동작 제거.
function stripMarkdownForTts(text: string, lang: TtsLang = 'ko'): string {
  return naturalizeForTts(text, lang);
}

// === 메인: synthesize ===

export async function synthesize(options: SynthesizeOptions): Promise<SynthesizeResult> {
  const voice = options.voice ?? config.OPENAI_TTS_VOICE;
  const format = options.format ?? config.OPENAI_TTS_FORMAT;
  const maxChars = options.maxChars ?? config.OPENAI_TTS_MAX_CHARS;

  // 0) 답변 언어 판정 — UI 힌트 + 본문 문자 체계
  const lang = detectTtsLang(options.text, options.lang);
  const route = resolveTtsRoute(lang, options.model);

  if (route.provider === 'openai' && !config.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY 미설정 — Railway/.env에 키를 등록하세요');
  }

  // 1) 마크다운 제거 + 언어별 단위·약어 자연화
  const stripped = stripMarkdownForTts(options.text, lang);
  if (!stripped) {
    throw new Error('합성할 텍스트가 비어있습니다');
  }

  // 2) 길이 절단
  const originalLength = stripped.length;
  const finalText = truncateToSentence(stripped, maxChars);
  const truncated = finalText.length < originalLength;

  // 3) 캐시 조회 (언어·공급자·모델 포함 — 같은 텍스트라도 공급자가 다르면 다른 음성)
  const cacheVoice = route.provider === 'azure' ? route.model : voice;
  const cacheKey = makeCacheKey(finalText, lang, route.provider, cacheVoice, route.model, format);
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.debug({ lang, provider: route.provider, model: route.model, length: finalText.length }, '[tts] cache hit');
    return {
      audio: cached.audio,
      contentType: cached.contentType,
      cached: true,
      truncated,
      originalLength,
      synthesizedLength: finalText.length,
      lang,
      provider: route.provider,
      model: route.model,
    };
  }

  const startedAt = Date.now();
  let audio: Buffer;
  let contentType: string;

  if (route.provider === 'azure') {
    // 4-a) Azure Neural 네이티브 음성 (우즈벡어·몽골어)
    const result = await synthesizeWithAzure({
      text: finalText,
      lang,
      voiceName: route.model,
      speed: config.OPENAI_TTS_SPEED,
    });
    audio = result.audio;
    contentType = result.contentType;
  } else {
    // 4-b) OpenAI API 호출
    const model = route.model as TtsModel;
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.OPENAI_API_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildOpenAiTtsBody({
        model,
        voice,
        input: finalText,
        format,
        speed: config.OPENAI_TTS_SPEED,
        lang,
      })),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      // 보안: 키나 민감 정보가 포함될 수 있으니 마스킹
      const safeMsg = errBody.replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***');
      logger.error(
        { status: response.status, body: safeMsg.slice(0, 500), voice, model, lang },
        '[tts] OpenAI API error',
      );
      throw new Error(`OpenAI TTS 실패 (HTTP ${String(response.status)})`);
    }

    audio = Buffer.from(await response.arrayBuffer());
    contentType = response.headers.get('content-type') ?? `audio/${format === 'mp3' ? 'mpeg' : format}`;
  }

  logger.info(
    {
      lang,
      provider: route.provider,
      model: route.model,
      routeReason: route.reason,
      voice: cacheVoice,
      chars: finalText.length,
      audioBytes: audio.length,
      elapsedMs: Date.now() - startedAt,
      truncated,
    },
    '[tts] synthesized',
  );

  // 5) 캐시 저장
  setCache(cacheKey, audio, contentType);

  return {
    audio,
    contentType,
    cached: false,
    truncated,
    originalLength,
    synthesizedLength: finalText.length,
    lang,
    provider: route.provider,
    model: route.model,
  };
}

// === 진단·테스트용 export ===

export const __testing = {
  stripMarkdownForTts,
  truncateToSentence,
  clearCache: () => audioCache.clear(),
  cacheSize: () => audioCache.size,
};
