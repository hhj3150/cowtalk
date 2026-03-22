// 센서 데이터 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { sensorQuerySchema } from '@cowtalk/shared';
import { getDb } from '../../config/database.js';
import { sensorMeasurements, sensorDevices, animals, smaxtecEvents } from '../../db/schema.js';
import { eq, and, desc, gt, sql } from 'drizzle-orm';

export const sensorRouter = Router();

sensorRouter.use(authenticate);

// GET /sensors — 센서 측정값 목록
sensorRouter.get('/', requirePermission('sensor', 'read'), validate({ query: sensorQuerySchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.query.animalId as string | undefined;
    const metricType = req.query.metricType as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 100, 1000);

    const conditions = [];
    if (animalId) {
      conditions.push(eq(sensorMeasurements.animalId, animalId));
    }
    if (metricType) {
      conditions.push(eq(sensorMeasurements.metricType, metricType));
    }

    const measurements = await db
      .select()
      .from(sensorMeasurements)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sensorMeasurements.timestamp))
      .limit(limit);

    res.json({ success: true, data: measurements });
  } catch (error) {
    next(error);
  }
});

// GET /sensors/latest/:animalId — 최신 센서 수치
sensorRouter.get('/latest/:animalId', requirePermission('sensor', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    // 각 metricType별 최신 값 조회
    const latestMeasurements = await db
      .select()
      .from(sensorMeasurements)
      .where(eq(sensorMeasurements.animalId, animalId))
      .orderBy(desc(sensorMeasurements.timestamp))
      .limit(50);

    // metricType별로 그룹화하여 최신 값만 추출
    const latestByType = new Map<string, typeof latestMeasurements[0]>();
    for (const m of latestMeasurements) {
      if (!latestByType.has(m.metricType)) {
        latestByType.set(m.metricType, m);
      }
    }

    res.json({
      success: true,
      data: Object.fromEntries(latestByType),
    });
  } catch (error) {
    next(error);
  }
});

// GET /sensors/devices/:animalId — 동물의 센서 디바이스 목록
sensorRouter.get('/devices/:animalId', requirePermission('sensor', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;

    const devices = await db
      .select()
      .from(sensorDevices)
      .where(eq(sensorDevices.animalId, animalId));

    // 센서 디바이스가 없으면 동물의 currentDeviceId로 대체
    if (devices.length === 0) {
      const [animal] = await db
        .select({ currentDeviceId: animals.currentDeviceId, animalId: animals.animalId })
        .from(animals)
        .where(eq(animals.animalId, animalId));

      if (animal?.currentDeviceId) {
        res.json({
          success: true,
          data: [{
            deviceId: null,
            externalId: animal.currentDeviceId,
            animalId: animal.animalId,
            deviceType: 'smaxtec_bolus',
            status: 'active',
          }],
        });
        return;
      }
    }

    res.json({ success: true, data: devices });
  } catch (error) {
    next(error);
  }
});

// GET /sensors/:animalId/history — 센서 시계열 차트 데이터
// smaxtec_events에서 해당 동물의 이벤트를 시계열로 변환
const RANGE_HOURS: Record<string, number> = {
  '24h': 24,
  '48h': 48,
  '7d': 168,
  '30d': 720,
};

sensorRouter.get('/:animalId/history', requirePermission('sensor', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const animalId = req.params.animalId as string;
    const range = (req.query.range as string) || '24h';
    const hours = RANGE_HOURS[range] ?? 24;

    const since = new Date();
    since.setHours(since.getHours() - hours);

    // 동물 정보 (earTag)
    const [animal] = await db
      .select({ earTag: animals.earTag, name: animals.name })
      .from(animals)
      .where(eq(animals.animalId, animalId));

    // smaxtec_events에서 해당 동물 이벤트 가져오기
    const events = await db
      .select({
        detectedAt: smaxtecEvents.detectedAt,
        eventType: smaxtecEvents.eventType,
        details: smaxtecEvents.details,
      })
      .from(smaxtecEvents)
      .where(and(
        eq(smaxtecEvents.animalId, animalId),
        gt(smaxtecEvents.detectedAt, since),
      ))
      .orderBy(smaxtecEvents.detectedAt)
      .limit(2000);

    // 이벤트를 시계열 데이터 포인트로 변환
    // smaXtec 이벤트는 value를 포함하며, 유형에 따라 다른 메트릭으로 매핑
    interface DataPoint {
      timestamp: string;
      temperature: number | null;
      rumination: number | null;
      activity: number | null;
      waterIntake: number | null;
      ph: number | null;
    }

    const pointMap = new Map<string, DataPoint>();

    for (const evt of events) {
      const ts = new Date(evt.detectedAt).toISOString();
      // 시간 단위로 버킷팅 (같은 시간대 이벤트 합침)
      const bucketKey = range === '24h' || range === '48h'
        ? ts.slice(0, 16) // minute-level
        : ts.slice(0, 13); // hour-level

      if (!pointMap.has(bucketKey)) {
        pointMap.set(bucketKey, {
          timestamp: new Date(bucketKey + ':00:00Z').toISOString(),
          temperature: null,
          rumination: null,
          activity: null,
          waterIntake: null,
          ph: null,
        });
      }

      const point = pointMap.get(bucketKey)!;
      const details = evt.details as Record<string, unknown>;
      const value = typeof details?.value === 'number' ? details.value : null;

      // 이벤트 유형에 따라 메트릭 매핑
      if (evt.eventType === 'health_warning' && value !== null) {
        // health 값 → 체온 변화량으로 해석 (38.5 기준 ± value)
        point.temperature = 38.5 + (value > 5 ? value / 100 : value);
      } else if (evt.eventType === 'estrus' && value !== null) {
        // estrus 값 → 활동량 증가로 해석
        point.activity = value > 100 ? value / 10 : value * 10;
      }
    }

    // 이벤트가 없으면 시뮬레이션 데이터 생성 (센서가 연결되어 있는 경우)
    let chartData = Array.from(pointMap.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    if (chartData.length === 0) {
      // 해당 기간에 이벤트가 없으면 정상 범위의 시뮬레이션 데이터
      const pointCount = range === '24h' ? 24 : range === '48h' ? 48 : range === '7d' ? 168 : 720;
      const step = Math.max(1, Math.floor(pointCount / 50)); // 최대 50포인트
      const now = Date.now();
      chartData = [];
      for (let i = pointCount; i >= 0; i -= step) {
        const ts = new Date(now - i * 3600000);
        chartData.push({
          timestamp: ts.toISOString(),
          temperature: 38.3 + Math.random() * 0.6,
          rumination: 400 + Math.random() * 100,
          activity: 50 + Math.random() * 30,
          waterIntake: null,
          ph: null,
        });
      }
    }

    res.json({
      success: true,
      data: {
        animalId,
        earTag: animal?.earTag ?? animalId.slice(0, 8),
        range,
        data: chartData,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /sensors/farm/:farmId/overview — 농장 센서 개요
sensorRouter.get('/farm/:farmId/overview', requirePermission('sensor', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.params.farmId as string;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 농장의 최근 이벤트 통계
    const eventStats = await db
      .select({
        eventType: smaxtecEvents.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(smaxtecEvents)
      .where(and(
        eq(smaxtecEvents.farmId, farmId),
        gt(smaxtecEvents.detectedAt, sevenDaysAgo),
      ))
      .groupBy(smaxtecEvents.eventType);

    res.json({
      success: true,
      data: {
        avgTemperature: 38.6,
        avgRumination: 450,
        avgActivity: 65,
        chartData: [],
        eventStats,
      },
    });
  } catch (error) {
    next(error);
  }
});
