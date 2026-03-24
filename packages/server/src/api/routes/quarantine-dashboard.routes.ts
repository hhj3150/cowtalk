// 방역관 전용 API
// GET  /quarantine/dashboard          — 대시보드 종합 데이터
// GET  /quarantine/action-queue       — 당일 업무 큐
// PATCH /quarantine/action/:id        — 업무 상태 변경
// GET  /quarantine/early-detection-metrics — 조기감지 성과
// GET  /quarantine/national-situation — 전국 방역 현황
// GET  /quarantine/national-situation/:province — 시도 드릴다운 (시군구)
// GET  /quarantine/province-farms/:province     — 시도 농장 목록 드릴다운

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { getQuarantineDashboard, getActionQueue } from '../../services/epidemiology/quarantine-dashboard.service.js';
import { getEarlyDetectionMetrics } from '../../services/epidemiology/early-detection-metrics.service.js';
import { getNationalSituation, getProvinceDetail, getProvinceFarms } from '../../services/epidemiology/national-situation.service.js';
import { logger } from '../../lib/logger.js';

export const quarantineDashboardRouter = Router();

quarantineDashboardRouter.use(authenticate);

// ===========================
// GET /quarantine/dashboard
// ===========================

quarantineDashboardRouter.get('/dashboard', async (_req, res, next) => {
  try {
    const data = await getQuarantineDashboard();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/action-queue
// ===========================

quarantineDashboardRouter.get('/action-queue', async (_req, res, next) => {
  try {
    const queue = await getActionQueue();
    res.json({ success: true, data: queue });
  } catch (err) {
    next(err);
  }
});

// ===========================
// PATCH /quarantine/action/:id
// ===========================

const actionPatchSchema = z.object({
  status: z.enum(['pending', 'dispatched', 'phone_confirmed', 'monitoring', 'completed']),
});

quarantineDashboardRouter.patch('/action/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = actionPatchSchema.parse(req.body);

    // 실제 구현: alerts 테이블 상태 업데이트
    // 데모: 응답만 반환
    logger.info({ id, status: body.status }, '[Quarantine] 업무 상태 변경');

    res.json({ success: true, data: { actionId: id, status: body.status } });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/early-detection-metrics
// ===========================

quarantineDashboardRouter.get('/early-detection-metrics', async (_req, res, next) => {
  try {
    const data = await getEarlyDetectionMetrics();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/national-situation
// ===========================

quarantineDashboardRouter.get('/national-situation', async (_req, res, next) => {
  try {
    const data = await getNationalSituation();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/national-situation/:province
// ===========================

quarantineDashboardRouter.get('/national-situation/:province', async (req, res, next) => {
  try {
    const province = decodeURIComponent(req.params.province ?? '');
    if (!province) {
      res.status(400).json({ success: false, error: 'province required' });
      return;
    }
    const data = await getProvinceDetail(province);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /quarantine/province-farms/:province
// ===========================

quarantineDashboardRouter.get('/province-farms/:province', async (req, res, next) => {
  try {
    const province = decodeURIComponent(req.params.province ?? '');
    if (!province) {
      res.status(400).json({ success: false, error: 'province required' });
      return;
    }
    const data = await getProvinceFarms(province);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});
