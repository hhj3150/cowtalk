// 관리 케이스 API — 감지→배정→현장확인→조치→재확인→종료
//
// GET    /cases                  — 목록 (스코프 + 필터 + 플래그)
// GET    /cases/summary          — 상단 요약 (조치 필요·미배정·기한초과·재확인누락)
// GET    /cases/:caseId          — 상세 (배정 이력 + 단계 기록 전체)
// POST   /cases                  — 케이스 생성 (결정 카드 승격 포함)
// POST   /cases/:caseId/assign   — 담당자 배정·위임
// POST   /cases/:caseId/events   — 현장확인·조치·재확인·메모·재개 기록
// POST   /cases/:caseId/close    — 종료 (결과 필수)
//
// 권한 원칙: 조회는 배정 스코프(scopedFarmIds)로 서버에서 필터링하고,
// **쓰기는 그 농장에 배정된 계정 + 마스터만** 허용한다.
// 전국 조회 권한(행정관·방역관)이 남의 목장 케이스를 배정하거나 종료할 수 없어야 한다.

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { scopedFarmIds } from '../middleware/rbac.js';
import {
  appendCaseEvent,
  assignCase,
  closeCase,
  countCasesByFlag,
  createCase,
  getCaseDetail,
  listCases,
  loadCaseOrThrow,
  summarizeOpenCases,
} from '../../services/case/case.service.js';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export const caseRouter = Router();

caseRouter.use(authenticate);

/** Express 5 의 params 는 string | string[] 이라 좁혀서 쓴다 */
function pathParam(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

/**
 * 쓰기 권한 — 그 농장에 **배정된** 계정 또는 마스터.
 * 조회 스코프(scopedFarmIds)와 분리한 이유: 전국 조회 권한을 가진 역할이
 * 남의 목장 케이스의 담당자를 바꾸거나 종료 처리할 수 있으면 안 되기 때문이다.
 */
function canManageFarmCases(req: Request, farmId: string): boolean {
  if (!req.user) return false;
  if (req.user.isMaster) return true;
  return (req.user.farmIds ?? []).includes(farmId);
}

/** 쓰기 진입점 공통 — 케이스를 찾고 권한을 확인한 뒤 farmId를 돌려준다 */
async function assertWritable(req: Request, caseId: string): Promise<void> {
  const target = await loadCaseOrThrow(caseId);
  if (!canManageFarmCases(req, target.farmId)) {
    throw new ForbiddenError('이 목장의 케이스를 변경할 권한이 없습니다');
  }
}

// ======================================================================
// 조회
// ======================================================================

const listSchema = z.object({
  farmId: z.string().uuid().optional(),
  animalId: z.string().uuid().optional(),
  status: z
    .enum(['detected', 'assigned', 'field_checked', 'treated', 'rechecking', 'closed'])
    .optional(),
  openOnly: z.enum(['true', 'false']).optional(),
  assigneeId: z.string().uuid().optional(),
  flag: z.enum(['unassigned', 'overdue', 'worsened', 'recheck_missing']).optional(),
  since: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(300).optional(),
});

caseRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = listSchema.parse(req.query);
    const scope = scopedFarmIds(req);

    // 스코프 밖 농장을 콕 집어 요청하면 빈 결과가 아니라 거부 — 존재 여부도 알려주지 않는다
    if (q.farmId && scope !== null && !scope.includes(q.farmId)) {
      throw new ForbiddenError('접근 권한이 없는 농장입니다');
    }

    const data = await listCases(
      {
        farmId: q.farmId,
        animalId: q.animalId,
        status: q.status,
        openOnly: q.openOnly === 'true',
        assigneeId: q.assigneeId,
        flag: q.flag,
        since: q.since,
        limit: q.limit,
      },
      scope,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

caseRouter.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = typeof req.query.farmId === 'string' ? req.query.farmId : undefined;
    const scope = scopedFarmIds(req);
    if (farmId && scope !== null && !scope.includes(farmId)) {
      throw new ForbiddenError('접근 권한이 없는 농장입니다');
    }
    const [summary, flagCounts] = await Promise.all([
      summarizeOpenCases(scope, farmId),
      countCasesByFlag(scope),
    ]);
    res.json({ success: true, data: { ...summary, flagCounts } });
  } catch (err) {
    next(err);
  }
});

caseRouter.get('/:caseId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const caseId = pathParam(req, 'caseId');
    const data = await getCaseDetail(caseId, scopedFarmIds(req));
    if (!data) {
      throw new NotFoundError('케이스를 찾을 수 없습니다');
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ======================================================================
// 생성
// ======================================================================

const createSchema = z.object({
  farmId: z.string().uuid(),
  animalId: z.string().uuid().optional(),
  source: z
    .enum(['decision_card', 'sovereign_alarm', 'smaxtec_event', 'breeding', 'manual'])
    .default('manual'),
  sourceRef: z.string().max(200).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string().min(1).max(300),
  detectedSignals: z.array(z.string().max(200)).max(20).optional(),
  detectedAt: z.string().optional(),
  assigneeId: z.string().uuid().optional(),
  dueAt: z.string().optional(),
  notes: z.string().max(4000).optional(),
});

caseRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSchema.parse(req.body);
    if (!canManageFarmCases(req, input.farmId)) {
      throw new ForbiddenError('이 목장의 케이스를 생성할 권한이 없습니다');
    }
    const data = await createCase(input, req.user?.userId ?? null);
    logger.info({ caseId: data.caseId, farmId: input.farmId }, '[Case] 생성');
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ======================================================================
// 배정
// ======================================================================

const assignSchema = z.object({
  assigneeId: z.string().uuid(),
  supportIds: z.array(z.string().uuid()).max(10).optional(),
  dueAt: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

caseRouter.post('/:caseId/assign', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const caseId = pathParam(req, 'caseId');
    await assertWritable(req, caseId);
    const input = assignSchema.parse(req.body);
    const data = await assignCase(caseId, input, req.user?.userId ?? null);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ======================================================================
// 단계 기록
// ======================================================================

const eventSchema = z.object({
  eventType: z.enum(['field_check', 'treatment', 'recheck', 'note', 'reopened']),
  occurredAt: z.string().optional(),
  notes: z.string().max(4000).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

caseRouter.post('/:caseId/events', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const caseId = pathParam(req, 'caseId');
    await assertWritable(req, caseId);
    const input = eventSchema.parse(req.body);
    const data = await appendCaseEvent(caseId, input, req.user?.userId ?? null);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ======================================================================
// 종료
// ======================================================================

const closeSchema = z.object({
  outcome: z.enum(['improved', 'ongoing', 'worsened', 'other_cause', 'undetermined']),
  notes: z.string().max(4000).optional(),
  snapshot: z.record(z.string(), z.unknown()).optional(),
});

caseRouter.post('/:caseId/close', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const caseId = pathParam(req, 'caseId');
    await assertWritable(req, caseId);
    const input = closeSchema.parse(req.body);
    const data = await closeCase(caseId, input, req.user?.userId ?? null);
    logger.info({ caseId, outcome: input.outcome }, '[Case] 종료');
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});
