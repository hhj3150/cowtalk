// KAHIS 보고서 API
// POST   /kahis-report                              — 보고서 생성
// GET    /kahis-report/list                          — 보고서 목록 (필터)
// GET    /kahis-report/investigation/:investigationId — 조사별 보고서
// GET    /kahis-report/:id                           — 보고서 상세
// PATCH  /kahis-report/:id                           — 상태 변경

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import {
  createKahisReport,
  getKahisReport,
  listKahisReports,
  updateKahisReport,
  getReportsByInvestigation,
} from '../../services/epidemiology/kahis-report.service.js';
import { logger } from '../../lib/logger.js';

export const kahisReportRouter = Router();

kahisReportRouter.use(authenticate);

// ===========================
// POST /kahis-report — 보고서 생성
// ===========================

const createSchema = z.object({
  investigationId: z.string().uuid(),
  reportType: z.enum(['initial', 'followup', 'final', 'negative']),
  diseaseCode: z.string().min(1).max(10),
  diseaseName: z.string().min(1).max(100),
  reportData: z.record(z.unknown()).optional(),
  submittedBy: z.string().uuid().optional(),
});

kahisReportRouter.post('/', async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    logger.info({ investigationId: input.investigationId, reportType: input.reportType }, '[KahisReport] 생성 요청');

    const data = await createKahisReport(input);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /kahis-report/list — 목록 조회
// ===========================

const listSchema = z.object({
  investigationId: z.string().uuid().optional(),
  status: z.enum(['draft', 'submitted', 'accepted', 'rejected', 'revision_required']).optional(),
  reportType: z.enum(['initial', 'followup', 'final', 'negative']).optional(),
  since: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

kahisReportRouter.get('/list', async (req, res, next) => {
  try {
    const filters = listSchema.parse(req.query);
    const data = await listKahisReports(filters);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /kahis-report/investigation/:investigationId — 조사별 보고서
// ===========================

kahisReportRouter.get('/investigation/:investigationId', async (req, res, next) => {
  try {
    const { investigationId } = req.params;
    const data = await getReportsByInvestigation(investigationId ?? '');
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /kahis-report/:id — 상세 조회
// ===========================

kahisReportRouter.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    const data = await getKahisReport(id);

    if (!data) {
      res.status(404).json({ success: false, error: 'KAHIS 보고서를 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// PATCH /kahis-report/:id — 상태 변경
// ===========================

const patchSchema = z.object({
  status: z.enum(['draft', 'submitted', 'accepted', 'rejected', 'revision_required']).optional(),
  reportData: z.record(z.unknown()).optional(),
});

kahisReportRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id ?? '';
    const patch = patchSchema.parse(req.body);

    const data = await updateKahisReport(id, patch);

    if (!data) {
      res.status(404).json({ success: false, error: 'KAHIS 보고서를 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});
