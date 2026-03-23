// 역학 조사 API
// POST /investigation/start/:farmId   — 조사 시작 (6항목 자동 수집)
// GET  /investigation/:id             — 조사 상세 조회
// PATCH /investigation/:id            — 현장 소견 + 상태 변경

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import {
  startInvestigation,
  getInvestigation,
  updateInvestigation,
} from '../../services/epidemiology/investigation.service.js';
import { logger } from '../../lib/logger.js';

export const investigationRouter = Router();

investigationRouter.use(authenticate);

// ===========================
// POST /investigation/start/:farmId
// ===========================

investigationRouter.post('/start/:farmId', requireFarmAccess, async (req, res, next) => {
  try {
    const farmId = z.string().uuid().parse(req.params.farmId);
    logger.info({ farmId }, '[Investigation] 역학 조사 시작 요청');

    const data = await startInvestigation(farmId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /investigation/:id
// ===========================

investigationRouter.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    const data = getInvestigation(id);

    if (!data) {
      res.status(404).json({ success: false, error: '역학 조사 기록을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// PATCH /investigation/:id
// ===========================

const patchSchema = z.object({
  fieldObservations: z.string().optional(),
  status: z.enum(['draft', 'pending_submit', 'kahis_submitted']).optional(),
});

investigationRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    const patch = patchSchema.parse(req.body);

    const data = updateInvestigation(id, patch);

    if (!data) {
      res.status(404).json({ success: false, error: '역학 조사 기록을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});
