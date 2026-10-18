// CLOVA Voice (Premium TTS) 어댑터 — 한국어 명료도 우선 경로.
//
// ⚠️ 키가 없어 실 호출로 검증하지 못했다. 키 확보 후 스모크 테스트 필요.
//
// 화자 기본값 'nara' — 표준 한국어 여성. 현장 고령 사용자 대상 명료도를
// 실제로 들어보고 정할 것 (환경변수 CLOVA_TTS_SPEAKER 로 교체).
// CLOVA 의 speed 는 -5~5 정수(음수가 빠름)라 포트의 배속 개념과 반대다 — 아래에서 변환한다.

import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import type { TtsProvider, TtsRequest, TtsResult } from './tts.port.js';

const TTS_ENDPOINT = 'https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts';

/** 포트의 배속(1.0=기본, 클수록 빠름) → CLOVA speed(-5~5, 음수가 빠름) */
export function toClovaSpeed(rate?: number): number {
  if (!rate || rate === 1) return 0;
  // 1.0 → 0, 1.5 → -2, 0.5 → +5 정도의 완만한 매핑
  const v = Math.round((1 - rate) * 5);
  return Math.max(-5, Math.min(5, v));
}

export const clovaTts: TtsProvider = {
  name: 'clova',

  isConfigured(): boolean {
    return Boolean(config.CLOVA_CLIENT_ID && config.CLOVA_CLIENT_SECRET);
  },

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    if (!clovaTts.isConfigured()) {
      throw new Error('CLOVA_CLIENT_ID/SECRET 미설정 — CLOVA TTS 사용 불가');
    }
    const max = req.maxChars ?? config.VOICE_TTS_MAX_CHARS;
    const truncated = req.text.length > max;
    const text = truncated ? req.text.slice(0, max) : req.text;

    const form = new URLSearchParams({
      speaker: req.voice ?? config.CLOVA_TTS_SPEAKER,
      text,
      format: 'mp3',
      speed: String(toClovaSpeed(req.speed)),
    });

    const res = await fetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': config.CLOVA_CLIENT_ID as string,
        'X-NCP-APIGW-API-KEY': config.CLOVA_CLIENT_SECRET as string,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error({ status: res.status, body: body.slice(0, 300) }, '[voice/clova-tts] 합성 실패');
      throw new Error(`CLOVA TTS 실패 (${res.status})`);
    }

    const audio = Buffer.from(await res.arrayBuffer());
    return {
      audio,
      contentType: 'audio/mpeg',
      cached: false, // CLOVA 경로는 아직 캐시를 붙이지 않았다 — 정형 문구는 OpenAI 경로가 담당
      truncated,
      synthesizedLength: text.length,
    };
  },
};
