// 도구 승인 라우트 — 수의사·행정관이 대기 요청을 검토/승인/거절
// GET /approvals?status=pending | POST /approvals/:id/approve | POST /approvals/:id/reject

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { scopedFarmIds, NO_FARM_SENTINEL } from '../middleware/rbac.js';
import { eq } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { toolApprovalRequests } from '../../db/schema.js';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import {
  listApprovalRequests,
  approveAndExecute,
  rejectApproval,
  countPendingApprovals,
} from '../../services/approval/tool-approval.service.js';

export const approvalRouter = Router();

approvalRouter.use(authenticate);

const canDecide = requireRole('veterinarian', 'government_admin');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 승인자가 요청의 농장에 대한 권한이 있는지 — 역할만 보면 A목장 담당 수의사가
 * 요청 id만 알면 B목장 처방을 승인할 수 있다. 농장 없는 요청은 무제한 스코프만 결정한다.
 */
async function requireApprovalScope(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const approvalId = req.params.id as string;
    if (!UUID_RE.test(approvalId)) throw new NotFoundError('승인 요청을 찾을 수 없습니다');
    const rows = await getDb()
      .select({ farmId: toolApprovalRequests.farmId })
      .from(toolApprovalRequests)
      .where(eq(toolApprovalRequests.approvalId, approvalId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError('승인 요청을 찾을 수 없습니다');

    const scope = scopedFarmIds(req);
    if (scope === null) { next(); return; }
    if (!row.farmId || (scope.length === 1 && scope[0] === NO_FARM_SENTINEL) || !scope.includes(row.farmId)) {
      throw new ForbiddenError('담당하지 않는 목장의 승인 요청입니다');
    }
    next();
  } catch (err) {
    next(err);
  }
}

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
approvalRouter.post('/:id/approve', canDecide, requireApprovalScope, async (req: Request, res: Response, next: NextFunction) => {
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
approvalRouter.post('/:id/reject', canDecide, requireApprovalScope, async (req: Request, res: Response, next: NextFunction) => {
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
