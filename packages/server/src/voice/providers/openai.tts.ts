// OpenAI TTS 어댑터 — 기존 tts.service 를 포트에 맞춘다.
// 기존 서비스에 이미 LRU 캐시(200건·24h)가 붙어 있어, 정형 문구(선행 응답·확인 문구)에는
// 오히려 이쪽이 유리하다. 캐시 히트 시 합성 지연이 사실상 0이다.

import { synthesize, type TtsVoice } from '../../services/audio/tts.service.js';
import { config } from '../../config/index.js';
import type { TtsProvider, TtsRequest, TtsResult } from './tts.port.js';

const VALID_VOICES: readonly string[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

export const openaiTts: TtsProvider = {
  name: 'openai',

  isConfigured(): boolean {
    return Boolean(config.OPENAI_API_KEY);
  },

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    // 포트의 voice 는 자유 문자열이다. OpenAI 가 모르는 화자면 기본값으로 떨어뜨린다
    // — 잘못된 값을 그대로 보내면 400 이고, 음성이 안 나오는 것보다 기본 목소리가 낫다.
    const voice = req.voice && VALID_VOICES.includes(req.voice) ? (req.voice as TtsVoice) : undefined;

    const r = await synthesize({
      text: req.text,
      ...(voice ? { voice } : {}),
      ...(req.maxChars ? { maxChars: req.maxChars } : {}),
    });

    return {
      audio: r.audio,
      contentType: r.contentType,
      cached: r.cached,
      truncated: r.truncated,
      synthesizedLength: r.synthesizedLength,
    };
  },
};
