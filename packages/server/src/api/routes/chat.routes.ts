// CowTalk Chat 라우트 — Claude AI 대화

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { chatMessageSchema } from '@cowtalk/shared';
import type { Role } from '@cowtalk/shared';
import { handleChatMessage, handleChatStream, buildStreamFallback } from '../../chat/chat-service.js';
import { isClaudeAvailable } from '../../ai-brain/claude-client.js';
import { resolveContext } from '../../chat/context-builder.js';

export const chatRouter = Router();

chatRouter.use(authenticate);

// 보안: 입력 길이 제한 + 새니타이징
const MAX_QUESTION_LENGTH = 2000; // 최대 2000자
const MAX_HISTORY_TURNS = 20; // 최대 20턴

function sanitizeQuestion(q: string): string {
  return q.slice(0, MAX_QUESTION_LENGTH).trim();
}

// === 역할별 추천 질문 ===

const ROLE_SUGGESTIONS: Readonly<Record<string, readonly string[]>> = {
  farmer: [
    '오늘 할 일 요약해 줘',
    '건강이상 소 있어?',
    '발정 후보 알려줘',
    '센서 장착률 어때?',
  ],
  veterinarian: [
    '오늘 긴급 진료 대상은?',
    '이번 주 주의 농장 알려줘',
    '발정인지 질병인지 구분해 줘',
    '유방염 의심 케이스 있어?',
  ],
  government_admin: [
    '관할 지역 현황 요약',
    '주의 농장 순위 보여줘',
    '이벤트 유형별 통계',
    '이번 달 보고서 요약',
  ],
  quarantine_officer: [
    '체온이상 농장 현황',
    '집단감염 의심 신호 있어?',
    '질병 클러스터 분석',
    '방역 조치 우선순위',
  ],
};

// JSON 응답
chatRouter.post('/message', validate({ body: chatMessageSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      question: string;
      farmId?: string;
      animalId?: string;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
      dashboardContext?: string;
      uiLang?: 'ko' | 'en' | 'uz' | 'ru' | 'mn';
    };

    const result = await handleChatMessage({
      question: sanitizeQuestion(body.question),
      role: req.user?.role as Role,
      farmId: body.farmId ?? null,
      animalId: body.animalId ?? null,
      userId: req.user?.userId,
      conversationHistory: (body.conversationHistory ?? []).slice(-MAX_HISTORY_TURNS),
      dashboardContext: body.dashboardContext,
      uiLang: body.uiLang,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// SSE 스트리밍
chatRouter.post('/stream', validate({ body: chatMessageSchema }), async (req: Request, res: Response) => {
  const body = req.body as {
    question: string;
    farmId?: string;
    animalId?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    dashboardContext?: string;
    uiLang?: 'ko' | 'en' | 'uz' | 'ru' | 'mn';
  };

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, no-transform, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');       // nginx/일부 프록시에 버퍼링 금지 지시
  res.setHeader('Content-Encoding', 'identity');  // gzip/brotli 비활성 (SSE 스트리밍 유지)
  res.flushHeaders();

  // 즉시 첫 바이트 전송 — 프록시가 헤더만 받고 body 타임아웃 내는 걸 방지
  // (주석 줄은 SSE에서 무시되지만 TCP 레벨에서 데이터가 흘렀음을 증명)
  res.write(': stream-open\n\n');

  // SSE keep-alive (프록시 타임아웃 방지 — 5초 간격, 기존 10초는 일부 CDN에서 부족)
  const keepAlive = setInterval(() => { res.write(':\n\n'); }, 5000);
  req.on('close', () => { clearInterval(keepAlive); });

  const chatRequest = {
    question: sanitizeQuestion(body.question),
    role: req.user?.role as Role,
    farmId: body.farmId ?? null,
    animalId: body.animalId ?? null,
    userId: req.user?.userId,
    conversationHistory: (body.conversationHistory ?? []).slice(-MAX_HISTORY_TURNS),
    dashboardContext: body.dashboardContext,
    uiLang: body.uiLang,
  };

  try {
    // API 키 없으면 데이터 기반 fallback 응답 생성
    if (!isClaudeAvailable()) {
      let fallbackText: string;
      try {
        const { context } = await resolveContext(
          chatRequest.question, chatRequest.farmId, chatRequest.animalId, chatRequest.role, chatRequest.dashboardContext,
        );
        fallbackText = buildStreamFallback(chatRequest.question, chatRequest.role, context);
      } catch {
        fallbackText = 'AI 엔진이 현재 오프라인입니다. 대시보드에서 실시간 데이터를 확인해주세요.\n\n💡 잠시 후 다시 시도해 주세요.';
      }
      res.write(`data: ${JSON.stringify({ type: 'text', content: fallbackText })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', content: fallbackText })}\n\n`);
      clearInterval(keepAlive);
      res.end();
      return;
    }

    await handleChatStream(
      chatRequest,
      {
        onText: (text) => {
          res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
        },
        onDone: (fullText) => {
          clearInterval(keepAlive);
          res.write(`data: ${JSON.stringify({ type: 'done', content: fullText })}\n\n`);
          res.end();
        },
        onError: (error) => {
          clearInterval(keepAlive);
          // error.message가 이미 상세 정보(status, model 등)를 포함 — 그대로 노출
          const errorMsg = error.message || 'AI 서비스 오류';
          res.write(`data: ${JSON.stringify({ type: 'error', content: errorMsg })}\n\n`);
          res.end();
        },
        onToolEvent: (event) => {
          res.write(`data: ${JSON.stringify({ type: 'tool_event', ...event })}\n\n`);
        },
      },
    );
  } catch (error) {
    clearInterval(keepAlive);
    const msg = error instanceof Error ? error.message : 'AI 서비스 오류가 발생했습니다';
    res.write(`data: ${JSON.stringify({ type: 'error', content: msg })}\n\n`);
    res.end();
  }
});

// 대화 이력 (클라이언트-사이드 관리, 서버는 빈 배열 반환)
chatRouter.get('/history', (_req, res) => {
  res.json({ success: true, data: [] });
});

// 역할별 추천 질문
chatRouter.get('/suggestions', (req: Request, res: Response) => {
  const role = (req.user?.role ?? 'farmer') as string;
  const suggestions = ROLE_SUGGESTIONS[role] ?? ROLE_SUGGESTIONS.farmer ?? [];
  const aiAvailable = isClaudeAvailable();

  res.json({
    success: true,
    data: {
      suggestions,
      aiAvailable,
    },
  });
});
