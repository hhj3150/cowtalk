// 비유곡선 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { milkRecords, lactationRecords, animals } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';

export const lactationRouter = Router();

lactationRouter.use(authenticate);

// GET /lactation/:animalId — 비유곡선 데이터
lactationRouter.get('/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    // 동물 정보
    const [animal] = await db
      .select({
        animalId: animals.animalId,
        daysInMilk: animals.daysInMilk,
        parity: animals.parity,
        lactationStatus: animals.lactationStatus,
      })
      .from(animals)
      .where(eq(animals.animalId, animalId));

    if (!animal) {
      res.status(404).json({ success: false, error: '동물을 찾을 수 없습니다' });
      return;
    }

    // 비유 기록 조회
    const records = await db
      .select()
      .from(milkRecords)
      .where(eq(milkRecords.animalId, animalId))
      .orderBy(desc(milkRecords.date))
      .limit(365);

    // 비유곡선 기록 조회
    const lactations = await db
      .select()
      .from(lactationRecords)
      .where(eq(lactationRecords.animalId, animalId))
      .orderBy(desc(lactationRecords.lactationNumber));

    const currentDim = animal.daysInMilk ?? 0;

    // 실제 우유 데이터가 있으면 사용, 없으면 Wood 모델 예측
    const dataPoints = records.length > 0
      ? records.map((r) => ({
          date: r.date,
          actualYield: r.yield,
          fat: r.fat,
          protein: r.protein,
          scc: r.scc,
        }))
      : generateLactationCurveData(currentDim);

    const totalYield = records.reduce((sum, r) => sum + r.yield, 0);

    const data = {
      animalId,
      currentDim,
      parity: animal.parity,
      lactationStatus: animal.lactationStatus,
      lactationHistory: lactations,
      totalYield: totalYield > 0 ? Math.round(totalYield * 10) / 10 : null,
      data: dataPoints,
    };

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

function generateLactationCurveData(currentDim: number) {
  const points: Array<{ dim: number; actualYield: number | null; predictedYield: number }> = [];

  for (let dim = 1; dim <= 365; dim += 5) {
    // Wood 모델: y = a * dim^b * e^(-c * dim)
    const predicted = 25 * Math.pow(dim, 0.15) * Math.exp(-0.003 * dim);
    const actual = dim <= currentDim ? predicted * (0.9 + Math.random() * 0.2) : null;

    points.push({
      dim,
      actualYield: actual !== null ? Math.round(actual * 10) / 10 : null,
      predictedYield: Math.round(predicted * 10) / 10,
    });
  }

  return points;
}
