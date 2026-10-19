// 오디오 API — TTS (텍스트→음성) + STT (음성→텍스트, Whisper)
// POST /api/audio/speak — 텍스트를 받아 mp3 바이너리 반환
// POST /api/audio/transcribe — 오디오 바이너리를 받아 텍스트 반환 (iOS Safari Web Speech API 한계 우회)

import { Router, raw } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { synthesize, type TtsVoice, type TtsModel } from '../../services/audio/tts.service.js';
import { transcribe } from '../../services/audio/stt.service.js';
import { logger } from '../../lib/logger.js';
import { getAudioModels, TTS_PREFERENCE, STT_PREFERENCE } from '../../services/audio/model-registry.js';
import { config } from '../../config/index.js';

export const audioRouter = Router();

audioRouter.use(authenticate);

const speakSchema = z.object({
  text: z.string().min(1).max(4000),
  voice: z
    .enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'sage', 'ash', 'ballad', 'verse'])
    .optional(),
  model: z.enum(['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts']).optional(),
  maxChars: z.number().int().min(50).max(4000).optional(),
  /** 말투 지시 (gpt-4o-mini-tts 전용) */
  instructions: z.string().max(1000).optional(),
});

audioRouter.post('/speak', async (req, res) => {
  try {
    const input = speakSchema.parse(req.body);
    const result = await synthesize({
      text: input.text,
      voice: input.voice as TtsVoice | undefined,
      model: input.model as TtsModel | undefined,
      maxChars: input.maxChars,
      instructions: input.instructions,
    });

    // 클라이언트 친화 메타데이터를 헤더로 노출 (CORS 화이트리스트 필요할 수 있음)
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', String(result.audio.length));
    res.setHeader('X-TTS-Cached', String(result.cached));
    res.setHeader('X-TTS-Truncated', String(result.truncated));
    res.setHeader('X-TTS-Original-Length', String(result.originalLength));
    res.setHeader('X-TTS-Synthesized-Length', String(result.synthesizedLength));
    // CDN/프록시의 바이너리 변조 방지 — 브라우저 NotSupportedError 예방
    //   no-transform: 중간 프록시가 content encoding을 바꾸지 못하게 (Fastly/Netlify 포함)
    //   X-Accel-Buffering: nginx 앞단 있을 때 버퍼링 금지
    //
    // ⚠️ Content-Encoding: identity 는 붙이지 않는다.
    //    RFC 7231에서 응답의 Content-Encoding에 identity를 쓰는 것은 권장되지 않고,
    //    HTTP/2 게이트웨이(Railway)를 거치면 브라우저가 "알 수 없는 인코딩"으로 보고
    //    본문 디코드에 실패한다 → audio.play()가 NotSupportedError로 죽는다.
    //    (원래 Netlify 프록시 대응으로 넣었던 헤더인데, 클라이언트가 Railway를 직접
    //     호출하도록 바뀌면서 필요가 없어졌고 부작용만 남았다)
    res.setHeader('Cache-Control', 'private, max-age=3600, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Accept-Ranges', 'none'); // 부분 요청 방지 (일부 브라우저가 range로 바이너리 쪼개 요청 시 파손 방지)

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

// POST /api/audio/transcribe — Whisper STT
// Content-Type: audio/webm | audio/mp4 | audio/wav 등 (브라우저 MediaRecorder가 자동 결정)
// Query: lang (ko|uz|en|ru|mn) — 정확도 향상용 힌트
// Body: raw audio buffer (최대 25MB)
audioRouter.post(
  '/transcribe',
  raw({ type: ['audio/*', 'application/octet-stream'], limit: '25mb' }),
  async (req, res) => {
    try {
      const audio = req.body as Buffer;
      const contentType = req.headers['content-type'] ?? 'audio/webm';
      logger.info({
        contentType,
        bytes: Buffer.isBuffer(audio) ? audio.length : 0,
        isBuffer: Buffer.isBuffer(audio),
        bodyType: typeof req.body,
      }, '[audio.routes] transcribe 수신');

      if (!Buffer.isBuffer(audio) || audio.length === 0) {
        res.status(400).json({ success: false, error: { code: 'EMPTY_AUDIO', message: `오디오 본문이 비어 있거나 raw parser가 처리 못 함 (type=${contentType}, isBuffer=${Buffer.isBuffer(audio)})` } });
        return;
      }
      const lang = typeof req.query.lang === 'string' ? req.query.lang.toLowerCase() : undefined;
      const allowed = new Set(['ko', 'uz', 'en', 'ru', 'mn']);
      const language = lang && allowed.has(lang) ? lang : undefined;

      const result = await transcribe({
        audio,
        contentType: contentType as string,
        language,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, msg }, '[audio.routes] transcribe failed');
      if (msg.includes('OPENAI_API_KEY')) {
        res.status(503).json({ success: false, error: { code: 'STT_NOT_CONFIGURED', message: '음성 인식이 아직 설정되지 않았습니다' } });
        return;
      }
      if (msg.includes('OpenAI STT')) {
        const statusMatch = /HTTP (\d{3})/.exec(msg);
        res.status(502).json({
          success: false,
          error: { code: 'STT_UPSTREAM_ERROR', message: msg, upstreamStatus: statusMatch?.[1] },
        });
        return;
      }
      res.status(400).json({ success: false, error: { code: 'STT_FAILED', message: msg } });
    }
  },
);

// GET /api/audio/health — 지금 실제로 어떤 음성 모델이 쓰이는지 확인한다.
// "업그레이드가 됐나?"를 추측이 아니라 눈으로 확인하기 위한 엔드포인트.
//   ttsSource/sttSource:
//     probed-best          = 이 키로 쓸 수 있는 것 중 최상위가 확정됨 (정상)
//     env-pinned           = 운영자가 환경변수로 고정함
//     preferred-unverified = 모델 목록 조회 실패 — 선호 모델을 그대로 사용 중
audioRouter.get('/health', async (_req, res) => {
  try {
    const models = await getAudioModels();
    const ttsIsBest = models.tts === TTS_PREFERENCE[0];
    const sttIsBest = models.stt === STT_PREFERENCE[0];
    res.json({
      success: true,
      data: {
        configured: Boolean(config.OPENAI_API_KEY),
        tts: { model: models.tts, source: models.ttsSource, isLatest: ttsIsBest, preference: TTS_PREFERENCE },
        stt: { model: models.stt, source: models.sttSource, isLatest: sttIsBest, preference: STT_PREFERENCE },
        availableAudioModels: models.availableAudioModels,
        probeError: models.probeError ?? null,
        resolvedAt: models.resolvedAt,
        // 한눈에 보는 판정 — 대시보드·운영자용
        verdict: !config.OPENAI_API_KEY
          ? 'not_configured'
          : models.probeError
            ? 'unverified'
            : ttsIsBest && sttIsBest
              ? 'latest'
              : 'outdated',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, msg }, '[audio.routes] health failed');
    res.status(500).json({ success: false, error: { code: 'AUDIO_HEALTH_FAILED', message: msg } });
  }
});

// GET /api/audio/voices — 사용 가능한 음성 목록 (UI에서 선택 옵션 표시용)
audioRouter.get('/voices', (_req, res) => {
  res.json({
    success: true,
    data: {
      voices: [
        { id: 'nova', label: 'Nova (여성, 따뜻)', recommended: true },
        { id: 'coral', label: 'Coral (여성, 또렷·현장 권장)', recommended: true },
        { id: 'sage', label: 'Sage (여성, 침착)', recommended: false },
        { id: 'shimmer', label: 'Shimmer (여성, 차분)', recommended: false },
        { id: 'alloy', label: 'Alloy (중성, 평균)', recommended: false },
        { id: 'ash', label: 'Ash (남성, 단단)', recommended: false },
        { id: 'ballad', label: 'Ballad (남성, 부드러움)', recommended: false },
        { id: 'verse', label: 'Verse (중성, 표현력)', recommended: false },
        { id: 'fable', label: 'Fable (영국식, 이야기조)', recommended: false },
        { id: 'onyx', label: 'Onyx (남성, 깊은 톤)', recommended: false },
        { id: 'echo', label: 'Echo (남성, 평균)', recommended: false },
      ],
      models: [
        { id: 'gpt-4o-mini-tts', label: '기본 (자연성 최고 · 말투 지시 지원)', costPer1MChars: 12 },
        { id: 'tts-1', label: '표준 (빠름)', costPer1MChars: 15 },
        { id: 'tts-1-hd', label: 'HD (구형 고음질)', costPer1MChars: 30 },
      ],
    },
  });
});
