// 행동 일별 지표 라우트 — 우군·그룹 단위 휴식(횡와)·기립·이동·반추 자세
// GET /behavior/daily?farmId=&days=30 | POST /behavior/daily { farmId, source?, rows }

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { BadRequestError, ForbiddenError } from '../../lib/errors.js';
import { validateBehaviorRows } from '@cowtalk/shared';
import { listBehaviorDaily, upsertBehaviorRows } from '../../services/behavior/behavior-daily.service.js';

export const behaviorRouter = Router();
behaviorRouter.use(authenticate);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 사용자가 직접 올릴 수 있는 출처 — 센서 API 출처는 수집 어댑터 전용 */
const USER_SOURCES: ReadonlySet<string> = new Set(['csv_upload', 'manual']);

/** 쓰기 권한: 마스터·행정관리자, 또는 그 목장에 배정된 농장주/수의사 */
function assertWriteAccess(req: Request, farmId: string): void {
  const user = req.user!;
  if (user.isMaster || user.role === 'government_admin') return;
  if (user.role !== 'farmer' && user.role !== 'veterinarian') {
    throw new ForbiddenError('행동 지표 입력 권한이 없습니다');
  }
  if (!(user.farmIds ?? []).includes(farmId)) throw new ForbiddenError('접근 권한이 없는 농장입니다');
}

behaviorRouter.get('/daily', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = typeof req.query.farmId === 'string' ? req.query.farmId : '';
    if (!UUID_RE.test(farmId)) throw new BadRequestError('farmId가 필요합니다');
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const records = await listBehaviorDaily(farmId, days);
    res.json({ success: true, data: { farmId, days, records } });
  } catch (error) {
    next(error);
  }
});

behaviorRouter.post('/daily', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = (req.body ?? {}) as { farmId?: unknown; source?: unknown; rows?: unknown };
    const farmId = typeof b.farmId === 'string' ? b.farmId : '';
    if (!UUID_RE.test(farmId)) throw new BadRequestError('farmId가 필요합니다');
    assertWriteAccess(req, farmId);
    const source = typeof b.source === 'string' ? b.source : 'csv_upload';
    if (!USER_SOURCES.has(source)) throw new BadRequestError(`허용되지 않는 출처: ${source}`);
    const verdict = validateBehaviorRows(b.rows);
    if (!verdict.ok) throw new BadRequestError(verdict.reason);
    const result = await upsertBehaviorRows(farmId, verdict.rows, source, req.user!.userId);
    res.json({ success: true, data: { farmId, source, ...result } });
  } catch (error) {
    next(error);
  }
});
