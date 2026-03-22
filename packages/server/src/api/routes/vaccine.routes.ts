// 백신 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { vaccineSchedules, vaccineRecords, animals, farms } from '../../db/schema.js';
import { eq, and, count } from 'drizzle-orm';

export const vaccineRouter = Router();

vaccineRouter.use(authenticate);

// GET /vaccines/schedule/:farmId — 농장별 백신 스케줄
vaccineRouter.get('/schedule/:farmId', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    const schedules = await db
      .select({
        scheduleId: vaccineSchedules.scheduleId,
        animalId: vaccineSchedules.animalId,
        animalName: animals.name,
        earTag: animals.earTag,
        vaccineName: vaccineSchedules.vaccineName,
        status: vaccineSchedules.status,
        scheduledDate: vaccineSchedules.scheduledDate,
        notes: vaccineSchedules.notes,
      })
      .from(vaccineSchedules)
      .innerJoin(animals, eq(vaccineSchedules.animalId, animals.animalId))
      .where(eq(vaccineSchedules.farmId, farmId))
      .orderBy(vaccineSchedules.scheduledDate);

    res.json({ success: true, data: schedules });
  } catch (error) {
    next(error);
  }
});

// POST /vaccines/record — 접종 기록
vaccineRouter.post('/record', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { scheduleId, animalId, farmId, vaccineName, batchNumber, notes } = req.body;
    const administeredBy = req.user!.userId;

    const [record] = await db
      .insert(vaccineRecords)
      .values({
        scheduleId: scheduleId ?? null,
        animalId,
        farmId,
        vaccineName,
        batchNumber: batchNumber ?? null,
        administeredBy,
        administeredAt: new Date(),
        notes: notes ?? null,
      })
      .returning();

    // 스케줄이 있으면 상태 업데이트
    if (scheduleId) {
      await db
        .update(vaccineSchedules)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(vaccineSchedules.scheduleId, scheduleId as string));
    }

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

// GET /vaccines/coverage/:regionId — 지역별 접종률
vaccineRouter.get('/coverage/:regionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const regionId = req.params.regionId as string;

    const [totalResult] = await db
      .select({ count: count() })
      .from(animals)
      .innerJoin(farms, eq(animals.farmId, farms.farmId))
      .where(and(eq(farms.regionId, regionId), eq(animals.status, 'active')));

    const totalAnimals = totalResult?.count ?? 0;

    const vaccineCounts = await db
      .select({
        vaccineName: vaccineRecords.vaccineName,
        count: count(),
      })
      .from(vaccineRecords)
      .innerJoin(farms, eq(vaccineRecords.farmId, farms.farmId))
      .where(eq(farms.regionId, regionId))
      .groupBy(vaccineRecords.vaccineName);

    const vaccines = vaccineCounts.map((v) => ({
      name: v.vaccineName,
      vaccinated: v.count,
      coverage: totalAnimals > 0 ? Math.round((v.count / totalAnimals) * 1000) / 10 : 0,
    }));

    res.json({
      success: true,
      data: { regionId, totalAnimals, vaccines, lastUpdated: new Date().toISOString() },
    });
  } catch (error) {
    next(error);
  }
});
