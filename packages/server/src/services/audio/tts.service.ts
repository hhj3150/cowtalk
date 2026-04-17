// OpenAI TTS — 텍스트 → MP3 음성 변환
// 사용처: /api/audio/speak (audio.routes.ts)
//
// 비용 모델: tts-1 = $15 / 1M 문자
// - 평균 답변 800자 → 1회 $0.012 (≈₩17)
// - 절감 레버: OPENAI_TTS_MAX_CHARS로 앞 N자만 합성 (기본 500자)
// - 캐시: 동일 텍스트 동일 voice는 in-memory LRU로 24시간 재사용
//
// 보안: API 키는 절대 응답에 포함시키지 않음. 에러 시 OpenAI 원문 메시지 마스킹.

import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import { createHash } from 'node:crypto';

// === 타입 ===

export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TtsModel = 'tts-1' | 'tts-1-hd';
export type TtsFormat = 'mp3' | 'opus' | 'aac' | 'flac';

export interface SynthesizeOptions {
  readonly text: string;
  readonly voice?: TtsVoice;
  readonly model?: TtsModel;
  readonly format?: TtsFormat;
  readonly maxChars?: number; // 응답 앞 N자만 합성 (비용 절감)
}

export interface SynthesizeResult {
  readonly audio: Buffer;
  readonly contentType: string;
  readonly cached: boolean;
  readonly truncated: boolean;
  readonly originalLength: number;
  readonly synthesizedLength: number;
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

function makeCacheKey(text: string, voice: TtsVoice, model: TtsModel, format: TtsFormat): string {
  // 텍스트 해시 + 옵션으로 키 생성 (긴 텍스트도 짧은 키로)
  const hash = createHash('sha1').update(text).digest('hex').slice(0, 16);
  return `${hash}:${voice}:${model}:${format}`;
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

// === 마크다운 제거 (TTS는 ** ## - 같은 기호를 그대로 읽음) ===

function stripMarkdownForTts(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '') // 코드 블록 제거
    .replace(/`([^`]+)`/g, '$1')     // 인라인 코드
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1')     // italic
    .replace(/^#{1,6}\s+/gm, '')        // 헤더 #
    .replace(/^[-*]\s+/gm, '')          // 리스트 - *
    .replace(/^\d+\.\s+/gm, '')         // 번호 리스트
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 링크
    .replace(/🔴|🟡|🟢|🔵|⚠️|✅|❌|🛡️|✓|×/g, '') // 이모지 (TTS 부자연)
    .replace(/\n{3,}/g, '\n\n')         // 과도한 빈 줄
    .trim();
}

// === 메인: synthesize ===

export async function synthesize(options: SynthesizeOptions): Promise<SynthesizeResult> {
  const apiKey = config.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY 미설정 — Railway/.env에 키를 등록하세요');
  }

  const voice = options.voice ?? config.OPENAI_TTS_VOICE;
  const model = options.model ?? config.OPENAI_TTS_MODEL;
  const format = options.format ?? config.OPENAI_TTS_FORMAT;
  const maxChars = options.maxChars ?? config.OPENAI_TTS_MAX_CHARS;

  // 1) 마크다운 제거
  const stripped = stripMarkdownForTts(options.text);
  if (!stripped) {
    throw new Error('합성할 텍스트가 비어있습니다');
  }

  // 2) 길이 절단
  const originalLength = stripped.length;
  const finalText = truncateToSentence(stripped, maxChars);
  const truncated = finalText.length < originalLength;

  // 3) 캐시 조회
  const cacheKey = makeCacheKey(finalText, voice, model, format);
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.debug({ voice, model, length: finalText.length }, '[tts] cache hit');
    return {
      audio: cached.audio,
      contentType: cached.contentType,
      cached: true,
      truncated,
      originalLength,
      synthesizedLength: finalText.length,
    };
  }

  // 4) OpenAI API 호출
  const startedAt = Date.now();
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: finalText,
      voice,
      response_format: format,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    // 보안: 키나 민감 정보가 포함될 수 있으니 마스킹
    const safeMsg = errBody.replace(/sk-[a-zA-Z0-9_-]{20,}/g, 'sk-***');
    logger.error(
      { status: response.status, body: safeMsg.slice(0, 500), voice, model },
      '[tts] OpenAI API error',
    );
    throw new Error(`OpenAI TTS 실패 (HTTP ${String(response.status)})`);
  }

  const arrayBuf = await response.arrayBuffer();
  const audio = Buffer.from(arrayBuf);
  const contentType = response.headers.get('content-type') ?? `audio/${format === 'mp3' ? 'mpeg' : format}`;

  const elapsedMs = Date.now() - startedAt;
  logger.info(
    {
      voice,
      model,
      chars: finalText.length,
      audioBytes: audio.length,
      elapsedMs,
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
  };
}

// === 진단·테스트용 export ===

export const __testing = {
  stripMarkdownForTts,
  truncateToSentence,
  clearCache: () => audioCache.clear(),
  cacheSize: () => audioCache.size,
};
