// 방역조치 API
// POST   /quarantine-action           — 조치 생성
// GET    /quarantine-action/list       — 조치 목록 (필터)
// GET    /quarantine-action/:id        — 조치 상세
// PATCH  /quarantine-action/:id        — 상태 변경

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import {
  createQuarantineAction,
  getQuarantineAction,
  listQuarantineActions,
  updateQuarantineAction,
} from '../../services/epidemiology/quarantine-action.service.js';
import { logger } from '../../lib/logger.js';

export const quarantineActionRouter = Router();

quarantineActionRouter.use(authenticate);

// ===========================
// POST /quarantine-action — 조치 생성
// ===========================

const createSchema = z.object({
  farmId: z.string().uuid(),
  investigationId: z.string().uuid().optional(),
  clusterId: z.string().uuid().optional(),
  actionType: z.enum(['isolation', 'movement_restriction', 'disinfection', 'vaccination', 'culling', 'monitoring']),
  description: z.string().min(1),
  assignedTo: z.string().uuid().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

quarantineActionRouter.post('/', async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    logger.info({ farmId: input.farmId, actionType: input.actionType }, '[QuarantineAction] 생성 요청');

    const data = await createQuarantineAction({
      ...input,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine-action/list — 목록 조회
// ===========================

const listSchema = z.object({
  farmId: z.string().uuid().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  actionType: z.enum(['isolation', 'movement_restriction', 'disinfection', 'vaccination', 'culling', 'monitoring']).optional(),
  since: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

quarantineActionRouter.get('/list', async (req, res, next) => {
  try {
    const filters = listSchema.parse(req.query);
    const data = await listQuarantineActions(filters);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine-action/:id — 상세 조회
// ===========================

quarantineActionRouter.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    const data = await getQuarantineAction(id);

    if (!data) {
      res.status(404).json({ success: false, error: '방역조치를 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// PATCH /quarantine-action/:id — 상태 변경
// ===========================

const patchSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  notes: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
});

quarantineActionRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    const patch = patchSchema.parse(req.body);

    const data = await updateQuarantineAction(id, patch);

    if (!data) {
      res.status(404).json({ success: false, error: '방역조치를 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});
