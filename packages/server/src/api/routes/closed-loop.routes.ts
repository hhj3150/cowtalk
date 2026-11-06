// 폐루프 건강관리 라우트 — 감지 → 개입 → 센서 검증 → 수의사 확정 현황
// 스코프: requireFarmAccess (배정 농장만). 검증 배치 수동 실행은 관리자 전용.

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess, requireRole } from '../middleware/rbac.js';
import { CLOSED_LOOP_PROTOCOLS, GENERAL_PROTOCOL, summarizeProtocol } from '../../services/closed-loop/closed-loop-protocols.js';
import { getFarmClosedLoopStatus, runClosedLoopVerification } from '../../services/closed-loop/closed-loop.service.js';

export const closedLoopRouter = Router();
closedLoopRouter.use(authenticate);

// GET /closed-loop/protocols — 질환별 개입 후보 + 검증 기준 (투명성)
closedLoopRouter.get('/protocols', (_req: Request, res: Response) => {
  res.json({ success: true, data: [...CLOSED_LOOP_PROTOCOLS, GENERAL_PROTOCOL].map(summarizeProtocol) });
});

const daysSchema = z.coerce.number().int().min(1).max(60).default(14);

// GET /closed-loop/farm/:farmId?days=14 — 목장 폐루프 현황
closedLoopRouter.get('/farm/:farmId', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = z.string().uuid().parse(req.params.farmId);
    const days = daysSchema.parse(req.query.days ?? undefined);
    const data = await getFarmClosedLoopStatus(farmId, days);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /closed-loop/verify — 검증 배치 수동 실행 (관리자)
closedLoopRouter.post('/verify', requireRole('government_admin'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await runClosedLoopVerification();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});
