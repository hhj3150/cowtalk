// Daily Decision Queue 라우트 — "오늘 무엇을 해야 하는가"
// GET /decision/queue?farmId=&limit=

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { scopedFarmIds, resolveScopedFarmIds } from '../middleware/rbac.js';
import { getDecisionQueue } from '../../services/decision/decision-queue.service.js';

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

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
