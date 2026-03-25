// 백신 라우트 — 실제 DB 쿼리 + 법정 스케줄 자동생성

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { vaccineSchedules, vaccineRecords, animals, farms } from '../../db/schema.js';
import { eq, and, count } from 'drizzle-orm';
import { VACCINE_PROTOCOLS } from '@cowtalk/shared';
import {
  generateVaccineSchedules,
  calculateVaccinationRate,
} from '../../services/vaccine/vaccine-scheduler.service.js';

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

// POST /vaccines/generate-schedule/:farmId — 법정 프로토콜 기반 스케줄 자동생성
vaccineRouter.post('/generate-schedule/:farmId', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string;
    const { month, year, protocolIds } = req.body as {
      month?: number;
      year?: number;
      protocolIds?: string[];
    };

    const results = await generateVaccineSchedules({
      farmId,
      month,
      year,
      protocolIds,
      createdBy: req.user!.userId,
    });

    const totalCreated = results.reduce((sum, r) => sum + r.newSchedulesCreated, 0);

    res.status(201).json({
      success: true,
      data: {
        results,
        totalCreated,
        message: totalCreated > 0
          ? `${String(totalCreated)}건의 백신 스케줄이 생성되었습니다.`
          : '모든 개체가 이미 스케줄/접종 완료 상태입니다.',
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /vaccines/rate/:farmId — 농장별 접종률
vaccineRouter.get('/rate/:farmId', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string;
    const protocolId = req.query.protocolId as string | undefined;

    const rate = await calculateVaccinationRate(farmId, protocolId);
    res.json({ success: true, data: rate });
  } catch (error) {
    next(error);
  }
});

// GET /vaccines/protocols — 법정 백신 프로토콜 목록
vaccineRouter.get('/protocols', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: VACCINE_PROTOCOLS.map((p) => ({
      id: p.id,
      name: p.name,
      nameEn: p.nameEn,
      type: p.type,
      priority: p.priority,
      legalBasis: p.legalBasis,
      penalty: p.penalty,
      frequency: p.frequency,
    })),
  });
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
