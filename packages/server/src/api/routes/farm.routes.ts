// 농장 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { farmQuerySchema, farmCreateSchema, farmUpdateSchema } from '@cowtalk/shared';
import { getDb } from '../../config/database.js';
import { farms, animals, smaxtecEvents, regions } from '../../db/schema.js';
import { eq, and, sql, count, gt } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../../lib/logger.js';

export const farmRouter = Router();

farmRouter.use(authenticate);

// GET /farms — 농장 목록 (실제 DB 쿼리)
farmRouter.get('/', requirePermission('farm', 'read'), validate({ query: farmQuerySchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const status = (req.query.status as string) || 'active';

    const farmList = await db
      .select({
        farmId: farms.farmId,
        externalId: farms.externalId,
        name: farms.name,
        address: farms.address,
        lat: farms.lat,
        lng: farms.lng,
        capacity: farms.capacity,
        currentHeadCount: farms.currentHeadCount,
        status: farms.status,
        ownerName: farms.ownerName,
        phone: farms.phone,
        regionProvince: regions.province,
        regionDistrict: regions.district,
        createdAt: farms.createdAt,
        updatedAt: farms.updatedAt,
      })
      .from(farms)
      .leftJoin(regions, eq(farms.regionId, regions.regionId))
      .where(eq(farms.status, status))
      .orderBy(farms.name)
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: count() })
      .from(farms)
      .where(eq(farms.status, status));

    const total = totalResult?.count ?? 0;

    res.json({
      success: true,
      data: farmList,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /farms/summary — KPI 집계 (목장 관리 대시보드용)
farmRouter.get('/summary', requirePermission('farm', 'read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const [farmCounts] = await db
      .select({
        total: count(),
        totalHeadCount: sql<number>`COALESCE(SUM(${farms.currentHeadCount}), 0)`,
        active: sql<number>`COUNT(*) FILTER (WHERE ${farms.status} = 'active')`,
        inactive: sql<number>`COUNT(*) FILTER (WHERE ${farms.status} != 'active')`,
      })
      .from(farms);

    const [animalCounts] = await db
      .select({
        traced: sql<number>`COUNT(*) FILTER (WHERE ${animals.traceId} IS NOT NULL AND ${animals.traceId} != '')`,
        withSensor: sql<number>`COUNT(*) FILTER (WHERE ${animals.currentDeviceId} IS NOT NULL AND ${animals.currentDeviceId} != '')`,
      })
      .from(animals)
      .where(eq(animals.status, 'active'));

    res.json({
      success: true,
      data: {
        totalFarms: farmCounts?.total ?? 0,
        totalHeadCount: Number(farmCounts?.totalHeadCount ?? 0),
        activeFarms: Number(farmCounts?.active ?? 0),
        inactiveFarms: Number(farmCounts?.inactive ?? 0),
        tracedAnimalCount: Number(animalCounts?.traced ?? 0),
        sensorAnimalCount: Number(animalCounts?.withSensor ?? 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /farms/regions — 지역 목록 (폼 드롭다운용)
farmRouter.get('/regions', requirePermission('farm', 'read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const regionList = await db
      .select({
        regionId: regions.regionId,
        province: regions.province,
        district: regions.district,
      })
      .from(regions)
      .orderBy(regions.province, regions.district);

    res.json({ success: true, data: regionList });
  } catch (error) {
    next(error);
  }
});

// GET /farms/:farmId — 단일 농장 (실제 DB)
farmRouter.get('/:farmId', requirePermission('farm', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    const [farm] = await db
      .select({
        farmId: farms.farmId,
        externalId: farms.externalId,
        name: farms.name,
        address: farms.address,
        lat: farms.lat,
        lng: farms.lng,
        capacity: farms.capacity,
        currentHeadCount: farms.currentHeadCount,
        status: farms.status,
        ownerName: farms.ownerName,
        phone: farms.phone,
        regionProvince: regions.province,
        regionDistrict: regions.district,
        createdAt: farms.createdAt,
        updatedAt: farms.updatedAt,
      })
      .from(farms)
      .leftJoin(regions, eq(farms.regionId, regions.regionId))
      .where(eq(farms.farmId, farmId));

    if (!farm) {
      res.status(404).json({ success: false, error: '농장을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data: farm });
  } catch (error) {
    next(error);
  }
});

// POST /farms — 농장 등록
farmRouter.post('/', requirePermission('farm', 'create'), validate({ body: farmCreateSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const parsed = farmCreateSchema.parse(req.body);

    // regionId가 미지정이면 기본 지역 사용
    let regionId = parsed.regionId;
    if (!regionId) {
      const [defaultRegion] = await db.select({ regionId: regions.regionId }).from(regions).limit(1);
      regionId = defaultRegion?.regionId;
    }
    if (!regionId) {
      res.status(400).json({ success: false, error: '지역 정보가 없습니다. 먼저 지역을 등록해주세요.' });
      return;
    }

    const [created] = await db
      .insert(farms)
      .values({
        name: parsed.name,
        address: parsed.address,
        lat: parsed.lat ?? 36.0,
        lng: parsed.lng ?? 127.5,
        capacity: parsed.capacity,
        currentHeadCount: 0,
        ownerName: parsed.ownerName ?? null,
        phone: parsed.phone ?? null,
        regionId,
        status: parsed.status,
      })
      .returning();

    logger.info({ farmId: created?.farmId, name: parsed.name }, 'Farm created');
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
});

// PATCH /farms/:farmId — 농장 수정
farmRouter.patch('/:farmId', requirePermission('farm', 'update'), validate({ body: farmUpdateSchema, params: z.object({ farmId: z.string().uuid() }) }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;
    const parsed = farmUpdateSchema.parse(req.body);

    // 빈 업데이트 방지
    if (Object.keys(parsed).length === 0) {
      res.status(400).json({ success: false, error: '수정할 항목이 없습니다' });
      return;
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.name !== undefined) updateValues.name = parsed.name;
    if (parsed.address !== undefined) updateValues.address = parsed.address;
    if (parsed.lat !== undefined) updateValues.lat = parsed.lat;
    if (parsed.lng !== undefined) updateValues.lng = parsed.lng;
    if (parsed.capacity !== undefined) updateValues.capacity = parsed.capacity;
    if (parsed.ownerName !== undefined) updateValues.ownerName = parsed.ownerName;
    if (parsed.phone !== undefined) updateValues.phone = parsed.phone;
    if (parsed.regionId !== undefined) updateValues.regionId = parsed.regionId;
    if (parsed.status !== undefined) updateValues.status = parsed.status;

    const [updated] = await db
      .update(farms)
      .set(updateValues)
      .where(eq(farms.farmId, farmId))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, error: '농장을 찾을 수 없습니다' });
      return;
    }

    logger.info({ farmId, changes: Object.keys(parsed) }, 'Farm updated');
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

farmRouter.delete('/:farmId', requirePermission('farm', 'delete'), (_req, res) => {
  res.json({ success: true, data: null });
});

// GET /farms/:farmId/profile — 농장 프로필 (실제 DB)
farmRouter.get('/:farmId/profile', requirePermission('farm', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    // 농장 기본 정보
    const [farm] = await db
      .select()
      .from(farms)
      .where(eq(farms.farmId, farmId));

    if (!farm) {
      res.status(404).json({ success: false, error: '농장을 찾을 수 없습니다' });
      return;
    }

    // 개체 수 + 품종 분포
    const breedCounts = await db
      .select({
        breed: animals.breed,
        count: count(),
      })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active')))
      .groupBy(animals.breed);

    const breedComposition: Record<string, number> = {};
    for (const row of breedCounts) {
      breedComposition[row.breed] = row.count;
    }

    // 최근 이벤트 수 (최근 30일)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [eventCountResult] = await db
      .select({ count: count() })
      .from(smaxtecEvents)
      .where(and(
        eq(smaxtecEvents.farmId, farmId),
        gt(smaxtecEvents.detectedAt, thirtyDaysAgo),
      ));

    const profile = {
      farmId: farm.farmId,
      name: farm.name,
      ownerName: farm.ownerName,
      address: farm.address,
      capacity: farm.capacity,
      currentHeadCount: farm.currentHeadCount,
      breedComposition,
      recentEventCount: eventCountResult?.count ?? 0,
      status: farm.status,
      createdAt: farm.createdAt,
      updatedAt: farm.updatedAt,
    };

    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

// GET /farms/:farmId/learning — 농장 학습 패턴
farmRouter.get('/:farmId/learning', requirePermission('farm', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    // 이벤트 유형별 통계
    const eventStats = await db
      .select({
        eventType: smaxtecEvents.eventType,
        count: count(),
      })
      .from(smaxtecEvents)
      .where(eq(smaxtecEvents.farmId, farmId))
      .groupBy(smaxtecEvents.eventType);

    const learning = {
      farmId,
      eventStats,
      patterns: [],
      lastUpdated: new Date().toISOString(),
    };

    res.json({ success: true, data: learning });
  } catch (error) {
    next(error);
  }
});

// GET /farms/:farmId/similar — 유사 농장 (규모 기반)
farmRouter.get('/:farmId/similar', requirePermission('farm', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    const [currentFarm] = await db
      .select({ currentHeadCount: farms.currentHeadCount })
      .from(farms)
      .where(eq(farms.farmId, farmId));

    const headCount = currentFarm?.currentHeadCount ?? 50;
    const minCount = Math.max(0, headCount - 30);
    const maxCount = headCount + 30;

    const similar = await db
      .select({
        farmId: farms.farmId,
        name: farms.name,
        currentHeadCount: farms.currentHeadCount,
        address: farms.address,
      })
      .from(farms)
      .where(and(
        sql`${farms.farmId} != ${farmId}`,
        sql`${farms.currentHeadCount} BETWEEN ${minCount} AND ${maxCount}`,
        eq(farms.status, 'active'),
      ))
      .limit(10);

    res.json({ success: true, data: similar });
  } catch (error) {
    next(error);
  }
});

// GET /farms/:farmId/report-card — 분기 리포트카드
farmRouter.get('/:farmId/report-card', requirePermission('farm', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    // 이벤트 유형별 집계로 간이 성적표 생성
    const eventStats = await db
      .select({
        eventType: smaxtecEvents.eventType,
        count: count(),
      })
      .from(smaxtecEvents)
      .where(eq(smaxtecEvents.farmId, farmId))
      .groupBy(smaxtecEvents.eventType);

    const [animalCount] = await db
      .select({ count: count() })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active')));

    const reportCard = {
      farmId,
      quarter: '2026-Q1',
      totalAnimals: animalCount?.count ?? 0,
      eventSummary: eventStats,
      generatedAt: new Date().toISOString(),
    };

    res.json({ success: true, data: reportCard });
  } catch (error) {
    next(error);
  }
});
