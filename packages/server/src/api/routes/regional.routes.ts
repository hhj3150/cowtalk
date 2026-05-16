// 지역 통계 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import type { Role } from '@cowtalk/shared';
import { analyzeRegion } from '../../ai-brain/index.js';
import { getDb } from '../../config/database.js';
import { regions, farms, smaxtecEvents, animals } from '../../db/schema.js';
import { eq, count, and, gte, inArray, isNull } from 'drizzle-orm';
import { getHerdTotal, computeHerd } from '../../services/metrics/herd-service.js';

export const regionalRouter = Router();

regionalRouter.use(authenticate);

// GET /regional/summary — 지역별 요약
// 지역 지도는 모든 인증 사용자에게 개방 (읽기 전용, 보안 위험 없음)
// 역할 전환 시 JWT 재발급 없이도 접근 가능하도록 RBAC 제거
regionalRouter.get('/summary', async (_req: Request, res: Response, next: NextFunction) => {
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
regionalRouter.get('/map', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const mode = (req.query.mode as string) ?? 'status';

    const baseFarms = await db
      .select({
        farmId: farms.farmId,
        name: farms.name,
        lat: farms.lat,
        lng: farms.lng,
        status: farms.status,
      })
      .from(farms)
      .where(eq(farms.status, 'active'));

    // 라이브 두수 (D7, BUG-007) — farmId별 active 동물 카운트.
    // currentHeadCount(D8 격하)는 마커 totalAnimals 산출에 사용 안 함 (사용자 노출 = 라이브, D9).
    const animalRows = await db
      .select({ farmId: animals.farmId })
      .from(animals)
      .where(and(eq(animals.status, 'active'), isNull(animals.deletedAt)));
    const liveCountByFarm = new Map<string, number>();
    for (const a of animalRows) {
      liveCountByFarm.set(a.farmId, (liveCountByFarm.get(a.farmId) ?? 0) + 1);
    }

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
        totalAnimals: liveCountByFarm.get(f.farmId) ?? 0,
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
regionalRouter.get('/:regionId', async (req: Request, res: Response, next: NextFunction) => {
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

    // 라이브 두수 (D7, BUG-007) — 지역 내 농장 활성 동물 합. D9 사용자 노출은 라이브만.
    // 0농장 region이면 실측 0두 (전체 fallback 차단).
    const regionFarmIds = farmList.map((f) => f.farmId);
    const regionHerd = regionFarmIds.length > 0
      ? await getHerdTotal({ farmIds: regionFarmIds })
      : computeHerd(0, 'live');

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
        totalAnimals: regionHerd.total,
        interpretation,
      },
    });
  } catch (error) {
    next(error);
  }
});
