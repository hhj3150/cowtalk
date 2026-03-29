// 역학 조사 API
// POST  /investigation/start/:farmId   — 조사 ��작 (6항목 자동 수집 → DB 저장)
// GET   /investigation/:id             — 조사 상세 조회
// PATCH /investigation/:id             — 현장 소견 + 상태 변경
// GET   /investigation/farm/:farmId    — 농장별 조사 이력
// GET   /investigation/list            — 전체 조사 목록 (필터)

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import {
  startInvestigation,
  getInvestigation,
  updateInvestigation,
  listFarmInvestigations,
  listInvestigations,
} from '../../services/epidemiology/investigation.service.js';
import { logger } from '../../lib/logger.js';

export const investigationRouter = Router();

investigationRouter.use(authenticate);

// ===========================
// GET /investigation/list — 전체 조사 목록
// (/:id 보다 위에 배치해야 'list'가 UUID로 파싱되지 않음)
// ===========================

const listQuerySchema = z.object({
  status: z.enum(['draft', 'pending_submit', 'kahis_submitted', 'closed']).optional(),
  since: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

investigationRouter.get('/list', async (req, res, next) => {
  try {
    const filters = listQuerySchema.parse(req.query);
    const data = await listInvestigations(filters);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /investigation/farm/:farmId — 농장별 조사 이력
// ===========================

investigationRouter.get('/farm/:farmId', requireFarmAccess, async (req, res, next) => {
  try {
    const farmId = z.string().uuid().parse(req.params.farmId);
    const data = await listFarmInvestigations(farmId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// POST /investigation/start/:farmId
// ===========================

investigationRouter.post('/start/:farmId', requireFarmAccess, async (req, res, next) => {
  try {
    const farmId = z.string().uuid().parse(req.params.farmId);
    logger.info({ farmId }, '[Investigation] 역학 조�� 시작 요청');

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
    const data = await getInvestigation(id);

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
  status: z.enum(['draft', 'pending_submit', 'kahis_submitted', 'closed']).optional(),
});

investigationRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    const patch = patchSchema.parse(req.body);

    const data = await updateInvestigation(id, patch);

    if (!data) {
      res.status(404).json({ success: false, error: '역학 조사 ���록을 찾을 수 ���습니다' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});
