// 피드백 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { createFeedbackSchema, paginationSchema } from '@cowtalk/shared';
import { getDb } from '../../config/database.js';
import { feedback } from '../../db/schema.js';
import { desc, count } from 'drizzle-orm';
import { getFeedbackByAnimal } from '../../intelligence-loop/feedback-collector.js';
import { getFeedbackStats } from '../../intelligence-loop/feedback-collector.js';
import { getUnmatchedPredictions, recordOutcome } from '../../intelligence-loop/outcome-recorder.js';

export const feedbackRouter = Router();

feedbackRouter.use(authenticate);

// GET /feedback — 피드백 목록
feedbackRouter.get('/', requirePermission('feedback', 'read'), validate({ query: paginationSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const feedbackList = await db
      .select({
        feedbackId: feedback.feedbackId,
        predictionId: feedback.predictionId,
        alertId: feedback.alertId,
        animalId: feedback.animalId,
        farmId: feedback.farmId,
        feedbackType: feedback.feedbackType,
        feedbackValue: feedback.feedbackValue,
        sourceRole: feedback.sourceRole,
        notes: feedback.notes,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .orderBy(desc(feedback.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: count() })
      .from(feedback);

    res.json({
      success: true,
      data: feedbackList,
      pagination: {
        page,
        limit,
        total: totalResult?.count ?? 0,
        totalPages: Math.ceil((totalResult?.count ?? 0) / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /feedback — 피드백 생성
feedbackRouter.post('/', requirePermission('feedback', 'create'), validate({ body: createFeedbackSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { predictionId, alertId, animalId, farmId, feedbackType, feedbackValue, notes } = req.body;
    const recordedBy = req.user!.userId;
    const sourceRole = req.user!.role;

    const [created] = await db
      .insert(feedback)
      .values({
        predictionId: predictionId ?? null,
        alertId: alertId ?? null,
        animalId: animalId ?? null,
        farmId,
        feedbackType,
        feedbackValue: feedbackValue ?? null,
        sourceRole,
        recordedBy,
        notes: notes ?? null,
      })
      .returning();

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
});

// GET /feedback/animal/:animalId — 동물별 피드백
feedbackRouter.get('/animal/:animalId', requirePermission('feedback', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const animalId = req.params.animalId as string;
    const data = await getFeedbackByAnimal(animalId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /feedback/stats — 피드백 통계
feedbackRouter.get('/stats', requirePermission('feedback', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.query.farmId as string;
    const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();

    if (!farmId) {
      res.status(400).json({ success: false, error: 'farmId is required' });
      return;
    }

    const data = await getFeedbackStats(farmId, { from, to });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /feedback/unmatched — 미매칭 예측 조회
feedbackRouter.get('/unmatched', requirePermission('feedback', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.query.farmId as string | undefined;
    const limit = Number(req.query.limit) || 50;
    const data = await getUnmatchedPredictions(farmId, limit);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// POST /feedback/match — 수동 결과 매칭
feedbackRouter.post('/match', requirePermission('feedback', 'create'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { predictionId, actualOutcome, isCorrect } = req.body;

    if (!predictionId || actualOutcome === undefined || isCorrect === undefined) {
      res.status(400).json({ success: false, error: 'predictionId, actualOutcome, isCorrect are required' });
      return;
    }

    const data = await recordOutcome({
      predictionId,
      actualOutcome,
      isCorrect,
      matchResult: isCorrect ? 'true_positive' : 'false_positive',
      evaluatedBy: req.user!.userId,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
