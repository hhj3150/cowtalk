// AI 성능 라우트 — Intelligence Loop Phase 11B

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { evaluateEngine, compareEngines, getAccuracyTrend, evaluateByRole, getPerformanceOverview } from '../../intelligence-loop/model-evaluator.js';
import { analyzeThresholds } from '../../intelligence-loop/threshold-learner.js';
import { getRecommendationAccuracy } from '../../services/breeding/recommendation-tracking.service.js';
import { getDb } from '../../config/database.js';
import { farms, promptGuidances } from '../../db/schema.js';
import { desc, eq } from 'drizzle-orm';

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

// GET /ai/performance/recommendation-accuracy — 정액 추천 정확도 (채택률 + 수태율 lift)
aiPerformanceRouter.get('/performance/recommendation-accuracy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.query.farmId as string | undefined;
    const data = await getRecommendationAccuracy(farmId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /ai/prompt-guidances — 프롬프트 개선 루프가 생성한 자기보정 가이던스 목록
aiPerformanceRouter.get('/prompt-guidances', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const activeOnly = req.query.all !== 'true';
    const rows = await db
      .select({
        guidanceId: promptGuidances.guidanceId,
        farmId: promptGuidances.farmId,
        farmName: farms.name,
        alarmType: promptGuidances.alarmType,
        guidanceText: promptGuidances.guidanceText,
        sourceStats: promptGuidances.sourceStats,
        active: promptGuidances.active,
        updatedAt: promptGuidances.updatedAt,
      })
      .from(promptGuidances)
      .leftJoin(farms, eq(promptGuidances.farmId, farms.farmId))
      .where(activeOnly ? eq(promptGuidances.active, true) : undefined)
      .orderBy(desc(promptGuidances.updatedAt))
      .limit(200);
    res.json({ success: true, data: rows });
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

    // 임계값 승인 영속화 — model_registry에 새 버전 승격 (이전 활성 버전은 비활성화)
    const { getDb } = await import('../../config/database.js');
    const { modelRegistry } = await import('../../db/schema.js');
    const { eq, and } = await import('drizzle-orm');
    const db = getDb();
    const approvedAt = new Date();
    const version = `threshold-${approvedAt.toISOString().replace(/[-:T]/g, '').slice(0, 12)}`;

    const [promoted] = await db.transaction(async (tx) => {
      await tx
        .update(modelRegistry)
        .set({ isActive: false })
        .where(and(eq(modelRegistry.engineType, String(engineType)), eq(modelRegistry.isActive, true)));
      return tx
        .insert(modelRegistry)
        .values({
          engineType: String(engineType),
          modelType: 'rule_based',
          version,
          isActive: true,
          metrics: {
            kind: 'threshold_approval',
            newThreshold,
            reason: reason ?? 'Admin approved',
            approvedBy: req.user!.userId,
            approvedAt: approvedAt.toISOString(),
          },
        })
        .returning({ modelId: modelRegistry.modelId, version: modelRegistry.version });
    });

    res.json({
      success: true,
      data: {
        engineType,
        newThreshold,
        reason: reason ?? 'Admin approved',
        approvedBy: req.user!.userId,
        approvedAt: approvedAt.toISOString(),
        promotedVersion: promoted?.version ?? version,
        modelId: promoted?.modelId,
      },
    });
  } catch (error) {
    next(error);
  }
});
