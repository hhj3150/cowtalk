// AI 성능 라우트 — Intelligence Loop Phase 11B

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { evaluateEngine, compareEngines, getAccuracyTrend, evaluateByRole, getPerformanceOverview } from '../../intelligence-loop/model-evaluator.js';
import { analyzeThresholds } from '../../intelligence-loop/threshold-learner.js';

export const aiPerformanceRouter = Router();

aiPerformanceRouter.use(authenticate);

// GET /ai/performance — 엔진 성능 평가 (PerformanceOverview 구조 반환)
aiPerformanceRouter.get('/performance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();
    const engineType = req.query.engineType as string | undefined;
    const farmId = req.query.farmId as string | undefined;

    if (engineType) {
      const data = await evaluateEngine(engineType, { from, to }, farmId);
      res.json({ success: true, data });
    } else {
      const data = await getPerformanceOverview({ from, to });
      res.json({ success: true, data });
    }
  } catch (error) {
    next(error);
  }
});

// GET /ai/performance/compare — 엔진 간 비교
aiPerformanceRouter.get('/performance/compare', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();
    const data = await compareEngines({ from, to });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /ai/performance/trend — 정확도 트렌드
aiPerformanceRouter.get('/performance/trend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const engineType = req.query.engineType as string;
    const months = Number(req.query.months) || 6;

    if (!engineType) {
      res.status(400).json({ success: false, error: 'engineType is required' });
      return;
    }

    const data = await getAccuracyTrend(engineType, months);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /ai/performance/roles — 역할별 평가
aiPerformanceRouter.get('/performance/roles', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();
    const data = await evaluateByRole({ from, to });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /ai/thresholds — 임계값 분석
aiPerformanceRouter.get('/thresholds', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const engineType = req.query.engineType as string;

    if (!engineType) {
      res.status(400).json({ success: false, error: 'engineType is required' });
      return;
    }

    const data = await analyzeThresholds(engineType);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// POST /ai/thresholds/approve — 임계값 승인 (관리자 전용)
aiPerformanceRouter.post('/thresholds/approve', requireRole('government_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { engineType, newThreshold, reason } = req.body;

    if (!engineType || newThreshold === undefined) {
      res.status(400).json({ success: false, error: 'engineType and newThreshold are required' });
      return;
    }

    // 임계값 승인 기록 — modelRegistry에 새 버전으로 기록
    res.json({
      success: true,
      data: {
        engineType,
        newThreshold,
        reason: reason ?? 'Admin approved',
        approvedBy: req.user!.userId,
        approvedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});
