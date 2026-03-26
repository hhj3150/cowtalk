// 체중 측정 라우트 — AI 체중 추정 Phase 1 데이터 수집

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { weightMeasurements } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export const weightRouter = Router();

weightRouter.use(authenticate);

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB base64

// POST /weight — 체중 측정 기록 저장
weightRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      animalId,
      farmId,
      actualWeightKg,
      sidePhotoBase64,
      rearPhotoBase64,
      notes,
    } = req.body as {
      animalId?: string;
      farmId?: string;
      actualWeightKg?: number;
      sidePhotoBase64?: string;
      rearPhotoBase64?: string;
      notes?: string;
    };

    if (!animalId || !farmId || !actualWeightKg) {
      res.status(400).json({ error: 'animalId, farmId, actualWeightKg 필수' });
      return;
    }

    if (actualWeightKg < 50 || actualWeightKg > 1500) {
      res.status(400).json({ error: '체중은 50~1500kg 범위여야 합니다' });
      return;
    }

    if (sidePhotoBase64 && sidePhotoBase64.length > MAX_PHOTO_SIZE) {
      res.status(400).json({ error: '측면 사진이 5MB를 초과합니다' });
      return;
    }
    if (rearPhotoBase64 && rearPhotoBase64.length > MAX_PHOTO_SIZE) {
      res.status(400).json({ error: '후면 사진이 5MB를 초과합니다' });
      return;
    }

    const db = getDb();
    const userId = (req as unknown as { user?: { userId?: string } }).user?.userId ?? null;

    const [record] = await db.insert(weightMeasurements).values({
      animalId,
      farmId,
      measuredAt: new Date(),
      actualWeightKg,
      sidePhotoBase64: sidePhotoBase64 ?? null,
      rearPhotoBase64: rearPhotoBase64 ?? null,
      measuredBy: userId,
      notes: notes ?? null,
    }).returning({
      measurementId: weightMeasurements.measurementId,
      measuredAt: weightMeasurements.measuredAt,
      actualWeightKg: weightMeasurements.actualWeightKg,
    });

    logger.info({ animalId, actualWeightKg }, 'Weight measurement saved');

    res.json({
      success: true,
      data: record,
    });
  } catch (error) {
    next(error);
  }
});

// GET /weight/:animalId — 개체별 체중 기록 목록
weightRouter.get('/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const animalId = String(req.params.animalId ?? '');
    if (!animalId) {
      res.status(400).json({ error: 'animalId 필수' });
      return;
    }

    const db = getDb();
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const records = await db
      .select({
        measurementId: weightMeasurements.measurementId,
        animalId: weightMeasurements.animalId,
        farmId: weightMeasurements.farmId,
        measuredAt: weightMeasurements.measuredAt,
        actualWeightKg: weightMeasurements.actualWeightKg,
        estimatedWeightKg: weightMeasurements.estimatedWeightKg,
        hasSidePhoto: weightMeasurements.sidePhotoBase64,
        hasRearPhoto: weightMeasurements.rearPhotoBase64,
        notes: weightMeasurements.notes,
        createdAt: weightMeasurements.createdAt,
      })
      .from(weightMeasurements)
      .where(eq(weightMeasurements.animalId, animalId))
      .orderBy(desc(weightMeasurements.measuredAt))
      .limit(limit);

    // base64 데이터는 목록에서 반환하지 않음 (hasSidePhoto → boolean 변환)
    const mapped = records.map((r) => ({
      ...r,
      measuredAt: r.measuredAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      hasSidePhoto: !!r.hasSidePhoto,
      hasRearPhoto: !!r.hasRearPhoto,
    }));

    res.json({ data: mapped });
  } catch (error) {
    next(error);
  }
});

// GET /weight/:animalId/latest — 최신 기록 1건
weightRouter.get('/:animalId/latest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const animalId = String(req.params.animalId ?? '');
    if (!animalId) {
      res.status(400).json({ error: 'animalId 필수' });
      return;
    }

    const db = getDb();
    const [record] = await db
      .select({
        measurementId: weightMeasurements.measurementId,
        measuredAt: weightMeasurements.measuredAt,
        actualWeightKg: weightMeasurements.actualWeightKg,
        estimatedWeightKg: weightMeasurements.estimatedWeightKg,
        notes: weightMeasurements.notes,
      })
      .from(weightMeasurements)
      .where(eq(weightMeasurements.animalId, animalId))
      .orderBy(desc(weightMeasurements.measuredAt))
      .limit(1);

    if (!record) {
      res.json({ data: null });
      return;
    }

    res.json({
      data: {
        ...record,
        measuredAt: record.measuredAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});
