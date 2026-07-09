// 도구 승인 라우트 — 수의사·행정관이 대기 요청을 검토/승인/거절
// GET /approvals?status=pending | POST /approvals/:id/approve | POST /approvals/:id/reject

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { scopedFarmIds } from '../middleware/rbac.js';
import {
  listApprovalRequests,
  approveAndExecute,
  rejectApproval,
  countPendingApprovals,
} from '../../services/approval/tool-approval.service.js';

export const approvalRouter = Router();

approvalRouter.use(authenticate);

const canDecide = requireRole('veterinarian', 'government_admin');

// GET /approvals?status=pending — 승인 요청 목록 (수의사: 담당 농장 스코프)
approvalRouter.get('/', canDecide, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const scope = scopedFarmIds(req);
    const requests = await listApprovalRequests({ status, farmIdsScope: scope });
    res.json({ success: true, data: { requests } });
  } catch (error) {
    next(error);
  }
});

// GET /approvals/pending-count — 대기 건수 (뱃지)
approvalRouter.get('/pending-count', canDecide, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const scope = scopedFarmIds(req);
    const count = await countPendingApprovals(scope);
    res.json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
});

// POST /approvals/:id/approve — 승인 + 즉시 실행 (승인자 컨텍스트로 게이트웨이 재통과)
approvalRouter.post('/:id/approve', canDecide, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { note } = (req.body ?? {}) as { note?: string };
    const result = await approveAndExecute({
      approvalId: req.params.id as string,
      approverId: req.user!.userId,
      approverRole: req.user!.role,
      decisionNote: note,
    });
    res.status(result.error ? 409 : 200).json({ success: result.success, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /approvals/:id/reject — 거절 (사유 기록)
approvalRouter.post('/:id/reject', canDecide, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { note } = (req.body ?? {}) as { note?: string };
    const result = await rejectApproval({
      approvalId: req.params.id as string,
      approverId: req.user!.userId,
      decisionNote: note,
    });
    res.status(result.error ? 409 : 200).json({ success: result.success, data: result });
  } catch (error) {
    next(error);
  }
});
