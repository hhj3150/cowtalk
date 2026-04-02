// 번식 라우트 — 실제 DB 쿼리 + smaXtec 발정 이벤트

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { breedingEvents, smaxtecEvents, animals, semenCatalog, pregnancyChecks, farmSemenInventory } from '../../db/schema.js';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { getBreedingAdvice, recordInsemination, recordPregnancyCheck, getBreedingFeedback } from '../../services/breeding/breeding-advisor.service.js';
import { getFarmBreedingSettings } from '../../services/breeding/farm-settings-sync.service.js';
import { getBreedingPipeline } from '../../services/breeding/breeding-pipeline.service.js';
import { seedSemenCatalog, syncHanwooSemenFromPublicApi } from '../../services/breeding/semen-seed.service.js';
import { PedigreeConnector } from '../../pipeline/connectors/public-data/pedigree.connector.js';
import { getBreedingInsights } from '../../services/breeding/breeding-insights.service.js';
import { getTransitionRisk } from '../../services/breeding/transition-risk.service.js';

export const breedingRouter = Router();

breedingRouter.use(authenticate);

// GET /breeding/pipeline — 번식 파이프라인 (전체 또는 farmId 필터)
breedingRouter.get('/pipeline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.query.farmId as string | undefined;
    const data = await getBreedingPipeline(farmId || undefined);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /breeding/pipeline/:farmId — 농장별 번식 파이프라인
breedingRouter.get('/pipeline/:farmId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string;
    const data = await getBreedingPipeline(farmId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

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

// GET /breeding/recommend/:animalId — 발정→수정 추천 (실 로직)
breedingRouter.get('/recommend/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const animalId = req.params.animalId as string;
    const advice = await getBreedingAdvice(animalId);

    if (!advice) {
      res.status(404).json({ success: false, error: '개체를 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data: advice });
  } catch (error) {
    next(error);
  }
});

// POST /breeding/inseminate — 수정 기록 저장
breedingRouter.post('/inseminate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { animalId, farmId, semenId, semenInfo, technicianName, recommendedSemenId, optimalTime, notes } = req.body as {
      animalId: string;
      farmId: string;
      semenId?: string;
      semenInfo?: string;
      technicianName?: string;
      recommendedSemenId?: string;
      optimalTime?: string;
      notes?: string;
    };

    if (!animalId || !farmId) {
      res.status(400).json({ success: false, error: 'animalId, farmId 필수' });
      return;
    }

    const result = await recordInsemination({
      animalId, farmId, semenId, semenInfo, technicianName, recommendedSemenId, optimalTime, notes,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// GET /breeding/farm/:farmId/inventory — 목장 보유 정액 목록
breedingRouter.get('/farm/:farmId/inventory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    const inventory = await db.select({
      inventoryId: farmSemenInventory.inventoryId,
      semenId: semenCatalog.semenId,
      bullName: semenCatalog.bullName,
      bullRegistration: semenCatalog.bullRegistration,
      breed: semenCatalog.breed,
      supplier: semenCatalog.supplier,
      genomicTraits: semenCatalog.genomicTraits,
      pricePerStraw: semenCatalog.pricePerStraw,
      quantity: farmSemenInventory.quantity,
      purchasedAt: farmSemenInventory.purchasedAt,
      expiresAt: farmSemenInventory.expiresAt,
      notes: farmSemenInventory.notes,
    })
      .from(farmSemenInventory)
      .innerJoin(semenCatalog, eq(farmSemenInventory.semenId, semenCatalog.semenId))
      .where(eq(farmSemenInventory.farmId, farmId))
      .orderBy(desc(farmSemenInventory.quantity));

    res.json({ success: true, data: inventory });
  } catch (error) {
    next(error);
  }
});

// POST /breeding/farm/:farmId/inventory — 목장 보유 정액 추가
breedingRouter.post('/farm/:farmId/inventory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;
    const { semenId, quantity, notes } = req.body as { semenId: string; quantity: number; notes?: string };

    if (!semenId || quantity == null) {
      res.status(400).json({ success: false, error: 'semenId, quantity 필수' });
      return;
    }

    // 이미 있으면 수량 추가
    const [existing] = await db.select()
      .from(farmSemenInventory)
      .where(and(eq(farmSemenInventory.farmId, farmId), eq(farmSemenInventory.semenId, semenId)));

    if (existing) {
      await db.execute(sql`
        UPDATE farm_semen_inventory
        SET quantity = quantity + ${quantity}, notes = COALESCE(${notes ?? null}, notes)
        WHERE farm_id = ${farmId} AND semen_id = ${semenId}
      `);
      res.json({ success: true, data: { inventoryId: existing.inventoryId, action: 'updated' } });
    } else {
      const [result] = await db.insert(farmSemenInventory).values({
        farmId,
        semenId,
        quantity,
        notes: notes ?? null,
      }).returning({ inventoryId: farmSemenInventory.inventoryId });
      res.json({ success: true, data: { inventoryId: result?.inventoryId, action: 'created' } });
    }
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

    // 이력제번호로 ekape 혈통 조회 (traceId 있을 때만)
    let pedigree = null;
    if (animal.traceId) {
      const connector = new PedigreeConnector();
      await connector.connect();
      pedigree = await connector.fetchPedigree(animal.traceId);
      await connector.disconnect();
    }

    res.json({ success: true, data: { animal, pedigree } });
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

    // 수태율 계산
    const totalInseminations = breedingEventList.filter((e) => e.type === 'insemination').length;
    const pregnantCount = pregnancies.filter((p) => p.result === 'pregnant').length;
    const openCount = pregnancies.filter((p) => p.result === 'open' || p.result === 'not_pregnant').length;
    const decided = pregnantCount + openCount;
    const conceptionRate = decided > 0 ? Math.round((pregnantCount / decided) * 100) : 0;

    const stats = {
      farmId,
      estrusEventCount: estrusCount?.count ?? 0,
      totalInseminations,
      conceptionRate,
      pregnantCount,
      openCount,
      breedingEvents: breedingEventList,
      pregnancyChecks: pregnancies,
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// POST /breeding/pregnancy-check — 임신감정 결과 저장
breedingRouter.post('/pregnancy-check', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { animalId, checkDate, result, method, daysPostInsemination, notes } = req.body as {
      animalId: string;
      checkDate: string;
      result: 'pregnant' | 'open';
      method: 'ultrasound' | 'manual' | 'blood';
      daysPostInsemination?: number;
      notes?: string;
    };

    if (!animalId || !checkDate || !result || !method) {
      res.status(400).json({ success: false, error: 'animalId, checkDate, result, method 필수' });
      return;
    }

    const check = await recordPregnancyCheck({ animalId, checkDate, result, method, daysPostInsemination, notes });
    res.json({ success: true, data: check });
  } catch (error) {
    next(error);
  }
});

// GET /breeding/feedback/:animalId — 수정→임신감정 피드백 이력
breedingRouter.get('/feedback/:animalId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const animalId = req.params.animalId as string;
    const feedback = await getBreedingFeedback(animalId);
    res.json({ success: true, data: feedback });
  } catch (error) {
    next(error);
  }
});

// GET /breeding/farm/:farmId/settings — 목장별 번식 설정 조회
breedingRouter.get('/farm/:farmId/settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string;
    const settings = await getFarmBreedingSettings(farmId);
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

// GET /breeding/insights — 번식 인사이트 4종 (무발정/불규칙/유산의심/수정실패)
breedingRouter.get('/insights', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.query.farmId as string | undefined;
    const data = await getBreedingInsights(farmId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /breeding/insights/:farmId — 농장별 번식 인사이트
breedingRouter.get('/insights/:farmId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string;
    const data = await getBreedingInsights(farmId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /breeding/transition-risk — 전환기 위험우 목록
breedingRouter.get('/transition-risk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.query.farmId as string | undefined;
    const data = await getTransitionRisk(farmId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /breeding/transition-risk/:farmId — 농장별 전환기 위험우
breedingRouter.get('/transition-risk/:farmId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const farmId = req.params.farmId as string;
    const data = await getTransitionRisk(farmId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// POST /breeding/semen/seed — 씨수소 카탈로그 수동 시딩 (어드민/시연용)
breedingRouter.post('/semen/seed', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await seedSemenCatalog();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// POST /breeding/semen/sync-hanwoo — 한우 씨수소 공공API 즉시 동기화 (어드민/시연용)
breedingRouter.post('/semen/sync-hanwoo', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await syncHanwooSemenFromPublicApi();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
