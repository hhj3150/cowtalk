// 공급자 선택 — 환경변수 하나로 갈아끼운다.
// 이 저장소가 이미 쓰는 방식(ANTHROPIC_MODEL 교체 후 실 API 확인)과 같은 패턴이다.
//
// 폴백 규칙: 지정한 공급자가 설정돼 있지 않으면 조용히 죽지 않고
// 폴백 공급자로 내려간다. 현장에서 "왜 안 되지"가 가장 큰 좌절이기 때문이다.

import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import type { SttProvider } from './stt.port.js';
import type { TtsProvider } from './tts.port.js';
import { whisperStt } from './whisper.stt.js';
import { clovaStt } from './clova.stt.js';
import { openaiTts } from './openai.tts.js';
import { clovaTts } from './clova.tts.js';

const STT_REGISTRY: Readonly<Record<string, SttProvider>> = {
  whisper: whisperStt,
  clova: clovaStt,
};

const TTS_REGISTRY: Readonly<Record<string, TtsProvider>> = {
  openai: openaiTts,
  clova: clovaTts,
};

/** 설정된 것 중 첫 번째를 고른다. 선택 이유를 로그로 남긴다. */
function pick<T extends { name: string; isConfigured(): boolean }>(
  kind: string,
  preferred: string,
  registry: Readonly<Record<string, T>>,
  order: readonly string[],
): T | null {
  const first = registry[preferred];
  if (first?.isConfigured()) return first;

  if (first) {
    logger.warn({ kind, preferred }, '[voice] 지정 공급자가 미설정 — 폴백 탐색');
  } else {
    logger.warn({ kind, preferred }, '[voice] 알 수 없는 공급자 이름 — 폴백 탐색');
  }

  for (const name of order) {
    const p = registry[name];
    if (p?.isConfigured()) {
      logger.info({ kind, chosen: p.name }, '[voice] 폴백 공급자 선택');
      return p;
    }
  }
  return null;
}

export function getSttProvider(): SttProvider | null {
  return pick('stt', config.VOICE_STT_PROVIDER, STT_REGISTRY, ['clova', 'whisper']);
}

export function getTtsProvider(): TtsProvider | null {
  return pick('tts', config.VOICE_TTS_PROVIDER, TTS_REGISTRY, ['clova', 'openai']);
}

export type { SttProvider, SttRequest, SttResult } from './stt.port.js';
export type { TtsProvider, TtsRequest, TtsResult } from './tts.port.js';
