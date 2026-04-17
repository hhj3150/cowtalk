// 오디오 API — TTS (텍스트→음성)
// POST /api/audio/speak — 텍스트를 받아 mp3 바이너리 반환

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { synthesize, type TtsVoice, type TtsModel } from '../../services/audio/tts.service.js';
import { logger } from '../../lib/logger.js';

export const audioRouter = Router();

audioRouter.use(authenticate);

const speakSchema = z.object({
  text: z.string().min(1).max(4000),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional(),
  model: z.enum(['tts-1', 'tts-1-hd']).optional(),
  maxChars: z.number().int().min(50).max(4000).optional(),
});

audioRouter.post('/speak', async (req, res) => {
  try {
    const input = speakSchema.parse(req.body);
    const result = await synthesize({
      text: input.text,
      voice: input.voice as TtsVoice | undefined,
      model: input.model as TtsModel | undefined,
      maxChars: input.maxChars,
    });

    // 클라이언트 친화 메타데이터를 헤더로 노출 (CORS 화이트리스트 필요할 수 있음)
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', String(result.audio.length));
    res.setHeader('X-TTS-Cached', String(result.cached));
    res.setHeader('X-TTS-Truncated', String(result.truncated));
    res.setHeader('X-TTS-Original-Length', String(result.originalLength));
    res.setHeader('X-TTS-Synthesized-Length', String(result.synthesizedLength));
    res.setHeader('Cache-Control', 'private, max-age=3600'); // 클라이언트도 1시간 캐시

    res.send(result.audio);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, msg }, '[audio.routes] speak failed');

    // OPENAI_API_KEY 미설정은 503 (서비스 미설정)
    if (msg.includes('OPENAI_API_KEY')) {
      res.status(503).json({
        success: false,
        error: { code: 'TTS_NOT_CONFIGURED', message: '음성 합성이 아직 설정되지 않았습니다' },
      });
      return;
    }

    // OpenAI API 호출 실패는 502 (외부 의존)
    // 진단 편의: OpenAI 상태코드 추출 (메시지 형식: "OpenAI TTS 실패 (HTTP 401)")
    if (msg.includes('OpenAI TTS')) {
      const statusMatch = /HTTP (\d{3})/.exec(msg);
      const upstreamStatus = statusMatch?.[1];
      const hint =
        upstreamStatus === '401' ? 'API 키 인증 실패 — Railway OPENAI_API_KEY 값 확인'
        : upstreamStatus === '403' ? 'API 키 권한 부족 — OpenAI 대시보드에서 Audio 권한 확인'
        : upstreamStatus === '429' ? '요청 한도 초과 — credit 잔액 또는 rate limit 확인'
        : upstreamStatus === '400' ? '요청 형식 오류 — 입력 텍스트 확인'
        : '일시 장애 — 잠시 후 다시 시도';
      res.status(502).json({
        success: false,
        error: {
          code: 'TTS_UPSTREAM_ERROR',
          message: `음성 서비스 오류 (OpenAI HTTP ${upstreamStatus ?? '?'}): ${hint}`,
          upstreamStatus,
        },
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: { code: 'TTS_FAILED', message: msg },
    });
  }
});

// GET /api/audio/voices — 사용 가능한 음성 목록 (UI에서 선택 옵션 표시용)
audioRouter.get('/voices', (_req, res) => {
  res.json({
    success: true,
    data: {
      voices: [
        { id: 'nova', label: 'Nova (여성, 따뜻)', recommended: true },
        { id: 'shimmer', label: 'Shimmer (여성, 차분)', recommended: false },
        { id: 'alloy', label: 'Alloy (중성, 평균)', recommended: false },
        { id: 'fable', label: 'Fable (영국식, 이야기조)', recommended: false },
        { id: 'onyx', label: 'Onyx (남성, 깊은 톤)', recommended: false },
        { id: 'echo', label: 'Echo (남성, 평균)', recommended: false },
      ],
      models: [
        { id: 'tts-1', label: '표준 (빠름)', costPer1MChars: 15 },
        { id: 'tts-1-hd', label: 'HD (자연성 높음, 2배 비용)', costPer1MChars: 30 },
      ],
    },
  });
});
