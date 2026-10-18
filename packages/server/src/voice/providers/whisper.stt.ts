// Whisper 어댑터 — 기존 stt.service 를 포트에 맞춘다.
// 기존 서비스는 수정하지 않는다 (지시서 §8: 기존 코드 구조 변경 금지).
//
// 위치: 한국어 정확도는 국내 엔진보다 낮지만 다국어 폭이 넓다.
// 우즈벡어·러시아어가 필요한 해외 채널에서는 이쪽이 여전히 유리하다.

import { transcribe as whisperTranscribe } from '../../services/audio/stt.service.js';
import { config } from '../../config/index.js';
import type { SttProvider, SttRequest, SttResult } from './stt.port.js';

export const whisperStt: SttProvider = {
  name: 'whisper',

  isConfigured(): boolean {
    return Boolean(config.OPENAI_API_KEY);
  },

  async transcribe(req: SttRequest): Promise<SttResult> {
    const started = Date.now();
    // Whisper 의 힌트는 자유 텍스트 prompt 한 덩어리다.
    const prompt = req.hints && req.hints.length > 0 ? req.hints.join(' ') : undefined;

    const r = await whisperTranscribe({
      audio: req.audio,
      contentType: req.contentType,
      language: req.language ?? 'ko',
      ...(prompt ? { prompt } : {}),
    });

    return {
      text: r.text,
      // Whisper 는 신뢰도를 주지 않는다. 없는 값을 지어내지 않는다 —
      // 신뢰도가 없으면 오케스트레이터가 "되묻기" 판단을 텍스트 휴리스틱으로 대신한다.
      language: r.language,
      durationMs: Date.now() - started,
    };
  },
};
