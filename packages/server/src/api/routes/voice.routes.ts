// 음성 턴 API — 한 번의 발화를 받아 답변 음성을 스트리밍으로 돌려준다.
//
// POST /api/voice/turn   오디오 업로드 → SSE 로 전사·자막·오디오를 순서대로 push
// GET  /api/voice/health 공급자 설정 상태 (현장에서 "왜 안 되지"를 즉시 판별)
//
// 왜 SSE 인가: 오디오를 한 덩어리로 기다리면 첫 소리가 늦다.
// 문장 단위로 합성되는 대로 밀어내야 체감 지연이 목표 안에 들어온다.
// WebSocket 도 되지만 이 저장소의 인증·프록시 구성과 SSE 가 더 잘 맞는다.

import { Router, raw } from 'express';
import { authenticate } from '../middleware/auth.js';
import { runVoiceTurn } from '../../voice/orchestrator.js';
import { getSttProvider, getTtsProvider } from '../../voice/providers/index.js';
import { config } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import type { Role } from '@cowtalk/shared';

export const voiceRouter = Router();

voiceRouter.use(authenticate);

const MAX_AUDIO_BYTES = 12 * 1024 * 1024; // 12MB — push-to-talk 한 턴이면 충분

voiceRouter.get('/health', (_req, res) => {
  const stt = getSttProvider();
  const tts = getTtsProvider();
  res.json({
    success: true,
    data: {
      stt: stt ? { provider: stt.name, ready: true } : { provider: null, ready: false },
      tts: tts ? { provider: tts.name, ready: true } : { provider: null, ready: false },
      models: { fast: config.VOICE_MODEL_FAST, main: config.VOICE_MODEL_MAIN },
      llmReady: Boolean(config.ANTHROPIC_API_KEY),
    },
  });
});

voiceRouter.post(
  '/turn',
  raw({ type: ['audio/*', 'application/octet-stream'], limit: MAX_AUDIO_BYTES }),
  async (req, res) => {
    const audio = req.body as Buffer;
    if (!Buffer.isBuffer(audio) || audio.length === 0) {
      res.status(400).json({ success: false, error: { code: 'EMPTY_AUDIO', message: '오디오가 비어 있습니다' } });
      return;
    }

    // SSE 헤더 — 프록시 버퍼링을 끄지 않으면 청크가 모여서 한 번에 온다(=지연)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const user = (req as { user?: { userId?: string; role?: string; farmId?: string } }).user;
    const farmId = (req.query.farmId as string | undefined) ?? user?.farmId;

    let closed = false;
    req.on('close', () => { closed = true; });

    try {
      await runVoiceTurn(
        {
          audio,
          contentType: req.headers['content-type'] ?? 'audio/webm',
          language: (req.query.lang as string | undefined) ?? 'ko',
          toolContext: {
            ...(user?.userId ? { userId: user.userId } : {}),
            role: (user?.role ?? 'farmer') as Role,
            ...(farmId ? { farmId } : {}),
          },
        },
        {
          onTranscript: (text, confidence) => {
            if (!closed) send('transcript', { text, confidence });
          },
          onText: (sentence) => {
            if (!closed) send('text', { sentence });
          },
          onAudio: (buf, contentType, seq, isAck) => {
            // 오디오는 base64 로 실어 보낸다. SSE 는 바이너리를 못 싣는다.
            if (!closed) send('audio', { seq, isAck, contentType, b64: buf.toString('base64') });
          },
          onDone: (fullText) => {
            if (!closed) { send('done', { text: fullText }); res.end(); }
          },
          onError: (err) => {
            logger.error({ err }, '[voice.routes] 턴 실패');
            if (!closed) { send('error', { message: err.message }); res.end(); }
          },
        },
      );
    } catch (err) {
      logger.error({ err }, '[voice.routes] 예기치 못한 실패');
      if (!closed) { send('error', { message: '음성 처리에 실패했습니다' }); res.end(); }
    }
  },
);
