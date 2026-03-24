// 지역 통계 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import type { Role } from '@cowtalk/shared';
import { analyzeRegion } from '../../ai-brain/index.js';
import { getDb } from '../../config/database.js';
import { regions, farms, smaxtecEvents } from '../../db/schema.js';
import { eq, count, and, gte, inArray } from 'drizzle-orm';

export const regionalRouter = Router();

regionalRouter.use(authenticate);

// GET /regional/summary — 지역별 요약
regionalRouter.get('/summary', requirePermission('regional', 'read'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const summary = await db
      .select({
        regionId: regions.regionId,
        province: regions.province,
        district: regions.district,
        code: regions.code,
        farmCount: count(farms.farmId),
      })
      .from(regions)
      .leftJoin(farms, eq(regions.regionId, farms.regionId))
      .groupBy(regions.regionId, regions.province, regions.district, regions.code);

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

// 모드별 이벤트 타입 매핑
const MODE_EVENT_TYPES: Record<string, readonly string[]> = {
  estrus: ['estrus', 'heat', 'insemination', 'no_insemination'],
  health: ['temperature_high', 'rumination_decrease', 'clinical_condition', 'health_general', 'temperature_low'],
  sensor: ['activity_decrease', 'activity_increase'],
};

// GET /regional/map — 지도 데이터 (mode별 필터링)
regionalRouter.get('/map', requirePermission('regional', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const mode = (req.query.mode as string) ?? 'status';

    const baseFarms = await db
      .select({
        farmId: farms.farmId,
        name: farms.name,
        lat: farms.lat,
        lng: farms.lng,
        currentHeadCount: farms.currentHeadCount,
        status: farms.status,
      })
      .from(farms)
      .where(eq(farms.status, 'active'));

    // 모드별 이벤트 집계 (최근 7일)
    const eventTypes = MODE_EVENT_TYPES[mode];
    let farmEventCounts = new Map<string, number>();

    if (eventTypes) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const counts = await db
        .select({
          farmId: smaxtecEvents.farmId,
          cnt: count(),
        })
        .from(smaxtecEvents)
        .where(
          and(
            inArray(smaxtecEvents.eventType, eventTypes as string[]),
            gte(smaxtecEvents.detectedAt, sevenDaysAgo),
          ),
        )
        .groupBy(smaxtecEvents.farmId);

      farmEventCounts = new Map(counts.map((r) => [r.farmId, r.cnt]));
    }

    // 모드별 상태 계산
    const markers = baseFarms.map((f) => {
      const eventCount = farmEventCounts.get(f.farmId) ?? 0;
      let modeStatus = f.status;

      if (eventTypes) {
        if (eventCount >= 5) modeStatus = 'critical';
        else if (eventCount >= 3) modeStatus = 'warning';
        else if (eventCount >= 1) modeStatus = 'normal';
        else modeStatus = 'normal';
      }

      return {
        farmId: f.farmId,
        name: f.name,
        lat: f.lat,
        lng: f.lng,
        totalAnimals: f.currentHeadCount,
        activeAlerts: eventCount,
        healthScore: eventTypes ? Math.max(0, 100 - eventCount * 15) : null,
        status: modeStatus,
      };
    });

    res.json({ success: true, data: { markers, mode } });
  } catch (error) {
    next(error);
  }
});

// GET /regional/:regionId — 지역 상세 (AI 해석 포함)
regionalRouter.get('/:regionId', requirePermission('regional', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const regionId = req.params.regionId as string;
    const role = req.user?.role as Role;

    // 기본 지역 정보
    const [region] = await db
      .select()
      .from(regions)
      .where(eq(regions.regionId, regionId));

    if (!region) {
      res.status(404).json({ success: false, error: '지역을 찾을 수 없습니다' });
      return;
    }

    // 해당 지역 농장 목록
    const farmList = await db
      .select({
        farmId: farms.farmId,
        name: farms.name,
        currentHeadCount: farms.currentHeadCount,
        status: farms.status,
      })
      .from(farms)
      .where(eq(farms.regionId, regionId));

    // AI 해석 시도
    let interpretation = null;
    try {
      interpretation = await analyzeRegion(regionId, role);
    } catch {
      // AI 해석 실패 시 기본 데이터만
    }

    res.json({
      success: true,
      data: {
        region,
        farms: farmList,
        totalFarms: farmList.length,
        totalAnimals: farmList.reduce((sum, f) => sum + f.currentHeadCount, 0),
        interpretation,
      },
    });
  } catch (error) {
    next(error);
  }
});
