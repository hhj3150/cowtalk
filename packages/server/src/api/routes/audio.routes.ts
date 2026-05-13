// 오디오 API — TTS (텍스트→음성) + STT (음성→텍스트, Whisper)
// POST /api/audio/speak — 텍스트를 받아 mp3 바이너리 반환
// POST /api/audio/transcribe — 오디오 바이너리를 받아 텍스트 반환 (iOS Safari Web Speech API 한계 우회)

import { Router, raw } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { synthesize, type TtsVoice, type TtsModel } from '../../services/audio/tts.service.js';
import { transcribe, getDomainPrompt } from '../../services/audio/stt.service.js';
import {
  checkAndIncrementTtsUsage,
  getUserTtsUsage,
  estimateTtsCostUsd,
  getQuotaLimits,
} from '../../services/audio/tts-quota.service.js';
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

    // 쿼터 — 합성 전에 사전 차단. maxChars가 적용된 후 실제 합성 글자수가 줄 수 있지만,
    // 요청 글자수를 기준으로 계산해야 악성 사용자가 한 번에 4,000자씩 보내는 것을 막을 수 있다.
    // 트런케이션 후 글자수가 줄어도 환불은 하지 않는다 (Redis race + 복잡성).
    const userId = req.user?.userId ?? '';
    const role = req.user?.role;
    const requestChars = Math.min(input.text.length, input.maxChars ?? input.text.length);
    const quota = await checkAndIncrementTtsUsage(userId, requestChars, role);
    if (!quota.allowed) {
      const limits = getQuotaLimits();
      const used = quota.limitType === 'daily' ? quota.dailyUsed : quota.monthlyUsed;
      const limit = quota.limitType === 'daily' ? limits.dailyLimit : limits.monthlyLimit;
      const periodLabel = quota.limitType === 'daily' ? '일' : '월';
      res.setHeader('Retry-After', String(quota.retryAfterSeconds ?? 3600));
      res.status(429).json({
        success: false,
        error: {
          code: 'TTS_QUOTA_EXCEEDED',
          message: `${periodLabel} TTS 사용량 한도 도달 (${used.toLocaleString()}/${limit.toLocaleString()}자). ${quota.limitType === 'daily' ? '자정' : '다음 달 1일'} 리셋.`,
          limitType: quota.limitType,
          dailyUsed: quota.dailyUsed,
          monthlyUsed: quota.monthlyUsed,
          retryAfterSeconds: quota.retryAfterSeconds,
        },
      });
      return;
    }

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
    // CDN/프록시의 바이너리 변조 방지 — 브라우저 NotSupportedError 예방
    //   no-transform: 중간 프록시가 content encoding을 바꾸지 못하게 (Fastly/Netlify 포함)
    //   identity: gzip/brotli 비활성 — MP3 원본 그대로 전달 (손상 방지)
    //   X-Accel-Buffering: nginx 앞단 있을 때 버퍼링 금지
    res.setHeader('Cache-Control', 'private, max-age=3600, no-transform');
    res.setHeader('Content-Encoding', 'identity');
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
        // 언어별 도메인 프롬프트 — 코드스위칭(한국어+영어 브랜드명 혼합) 견고화.
        prompt: getDomainPrompt(language),
      });

      res.json({ success: true, data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, msg }, '[audio.routes] transcribe failed');
      if (msg.includes('OPENAI_API_KEY')) {
        res.status(503).json({ success: false, error: { code: 'STT_NOT_CONFIGURED', message: '음성 인식이 아직 설정되지 않았습니다' } });
        return;
      }
      if (msg.includes('Whisper')) {
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

// GET /api/audio/usage — 본인 TTS 사용량 조회 (UI에서 잔여 한도 표시용)
audioRouter.get('/usage', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: '인증 필요' } });
    return;
  }
  const usage = await getUserTtsUsage(userId);
  const limits = getQuotaLimits();
  const role = req.user?.role;
  const bypass = role === 'government_admin' || role === 'quarantine_officer';
  res.json({
    success: true,
    data: {
      ...usage,
      dailyLimit: limits.dailyLimit,
      monthlyLimit: limits.monthlyLimit,
      dailyRemaining: bypass ? null : Math.max(0, limits.dailyLimit - usage.dailyChars),
      monthlyRemaining: bypass ? null : Math.max(0, limits.monthlyLimit - usage.monthlyChars),
      estimatedMonthlyCostUsd: estimateTtsCostUsd(usage.monthlyChars),
      bypass,
    },
  });
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
