// 농장 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { farmQuerySchema } from '@cowtalk/shared';
import { getDb } from '../../config/database.js';
import { farms, animals, smaxtecEvents, regions } from '../../db/schema.js';
import { eq, and, sql, count, gt } from 'drizzle-orm';

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

farmRouter.post('/', requirePermission('farm', 'create'), (_req, res) => {
  res.json({ success: true, data: null });
});

farmRouter.patch('/:farmId', requirePermission('farm', 'update'), (_req, res) => {
  res.json({ success: true, data: null });
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
