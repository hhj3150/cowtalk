// 전염병 조기경보 API 라우트

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../config/database.js';
import {
  getActiveClusters,
  getClusterFarms,
  getActiveWarnings,
  acknowledgeWarning,
  getDailySnapshots,
} from '../../epidemic/cluster-repository.js';
import { assessProximityRisk } from '../../epidemic/spread-analyzer.js';
import { haversineDistance } from '../../epidemic/geo-utils.js';
import { farms } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { runEpidemicScan } from '../../epidemic/epidemic-scheduler.js';
import { logger } from '../../lib/logger.js';
import type { EpidemicAlertLevel } from '@cowtalk/shared';

export const epidemicRouter = Router();

// ======================================================================
// GET /epidemic/warnings — 활성 경보 목록
// ======================================================================

epidemicRouter.get('/warnings', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { regionId, level } = req.query;

    const warnings = await getActiveWarnings(db, {
      regionId: regionId as string | undefined,
      level: level as string | undefined,
    });

    res.json({
      success: true,
      data: warnings,
      total: warnings.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get epidemic warnings');
    res.status(500).json({ success: false, error: 'Failed to get warnings' });
  }
});

// ======================================================================
// GET /epidemic/clusters — 활성 클러스터 목록
// ======================================================================

epidemicRouter.get('/clusters', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { regionId } = req.query;

    const clusters = await getActiveClusters(db, regionId as string | undefined);

    // 각 클러스터의 농장 정보를 포함
    const clustersWithFarms = await Promise.all(
      clusters.map(async (cluster) => {
        const clusterFarms = await getClusterFarms(db, cluster.clusterId);
        return {
          ...cluster,
          center: { lat: cluster.centerLat, lng: cluster.centerLng },
          farms: clusterFarms.map((f) => ({
            farmId: f.farmId,
            farmName: f.farmName,
            coordinates: { lat: f.lat, lng: f.lng },
            eventCount: f.eventCount,
            latestEventAt: f.latestEventAt,
          })),
        };
      }),
    );

    res.json({
      success: true,
      data: clustersWithFarms,
      total: clustersWithFarms.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get epidemic clusters');
    res.status(500).json({ success: false, error: 'Failed to get clusters' });
  }
});

// ======================================================================
// GET /epidemic/clusters/:clusterId — 클러스터 상세
// ======================================================================

epidemicRouter.get('/clusters/:clusterId', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { clusterId } = req.params;

    const clusters = await getActiveClusters(db);
    const cluster = clusters.find((c) => c.clusterId === clusterId);

    if (!cluster) {
      res.status(404).json({ success: false, error: 'Cluster not found' });
      return;
    }

    const clusterFarms = await getClusterFarms(db, clusterId as string);
    const warnings = await getActiveWarnings(db, {});
    const clusterWarnings = warnings.filter((w) => w.clusterId === clusterId);

    res.json({
      success: true,
      data: {
        ...cluster,
        center: { lat: cluster.centerLat, lng: cluster.centerLng },
        farms: clusterFarms,
        warnings: clusterWarnings,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get cluster detail');
    res.status(500).json({ success: false, error: 'Failed to get cluster detail' });
  }
});

// ======================================================================
// GET /epidemic/clusters/:clusterId/trend — 클러스터 추이
// ======================================================================

epidemicRouter.get('/clusters/:clusterId/trend', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { clusterId } = req.params;
    const days = parseInt(req.query.days as string, 10) || 14;

    const snapshots = await getDailySnapshots(db, null, days);

    res.json({
      success: true,
      data: {
        clusterId,
        snapshots,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get cluster trend');
    res.status(500).json({ success: false, error: 'Failed to get cluster trend' });
  }
});

// ======================================================================
// GET /epidemic/risk-map — 전체 농장 위험도 지도
// ======================================================================

epidemicRouter.get('/risk-map', async (_req: Request, res: Response) => {
  try {
    const db = getDb();

    // 활성 클러스터
    const clusters = await getActiveClusters(db);

    // 전체 농장 좌표
    const allFarms = await db
      .select({
        farmId: farms.farmId,
        farmName: farms.name,
        lat: farms.lat,
        lng: farms.lng,
      })
      .from(farms);

    const farmCoordinates = allFarms
      .filter((f) => f.lat !== null && f.lng !== null)
      .map((f) => ({
        farmId: f.farmId,
        farmName: f.farmName,
        coordinates: { lat: f.lat!, lng: f.lng! },
      }));

    // 각 클러스터에 대해 근접 위험 농장 계산
    const riskMap = clusters.flatMap((cluster) => {
      const clusterFarms = {
        diseaseType: cluster.diseaseType,
        center: { lat: cluster.centerLat, lng: cluster.centerLng },
        radiusKm: cluster.radiusKm,
        level: cluster.level as 'watch' | 'warning' | 'outbreak',
        farms: [] as Array<{ farmId: string; farmName: string; coordinates: { lat: number; lng: number }; eventCount: number; latestEventAt: Date; distanceFromCenter: number }>,
        totalEvents: cluster.eventCount,
        spreadRate: {
          farmsPerDay: cluster.spreadRateFarmsPerDay,
          eventsPerDay: cluster.spreadRateEventsPerDay,
          trend: cluster.spreadTrend as 'accelerating' | 'stable' | 'decelerating',
        },
        firstEventAt: cluster.firstDetectedAt,
        lastEventAt: cluster.lastUpdatedAt,
      };

      return assessProximityRisk(clusterFarms, farmCoordinates);
    });

    // 중복 농장 제거 (가장 높은 위험도 유지)
    const riskByFarm = new Map<string, typeof riskMap[number]>();
    for (const risk of riskMap) {
      const existing = riskByFarm.get(risk.farmId);
      if (!existing || risk.riskScore > existing.riskScore) {
        riskByFarm.set(risk.farmId, risk);
      }
    }

    // 현재 경보 레벨
    const highestLevel = clusters.reduce<EpidemicAlertLevel>((max, c) => {
      const order: Record<string, number> = { normal: 0, watch: 1, warning: 2, outbreak: 3 };
      return (order[c.level] ?? 0) > (order[max] ?? 0) ? (c.level as EpidemicAlertLevel) : max;
    }, 'normal');

    res.json({
      success: true,
      data: {
        currentLevel: highestLevel,
        activeClusters: clusters.length,
        riskMap: Array.from(riskByFarm.values()),
        farms: farmCoordinates,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get risk map');
    res.status(500).json({ success: false, error: 'Failed to get risk map' });
  }
});

// ======================================================================
// GET /epidemic/nearby/:farmId — 특정 농장 주변 위험 분석
// ======================================================================

epidemicRouter.get('/nearby/:farmId', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { farmId } = req.params;
    const radiusKm = parseInt(req.query.radiusKm as string, 10) || 50;

    const [farm] = await db
      .select()
      .from(farms)
      .where(eq(farms.farmId, farmId as string));

    if (!farm || !farm.lat || !farm.lng) {
      res.status(404).json({ success: false, error: 'Farm not found or no coordinates' });
      return;
    }

    const clusters = await getActiveClusters(db);
    const nearbyClusters = clusters.filter((c) =>
      haversineDistance(
        { lat: farm.lat!, lng: farm.lng! },
        { lat: c.centerLat, lng: c.centerLng },
      ) <= radiusKm,
    );

    res.json({
      success: true,
      data: {
        farmId,
        farmName: farm.name,
        coordinates: { lat: farm.lat, lng: farm.lng },
        nearbyClusters: nearbyClusters.map((c) => ({
          ...c,
          center: { lat: c.centerLat, lng: c.centerLng },
          distanceKm: Math.round(
            haversineDistance(
              { lat: farm.lat!, lng: farm.lng! },
              { lat: c.centerLat, lng: c.centerLng },
            ) * 10,
          ) / 10,
        })),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get nearby risks');
    res.status(500).json({ success: false, error: 'Failed to get nearby risks' });
  }
});

// ======================================================================
// POST /epidemic/acknowledge/:warningId — 경보 확인
// ======================================================================

epidemicRouter.post('/acknowledge/:warningId', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { warningId } = req.params;
    const userId = (req as unknown as Record<string, unknown>).userId as string ?? 'system';

    await acknowledgeWarning(db, warningId as string, userId);

    res.json({ success: true, message: 'Warning acknowledged' });
  } catch (error) {
    logger.error({ error }, 'Failed to acknowledge warning');
    res.status(500).json({ success: false, error: 'Failed to acknowledge warning' });
  }
});

// ======================================================================
// POST /epidemic/scan — 수동 스캔 트리거
// ======================================================================

epidemicRouter.post('/scan', async (_req: Request, res: Response) => {
  try {
    const result = await runEpidemicScan();
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error({ error }, 'Failed to run manual epidemic scan');
    res.status(500).json({ success: false, error: 'Failed to run scan' });
  }
});

// ======================================================================
// GET /epidemic/dashboard — 대시보드 요약 데이터
// ======================================================================

epidemicRouter.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const db = getDb();

    const [clusters, warnings, snapshots] = await Promise.all([
      getActiveClusters(db),
      getActiveWarnings(db),
      getDailySnapshots(db, null, 14),
    ]);

    const highestLevel = clusters.reduce<EpidemicAlertLevel>((max, c) => {
      const order: Record<string, number> = { normal: 0, watch: 1, warning: 2, outbreak: 3 };
      return (order[c.level] ?? 0) > (order[max] ?? 0) ? (c.level as EpidemicAlertLevel) : max;
    }, 'normal');

    const now = new Date();
    const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    res.json({
      success: true,
      data: {
        currentLevel: highestLevel,
        activeWarnings: warnings.length,
        activeClusters: clusters.length,
        newClustersLast24h: clusters.filter(
          (c) => new Date(c.firstDetectedAt).getTime() > h24ago.getTime(),
        ).length,
        resolvedLast7d: 0, // TODO: resolved cluster count
        dailySnapshots: snapshots,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get epidemic dashboard');
    res.status(500).json({ success: false, error: 'Failed to get dashboard data' });
  }
});
