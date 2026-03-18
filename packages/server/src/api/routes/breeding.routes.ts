// 번식 라우트 — 실제 DB 쿼리 + smaXtec 발정 이벤트

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { breedingEvents, smaxtecEvents, animals, semenCatalog, pregnancyChecks } from '../../db/schema.js';
import { eq, and, desc, count } from 'drizzle-orm';
import '../../types/express.d.js';

export const breedingRouter = Router();

breedingRouter.use(authenticate);

// GET /breeding/semen — 정액 카탈로그
breedingRouter.get('/semen', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const breed = req.query.breed as string | undefined;

    const conditions = breed ? [eq(semenCatalog.breed, breed)] : [];

    const catalog = await db
      .select()
      .from(semenCatalog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(semenCatalog.bullName);

    res.json({ success: true, data: catalog });
  } catch (error) {
    next(error);
  }
});

// GET /breeding/recommend/:animalId — 교배 추천 (향후 AI 연동)
breedingRouter.get('/recommend/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    // 현재는 정액 카탈로그에서 추천 (향후 유전체 분석 연동)
    const catalog = await db
      .select()
      .from(semenCatalog)
      .limit(5);

    const recommendations = catalog.map((s, i) => ({
      rank: i + 1,
      semenId: s.semenId,
      bullName: s.bullName,
      score: 90 - i * 5,
      reasons: ['정액 카탈로그 기반 추천'],
    }));

    res.json({ success: true, data: { animalId, recommendations } });
  } catch (error) {
    next(error);
  }
});

// GET /breeding/pedigree/:animalId — 혈통 조회
breedingRouter.get('/pedigree/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    const [animal] = await db
      .select({
        animalId: animals.animalId,
        name: animals.name,
        earTag: animals.earTag,
        traceId: animals.traceId,
        breed: animals.breed,
        birthDate: animals.birthDate,
        parity: animals.parity,
      })
      .from(animals)
      .where(eq(animals.animalId, animalId));

    if (!animal) {
      res.status(404).json({ success: false, error: '동물을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data: { animal, pedigree: null } });
  } catch (error) {
    next(error);
  }
});

// GET /breeding/stats/:farmId — 번식 통계 (smaXtec 발정 이벤트 기반)
breedingRouter.get('/stats/:farmId', requireFarmAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    // 발정 이벤트 수
    const [estrusCount] = await db
      .select({ count: count() })
      .from(smaxtecEvents)
      .where(and(
        eq(smaxtecEvents.farmId, farmId),
        eq(smaxtecEvents.eventType, 'estrus'),
      ));

    // 번식 이벤트 (farmId → 해당 농장 동물들의 이벤트)
    const breedingEventList = await db
      .select({
        eventId: breedingEvents.eventId,
        animalId: breedingEvents.animalId,
        animalName: animals.name,
        eventDate: breedingEvents.eventDate,
        type: breedingEvents.type,
        semenInfo: breedingEvents.semenInfo,
        notes: breedingEvents.notes,
      })
      .from(breedingEvents)
      .innerJoin(animals, eq(breedingEvents.animalId, animals.animalId))
      .where(eq(animals.farmId, farmId))
      .orderBy(desc(breedingEvents.eventDate))
      .limit(20);

    // 임신 확인
    const pregnancies = await db
      .select({
        checkId: pregnancyChecks.checkId,
        animalId: pregnancyChecks.animalId,
        animalName: animals.name,
        checkDate: pregnancyChecks.checkDate,
        result: pregnancyChecks.result,
        method: pregnancyChecks.method,
      })
      .from(pregnancyChecks)
      .innerJoin(animals, eq(pregnancyChecks.animalId, animals.animalId))
      .where(eq(animals.farmId, farmId))
      .orderBy(desc(pregnancyChecks.checkDate))
      .limit(20);

    const stats = {
      farmId,
      estrusEventCount: estrusCount?.count ?? 0,
      breedingEvents: breedingEventList,
      pregnancyChecks: pregnancies,
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});
