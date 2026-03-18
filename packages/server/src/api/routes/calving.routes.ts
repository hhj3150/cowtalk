// 분만 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { calvingEvents, calvingChecklists, animals, smaxtecEvents } from '../../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import '../../types/express.d.js';

export const calvingRouter = Router();

calvingRouter.use(authenticate);

// GET /calving/upcoming/:farmId — 분만 예정 목록 (smaXtec 발정 이벤트 기반)
calvingRouter.get('/upcoming/:farmId', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    // smaXtec 이벤트에서 expected_calving_date 정보가 있는 이벤트 조회
    const calvingPredictions = await db
      .select({
        animalId: smaxtecEvents.animalId,
        animalName: animals.name,
        earTag: animals.earTag,
        parity: animals.parity,
        eventType: smaxtecEvents.eventType,
        details: smaxtecEvents.details,
        detectedAt: smaxtecEvents.detectedAt,
      })
      .from(smaxtecEvents)
      .innerJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .where(and(
        eq(smaxtecEvents.farmId, farmId),
        sql`(${smaxtecEvents.details}->>'expected_calving_date') IS NOT NULL`,
      ))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(20);

    const upcoming = calvingPredictions.map((row) => {
      const details = row.details as Record<string, unknown>;
      const expectedDate = details.expected_calving_date as string | null;
      const daysToCalving = details.days_to_calving as number | null;

      return {
        animalId: row.animalId,
        earTag: row.earTag,
        name: row.animalName,
        parity: row.parity,
        expectedDate,
        daysUntil: daysToCalving ?? null,
        riskLevel: (row.parity ?? 0) >= 4 ? 'high' : 'low',
        riskFactors: (row.parity ?? 0) >= 4 ? ['고령'] : [],
      };
    });

    res.json({ success: true, data: upcoming });
  } catch (error) {
    next(error);
  }
});

// POST /calving/record — 분만 기록
calvingRouter.post('/record', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { animalId, calvingDate, calfSex, calfStatus, complications, notes } = req.body;

    const [record] = await db
      .insert(calvingEvents)
      .values({
        animalId,
        calvingDate: calvingDate ? new Date(calvingDate as string) : new Date(),
        calfSex: calfSex ?? null,
        calfStatus: calfStatus ?? null,
        complications: complications ?? null,
        notes: notes ?? null,
      })
      .returning();

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

// POST /calving/newborn/:calfId/checklist — 신생아 체크리스트 업데이트
calvingRouter.post('/newborn/:calfId/checklist', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const calfId = req.params.calfId as string;
    const { calvingEventId, colostrumFed, colostrumTimestamp, navelTreated, weightKg, vitality, notes } = req.body;
    const completedBy = req.user!.userId;

    const [checklist] = await db
      .insert(calvingChecklists)
      .values({
        calvingEventId,
        calfId: calfId,
        colostrumFed: colostrumFed ?? false,
        colostrumTimestamp: colostrumTimestamp ? new Date(colostrumTimestamp as string) : null,
        navelTreated: navelTreated ?? false,
        weightKg: weightKg ?? null,
        vitality: vitality ?? null,
        notes: notes ?? null,
        completedBy,
      })
      .returning();

    res.status(201).json({ success: true, data: checklist });
  } catch (error) {
    next(error);
  }
});

// GET /calving/history/:farmId — 분만 이력 조회
calvingRouter.get('/history/:farmId', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    const history = await db
      .select({
        eventId: calvingEvents.eventId,
        animalId: calvingEvents.animalId,
        animalName: animals.name,
        earTag: animals.earTag,
        calvingDate: calvingEvents.calvingDate,
        calfSex: calvingEvents.calfSex,
        calfStatus: calvingEvents.calfStatus,
        complications: calvingEvents.complications,
        notes: calvingEvents.notes,
        createdAt: calvingEvents.createdAt,
      })
      .from(calvingEvents)
      .innerJoin(animals, eq(calvingEvents.animalId, animals.animalId))
      .where(eq(animals.farmId, farmId))
      .orderBy(desc(calvingEvents.calvingDate))
      .limit(50);

    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
});
