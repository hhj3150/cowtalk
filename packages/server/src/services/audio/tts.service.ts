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

// === TTS 자연어 전처리 — 마크다운 제거 + 자연 발화로 변환 ===
// 원칙: 사람이 친구에게 말하듯 흘러가는 음성을 만든다.
// 기호·단위·약어를 한글 발음으로 풀고, 줄바꿈을 자연스러운 호흡으로 바꾼다.

// 영어 축산 약어 → 한글 발음 (자주 쓰이는 것만)
// 원칙: "검사"·"점수" 등 한국어 단어가 뒤따르기 쉬운 약어는 음역(씨엠티)이
// 풀이(캘리포니아 유방염 검사)보다 자연스러움 — "CMT 검사" → "씨엠티 검사".
const ABBREV_MAP: ReadonlyArray<[RegExp, string]> = [
  [/\bTMR\b/g, '티엠알'],
  [/\bDIM\b/g, '착유 일수'],
  [/\bBCS\b/g, '체형 점수'],
  [/\bSCC\b/g, '체세포수'],
  [/\bMUN\b/g, '유중 요소태 질소'],
  [/\bDHI\b/g, '디에이치아이'],
  [/\bTHI\b/g, '티에이치아이'],
  [/\bSARA\b/g, '아급성 반추위 산증'],
  [/\bBHB\b/g, '비에이치비'],
  [/\bNEB\b/g, '에너지 음성 균형'],
  [/\bHPAI\b/g, '고병원성 조류 인플루엔자'],
  [/\bCMT\b/g, '씨엠티'],
  [/\bIM\b/g, '근육 주사'],
  [/\bIV\b/g, '정맥 주사'],
  [/\bAI\b/g, '인공 수정'],
  [/\bPCR\b/g, '피시알'],
  [/\bKAHIS\b/g, '카이스'],
  [/\bWOAH\b/g, '세계 동물 보건 기구'],
  [/\bR0\b/g, '기초 감염 재생산 지수'],
  [/\bNDF\b/g, '엔디에프'],
  [/\bDCAD\b/g, '디캐드'],
  [/\bFCR\b/g, '사료 효율'],
];

// 단위·기호 자연 발음
function naturalizeUnitsAndSymbols(text: string): string {
  return text
    // 온도: 38.5°C, 38.5℃ → "38.5도"
    .replace(/(\d+(?:\.\d+)?)\s*[°℃]C?/g, '$1도')
    // "단위/일" 형태는 "매일 단위" 식으로 자연화
    .replace(/(\d+)\s*kg\s*\/\s*일/g, '하루 $1킬로그램')
    .replace(/(\d+)\s*L\s*\/\s*일/g, '하루 $1리터')
    .replace(/(\d+)\s*분\s*\/\s*일/g, '하루 $1분')
    .replace(/(\d+)\s*회\s*\/\s*일/g, '하루 $1회')
    // 일반 슬래시 — "A / B / C" 같은 단순 구분은 쉼표
    // (분수 1/2 같은 건 거의 등장하지 않으므로 쉼표가 안전)
    .replace(/\s+\/\s+/g, ', ')
    // 화살표 → 자연 호흡(쉼표)
    .replace(/\s*→\s*/g, ', ')
    .replace(/\s*=>\s*/g, ', ')
    // 대시·하이픈을 자연 호흡으로
    .replace(/—/g, ', ')
    .replace(/\s--\s/g, ', ')
    // 괄호 안 짧은 부연은 쉼표로 (2~25자 한글/숫자 위주)
    .replace(/\s*\(([가-힣A-Za-z0-9\s.,]{2,25})\)/g, ', $1')
    // 단순 단위
    .replace(/(\d+)\s*L\b/g, '$1리터')
    .replace(/(\d+)\s*mL\b/g, '$1밀리리터')
    .replace(/(\d+)\s*mg\b/g, '$1밀리그램')
    .replace(/(\d+)\s*kg\b/g, '$1킬로그램')
    .replace(/(\d+)\s*cm\b/g, '$1센티미터')
    .replace(/(\d+)\s*km\b/g, '$1킬로미터');
}

function expandAbbreviations(text: string): string {
  let out = text;
  for (const [re, replacement] of ABBREV_MAP) {
    out = out.replace(re, replacement);
  }
  return out;
}

// 줄바꿈을 자연스러운 호흡으로
function naturalizeBreaks(text: string): string {
  return text
    .replace(/\n{2,}/g, '. ')   // 빈 줄 = 문장 종료
    .replace(/\n/g, ', ')        // 단일 줄바꿈 = 짧은 호흡
    .replace(/,\s*\./g, '.')     // ", ." 정리
    .replace(/\.\s*\./g, '.')    // ".." 정리
    .replace(/,\s*,/g, ',')      // ",," 정리
    .replace(/\s+/g, ' ')        // 다중 공백 정리
    .trim();
}

function stripMarkdownForTts(text: string): string {
  let out = text
    .replace(/```[\s\S]*?```/g, '') // 코드 블록 제거
    .replace(/`([^`]+)`/g, '$1')     // 인라인 코드
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1')     // italic
    .replace(/^#{1,6}\s+/gm, '')        // 헤더 #
    .replace(/^[-*]\s+/gm, '')          // 리스트 - *
    .replace(/^\d+\.\s+/gm, '')         // 번호 리스트
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 링크
    // 이모지·픽토그램 광범위 제거 (TTS에서 부자연)
    .replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{1F000}-\u{1F2FF}]/gu, '')
    .replace(/✓|×|✔|✗/g, '');

  // 단위·기호 자연 발음
  out = naturalizeUnitsAndSymbols(out);
  // 영어 약어 → 한글 발음
  out = expandAbbreviations(out);
  // 줄바꿈을 자연 호흡으로
  out = naturalizeBreaks(out);

  return out;
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
      speed: config.OPENAI_TTS_SPEED,
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
