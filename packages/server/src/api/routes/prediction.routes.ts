// 예측 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { paginationSchema } from '@cowtalk/shared';
import { getDb } from '../../config/database.js';
import { predictions, animals } from '../../db/schema.js';
import { eq, desc, count } from 'drizzle-orm';

export const predictionRouter = Router();

predictionRouter.use(authenticate);

// GET /predictions — 예측 목록
predictionRouter.get('/', requirePermission('prediction', 'read'), validate({ query: paginationSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const predictionList = await db
      .select({
        predictionId: predictions.predictionId,
        animalId: predictions.animalId,
        animalName: animals.name,
        animalEarTag: animals.earTag,
        engineType: predictions.engineType,
        predictionLabel: predictions.predictionLabel,
        probability: predictions.probability,
        confidence: predictions.confidence,
        severity: predictions.severity,
        timestamp: predictions.timestamp,
      })
      .from(predictions)
      .leftJoin(animals, eq(predictions.animalId, animals.animalId))
      .orderBy(desc(predictions.timestamp))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: count() })
      .from(predictions);

    const total = totalResult?.count ?? 0;

    res.json({
      success: true,
      data: predictionList,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /predictions/:predictionId — 예측 상세
predictionRouter.get('/:predictionId', requirePermission('prediction', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const predictionId = req.params.predictionId as string;

    const [prediction] = await db
      .select({
        predictionId: predictions.predictionId,
        animalId: predictions.animalId,
        animalName: animals.name,
        engineType: predictions.engineType,
        predictionLabel: predictions.predictionLabel,
        probability: predictions.probability,
        confidence: predictions.confidence,
        severity: predictions.severity,
        explanationText: predictions.explanationText,
        contributingFeatures: predictions.contributingFeatures,
        recommendedAction: predictions.recommendedAction,
        roleSpecific: predictions.roleSpecific,
        timestamp: predictions.timestamp,
      })
      .from(predictions)
      .leftJoin(animals, eq(predictions.animalId, animals.animalId))
      .where(eq(predictions.predictionId, predictionId));

    if (!prediction) {
      res.status(404).json({ success: false, error: '예측을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data: prediction });
  } catch (error) {
    next(error);
  }
});
