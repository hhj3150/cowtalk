// 동물 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { animalQuerySchema, createAnimalSchema } from '@cowtalk/shared';
import type { Role } from '@cowtalk/shared';
import { getAnimalDetail } from '../../serving/dashboard.service.js';
import { getDb } from '../../config/database.js';
import { animals, farms, smaxtecEvents } from '../../db/schema.js';
import { eq, and, sql, desc, count } from 'drizzle-orm';
import '../../types/express.d.js';

export const animalRouter = Router();

animalRouter.use(authenticate);

// GET /animals — 동물 목록 (실제 DB)
animalRouter.get('/', requirePermission('animal', 'read'), validate({ query: animalQuerySchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const farmId = req.query.farmId as string | undefined;
    const status = (req.query.status as string) || 'active';
    const search = req.query.search as string | undefined;

    const conditions = [eq(animals.status, status)];
    if (farmId) {
      conditions.push(eq(animals.farmId, farmId));
    }
    if (search) {
      conditions.push(
        sql`(${animals.name} ILIKE ${`%${search}%`} OR ${animals.earTag} ILIKE ${`%${search}%`} OR ${animals.traceId} ILIKE ${`%${search}%`})`,
      );
    }

    const animalList = await db
      .select({
        animalId: animals.animalId,
        externalId: animals.externalId,
        farmId: animals.farmId,
        farmName: farms.name,
        earTag: animals.earTag,
        traceId: animals.traceId,
        name: animals.name,
        breed: animals.breed,
        breedType: animals.breedType,
        sex: animals.sex,
        birthDate: animals.birthDate,
        parity: animals.parity,
        daysInMilk: animals.daysInMilk,
        lactationStatus: animals.lactationStatus,
        currentDeviceId: animals.currentDeviceId,
        status: animals.status,
        createdAt: animals.createdAt,
        updatedAt: animals.updatedAt,
      })
      .from(animals)
      .leftJoin(farms, eq(animals.farmId, farms.farmId))
      .where(and(...conditions))
      .orderBy(animals.name)
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: count() })
      .from(animals)
      .where(and(...conditions));

    const total = totalResult?.count ?? 0;

    res.json({
      success: true,
      data: animalList,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /animals/:animalId — 동물 상세 (AI 해석 포함)
animalRouter.get('/:animalId', requirePermission('animal', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;
    const role = req.user?.role as Role;

    // 기본 동물 정보
    const [animal] = await db
      .select({
        animalId: animals.animalId,
        externalId: animals.externalId,
        farmId: animals.farmId,
        farmName: farms.name,
        earTag: animals.earTag,
        traceId: animals.traceId,
        name: animals.name,
        breed: animals.breed,
        breedType: animals.breedType,
        sex: animals.sex,
        birthDate: animals.birthDate,
        parity: animals.parity,
        daysInMilk: animals.daysInMilk,
        lactationStatus: animals.lactationStatus,
        currentDeviceId: animals.currentDeviceId,
        status: animals.status,
      })
      .from(animals)
      .leftJoin(farms, eq(animals.farmId, farms.farmId))
      .where(eq(animals.animalId, animalId));

    if (!animal) {
      res.status(404).json({ success: false, error: '동물을 찾을 수 없습니다' });
      return;
    }

    // 최근 이벤트 (최근 10개)
    const recentEvents = await db
      .select({
        eventId: smaxtecEvents.eventId,
        eventType: smaxtecEvents.eventType,
        confidence: smaxtecEvents.confidence,
        severity: smaxtecEvents.severity,
        detectedAt: smaxtecEvents.detectedAt,
        details: smaxtecEvents.details,
      })
      .from(smaxtecEvents)
      .where(eq(smaxtecEvents.animalId, animalId))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(10);

    // AI 해석 시도 (실패 시 기본 데이터만 반환)
    let interpretation = null;
    try {
      interpretation = await getAnimalDetail(animalId, role);
    } catch {
      // AI 해석 실패 — 기본 데이터로 반환
    }

    res.json({
      success: true,
      data: {
        ...animal,
        recentEvents,
        interpretation,
      },
    });
  } catch (error) {
    next(error);
  }
});

animalRouter.post('/', requirePermission('animal', 'create'), validate({ body: createAnimalSchema }), (_req, res) => {
  res.json({ success: true, data: null });
});

animalRouter.patch('/:animalId', requirePermission('animal', 'update'), (_req, res) => {
  res.json({ success: true, data: null });
});
