// CowTalk Chat 라우트 — Claude AI 대화

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { scopedFarmIds } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { chatMessageSchema } from '@cowtalk/shared';
import type { Role } from '@cowtalk/shared';
import { handleChatMessage, handleChatStream, buildStreamFallback } from '../../chat/chat-service.js';
import { isClaudeAvailable } from '../../ai-brain/claude-client.js';
import { resolveContext } from '../../chat/context-builder.js';
import { sanitizeChatScope } from '../../chat/chat-scope.js';
import { getAnimalFarmId } from '../middleware/animal-access.js';
import { logger } from '../../lib/logger.js';
import { getDb } from '../../config/database.js';
import { chatConversations } from '../../db/schema.js';
import { and, eq, desc } from 'drizzle-orm';
import { claimInFlight, releaseInFlight } from '../../lib/inflight-dedupe.js';
import { getRedis } from '../../serving/cache.service.js';

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
      userText?: string;
      farmId?: string;
      animalId?: string;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
      dashboardContext?: string;
      uiLang?: 'ko' | 'en' | 'uz' | 'ru' | 'mn';
      images?: Array<{ data: string; mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }>;
      documents?: Array<{ data: string; mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' | 'application/vnd.ms-excel' | 'text/csv'; filename?: string }>;
    };

    // 클라이언트의 farmId/animalId는 "요청"일 뿐 권한이 아니다 — 맥락 구성 전에 권한과 대조
    const permitted = scopedFarmIds(req);
    const scoped = await sanitizeChatScope(
      { farmId: body.farmId ?? null, animalId: body.animalId ?? null }, permitted, getAnimalFarmId,
    );
    if (scoped.narrowed) {
      logger.warn({ userId: req.user?.userId, requested: { farmId: body.farmId, animalId: body.animalId } }, '[chat] 권한 밖 스코프 요청 정화');
    }
    const result = await handleChatMessage({
      question: sanitizeQuestion(body.question),
      userText: body.userText !== undefined ? sanitizeQuestion(body.userText) : undefined,
      role: req.user?.role as Role,
      farmId: scoped.farmId,
      animalId: scoped.animalId,
      userId: req.user?.userId,
      assignedFarmIds: req.user?.farmIds,
      isMaster: req.user?.isMaster,
      // 계정의 실제 권한 범위 — 장기기억 회상이 클라이언트가 보낸 farmId를 그대로 믿지 않게 한다
      permittedFarmIds: scopedFarmIds(req),
      conversationHistory: (body.conversationHistory ?? []).slice(-MAX_HISTORY_TURNS),
      dashboardContext: body.dashboardContext,
      uiLang: body.uiLang,
      images: body.images,
      documents: body.documents,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// VO-07: 처리 중 표시 최대 유지 시간 — 정상 종료 시 즉시 해제, 비정상 종료 대비 상한
const INFLIGHT_TTL_MS = 3 * 60 * 1000;

// SSE 스트리밍
chatRouter.post('/stream', validate({ body: chatMessageSchema }), async (req: Request, res: Response) => {
  const body = req.body as {
    question: string;
    userText?: string;
    farmId?: string;
    farmIds?: string[];
    animalId?: string;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    dashboardContext?: string;
    uiLang?: 'ko' | 'en' | 'uz' | 'ru' | 'mn';
    images?: Array<{ data: string; mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }>;
    documents?: Array<{ data: string; mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' | 'application/vnd.ms-excel' | 'text/csv'; filename?: string }>;
    clientRequestId?: string;
  };

  // VO-07: 같은 발화(clientRequestId)가 처리 중이면 두 번째는 실행하지 않는다
  const inflightKey = body.clientRequestId && req.user ? `${req.user.userId}:${body.clientRequestId}` : null;
  if (inflightKey && !(await claimInFlight(inflightKey, INFLIGHT_TTL_MS, getRedis()))) {
    res.status(409).json({ success: false, error: { code: 'DUPLICATE_REQUEST', message: '같은 질문을 이미 처리하고 있습니다.' } });
    return;
  }

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
  // AI-04: 응답을 끝내기 전에 클라이언트가 끊으면 서버의 Claude·도구 루프도 멈춘다
  // (예전: 계속 돌며 비용을 쓰고, 사용자가 취소한 답변을 대화로 저장·학습·기억 추출까지 했다)
  const abort = new AbortController();
  res.on('close', () => {
    clearInterval(keepAlive);
    if (!res.writableEnded) abort.abort();
    if (inflightKey) void releaseInFlight(inflightKey, getRedis());
  });

  // 클라이언트의 farmId/farmIds/animalId는 "요청"일 뿐 권한이 아니다.
  // 맥락(개체·농장 프로필, 농장 펄스, 보고서 데이터)을 만들기 전에 권한과 대조한다.
  // 대조 자체가 실패하면(DB 오류) 제한 사용자는 아무 스코프도 넘기지 않는다 — 실패 시 닫힘.
  const permitted = scopedFarmIds(req);
  const requestedScope = {
    farmId: body.farmId ?? null,
    farmIds: Array.isArray(body.farmIds) && body.farmIds.length > 0 ? body.farmIds : undefined,
    animalId: body.animalId ?? null,
  };
  const scoped = await sanitizeChatScope(requestedScope, permitted, getAnimalFarmId).catch((err: unknown) => {
    logger.error({ err }, '[chat] 스코프 대조 실패 — 제한 사용자는 스코프 없이 진행');
    return permitted === null
      ? { ...requestedScope, narrowed: false }
      : { farmId: null, farmIds: undefined, animalId: null, narrowed: true };
  });
  if (scoped.narrowed) {
    logger.warn({ userId: req.user?.userId, requested: requestedScope }, '[chat] 권한 밖 스코프 요청 정화');
  }

  const chatRequest = {
    question: sanitizeQuestion(body.question),
    userText: body.userText !== undefined ? sanitizeQuestion(body.userText) : undefined,
    role: req.user?.role as Role,
    farmId: scoped.farmId,
    farmIds: scoped.farmIds,
    animalId: scoped.animalId,
    userId: req.user?.userId,
    permittedFarmIds: permitted,
    // 권한은 JWT에서만 온다. body.farmId는 "요청"일 뿐 권한이 아니다 —
    // 예전에는 이 구분이 없어 남의 farmId를 넣으면 그 농장 데이터가 나왔다.
    assignedFarmIds: req.user?.farmIds,
    isMaster: req.user?.isMaster,
    conversationHistory: (body.conversationHistory ?? []).slice(-MAX_HISTORY_TURNS),
    dashboardContext: body.dashboardContext,
    uiLang: body.uiLang,
    images: body.images,
    documents: body.documents,
    signal: abort.signal,
  };

  try {
    // API 키 없으면 데이터 기반 fallback 응답 생성
    if (!isClaudeAvailable()) {
      let fallbackText: string;
      try {
        const { context } = await resolveContext(
          chatRequest.question, chatRequest.farmId, chatRequest.animalId, chatRequest.role, chatRequest.dashboardContext,
          chatRequest.permittedFarmIds,
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
        // AI-07: 근거에서 확인되지 않은 개체번호·체온 — 화면이 답변 아래에 표시한다
        onVerification: (unverified) => {
          res.write(`data: ${JSON.stringify({ type: 'verification', content: '', unverified })}\n\n`);
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

// 대화 이력 — chat_conversations 기반 (기기·세션을 넘는 장기 기억)
// ?limit=50&farmId=...&animalId=... 필터 지원. 본인 대화만 조회 가능.
chatRouter.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const farmId = typeof req.query.farmId === 'string' && req.query.farmId ? req.query.farmId : null;
    const animalId = typeof req.query.animalId === 'string' && req.query.animalId ? req.query.animalId : null;

    const db = getDb();
    const conditions = [eq(chatConversations.userId, userId)];
    if (farmId) conditions.push(eq(chatConversations.farmId, farmId));
    if (animalId) conditions.push(eq(chatConversations.animalId, animalId));

    const rows = await db
      .select({
        id: chatConversations.id,
        question: chatConversations.question,
        answer: chatConversations.answer,
        contextType: chatConversations.contextType,
        animalId: chatConversations.animalId,
        farmId: chatConversations.farmId,
        createdAt: chatConversations.createdAt,
      })
      .from(chatConversations)
      .where(and(...conditions))
      .orderBy(desc(chatConversations.createdAt))
      .limit(limit);

    // 시간 오름차순(대화 흐름 순서)으로 반환
    res.json({ success: true, data: rows.reverse() });
  } catch (error) {
    next(error);
  }
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
