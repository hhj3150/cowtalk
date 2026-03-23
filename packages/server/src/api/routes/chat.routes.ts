// CowTalk Chat 라우트 — Claude AI 대화

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { chatMessageSchema } from '@cowtalk/shared';
import type { Role } from '@cowtalk/shared';
import { handleChatMessage, handleChatStream } from '../../chat/chat-service.js';
import { isClaudeAvailable } from '../../ai-brain/claude-client.js';

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
  inseminator: [
    '오늘 수정할 소 목록',
    '발정적기 소 있어?',
    '임신 재검 대상 알려줘',
    '수태율 통계 분석해 줘',
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
  feed_company: [
    '반추이상 동물 현황',
    '사료 효율 분석',
    '농장별 사양 리스크',
    'pH 이상 동물 확인',
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
    };

    const result = await handleChatMessage({
      question: sanitizeQuestion(body.question),
      role: req.user?.role as Role,
      farmId: body.farmId ?? null,
      animalId: body.animalId ?? null,
      conversationHistory: (body.conversationHistory ?? []).slice(-MAX_HISTORY_TURNS),
      dashboardContext: body.dashboardContext,
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
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // API 키 없으면 즉시 fallback 응답
  if (!isClaudeAvailable()) {
    res.write(`data: ${JSON.stringify({ type: 'text', content: 'AI 엔진이 현재 사용 불가합니다. 대시보드의 데이터를 직접 확인해 주세요.' })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'done', content: 'AI 엔진이 현재 사용 불가합니다. 대시보드의 데이터를 직접 확인해 주세요.' })}\n\n`);
    res.end();
    return;
  }

  await handleChatStream(
    {
      question: sanitizeQuestion(body.question),
      role: req.user?.role as Role,
      farmId: body.farmId ?? null,
      animalId: body.animalId ?? null,
      conversationHistory: (body.conversationHistory ?? []).slice(-MAX_HISTORY_TURNS),
      dashboardContext: body.dashboardContext,
    },
    {
      onText: (text) => {
        res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
      },
      onDone: (fullText) => {
        res.write(`data: ${JSON.stringify({ type: 'done', content: fullText })}\n\n`);
        res.end();
      },
      onError: (error) => {
        res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
        res.end();
      },
    },
  );
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
