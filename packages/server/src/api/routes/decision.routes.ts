// Daily Decision Queue 라우트 — "오늘 무엇을 해야 하는가"
// GET /decision/queue?farmId=&limit= | POST /decision/actions | POST /decision/actions/undo
// (undo가 DELETE /:cardId가 아닌 이유: cardId에 ':'와 ISO 시각이 포함돼 경로 인코딩이 취약)

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { scopedFarmIds, resolveScopedFarmIds } from '../middleware/rbac.js';
import { getDecisionQueue } from '../../services/decision/decision-queue.service.js';
import {
  completeDecisionCard,
  undoDecisionCard,
  getCompletedCardIds,
  countCompletedActions,
} from '../../services/decision/decision-action.service.js';
import type { CompleteDecisionInput } from '@cowtalk/shared';

export const decisionRouter = Router();

decisionRouter.use(authenticate);

decisionRouter.get('/queue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedFarmId = typeof req.query.farmId === 'string' && req.query.farmId ? [req.query.farmId] : [];
    // JWT farmIds 기준 강제 스코핑 — 소속 농장 밖 데이터 열람 차단
    const effective = resolveScopedFarmIds(requestedFarmId, scopedFarmIds(req));
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 10) : 5;

    const data = await getDecisionQueue({
      farmIdsScope: effective.length > 0 ? effective : undefined,
      role: req.user?.role,
      limit,
    });

    // 완료 상태 주석 (DB 기반 — 기기·사용자 간 공유) + 최근 7일 완결 지표
    const [doneIds, completedLast7d] = await Promise.all([
      getCompletedCardIds(data.cards.map((c) => c.id)),
      countCompletedActions(effective.length > 0 ? effective : null, 7),
    ]);
    const annotated = {
      ...data,
      cards: data.cards.map((c) => ({ ...c, done: doneIds.has(c.id) })),
      completedLast7d,
    };

    res.json({ success: true, data: annotated });
  } catch (error) {
    next(error);
  }
});

// POST /decision/actions — 카드 완료 처리 (카드 스냅샷 저장)
decisionRouter.post('/actions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Partial<CompleteDecisionInput>;
    if (!body.cardId || !body.source || !body.severity || !body.title) {
      res.status(400).json({ success: false, error: 'cardId, source, severity, title이 필요합니다' });
      return;
    }
    // 스코프 실링: 배정 농장이 있으면 그 밖의 farmId 카드 완료 금지
    const scope = scopedFarmIds(req);
    if (scope !== null && body.farmId && !scope.includes(body.farmId)) {
      res.status(403).json({ success: false, error: '소속 농장의 결정만 완료 처리할 수 있습니다' });
      return;
    }
    const result = await completeDecisionCard(body as CompleteDecisionInput, req.user?.userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /decision/actions/undo — 완료 취소 (토글)
decisionRouter.post('/actions/undo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cardId } = req.body as { cardId?: string };
    if (!cardId) {
      res.status(400).json({ success: false, error: 'cardId가 필요합니다' });
      return;
    }
    const result = await undoDecisionCard(cardId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
