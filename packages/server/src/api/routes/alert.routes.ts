// 알림 라우트 — smaxtec_events 기반 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { paginationSchema } from '@cowtalk/shared';
import { getDb } from '../../config/database.js';
import { smaxtecEvents, animals, farms } from '../../db/schema.js';
import { eq, and, desc, count } from 'drizzle-orm';
import '../../types/express.d.js';

export const alertRouter = Router();

alertRouter.use(authenticate);

// GET /alerts — 알림 목록 (smaxtec_events 기반)
alertRouter.get('/', requirePermission('alert', 'read'), validate({ query: paginationSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const farmId = req.query.farmId as string | undefined;
    const severity = req.query.severity as string | undefined;
    const acknowledged = req.query.acknowledged as string | undefined;

    const conditions = [];
    if (farmId) {
      conditions.push(eq(smaxtecEvents.farmId, farmId));
    }
    if (severity) {
      conditions.push(eq(smaxtecEvents.severity, severity));
    }
    if (acknowledged !== undefined) {
      conditions.push(eq(smaxtecEvents.acknowledged, acknowledged === 'true'));
    }

    const alerts = await db
      .select({
        alertId: smaxtecEvents.eventId,
        externalEventId: smaxtecEvents.externalEventId,
        animalId: smaxtecEvents.animalId,
        animalName: animals.name,
        animalEarTag: animals.earTag,
        farmId: smaxtecEvents.farmId,
        farmName: farms.name,
        eventType: smaxtecEvents.eventType,
        confidence: smaxtecEvents.confidence,
        severity: smaxtecEvents.severity,
        stage: smaxtecEvents.stage,
        detectedAt: smaxtecEvents.detectedAt,
        details: smaxtecEvents.details,
        acknowledged: smaxtecEvents.acknowledged,
        createdAt: smaxtecEvents.createdAt,
      })
      .from(smaxtecEvents)
      .leftJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .leftJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: count() })
      .from(smaxtecEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = totalResult?.count ?? 0;

    res.json({
      success: true,
      data: alerts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /alerts/:alertId — 단일 알림 상세
alertRouter.get('/:alertId', requirePermission('alert', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const alertId = req.params.alertId as string;

    const [alert] = await db
      .select({
        alertId: smaxtecEvents.eventId,
        externalEventId: smaxtecEvents.externalEventId,
        animalId: smaxtecEvents.animalId,
        animalName: animals.name,
        animalEarTag: animals.earTag,
        farmId: smaxtecEvents.farmId,
        farmName: farms.name,
        eventType: smaxtecEvents.eventType,
        confidence: smaxtecEvents.confidence,
        severity: smaxtecEvents.severity,
        stage: smaxtecEvents.stage,
        detectedAt: smaxtecEvents.detectedAt,
        details: smaxtecEvents.details,
        rawData: smaxtecEvents.rawData,
        acknowledged: smaxtecEvents.acknowledged,
        createdAt: smaxtecEvents.createdAt,
      })
      .from(smaxtecEvents)
      .leftJoin(animals, eq(smaxtecEvents.animalId, animals.animalId))
      .leftJoin(farms, eq(smaxtecEvents.farmId, farms.farmId))
      .where(eq(smaxtecEvents.eventId, alertId));

    if (!alert) {
      res.status(404).json({ success: false, error: '알림을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data: alert });
  } catch (error) {
    next(error);
  }
});

// PATCH /alerts/:alertId/status — 알림 상태 변경 (확인/해제)
alertRouter.patch('/:alertId/status', requirePermission('alert', 'update'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const alertId = req.params.alertId as string;
    const { acknowledged } = req.body as { acknowledged?: boolean };

    if (acknowledged === undefined) {
      res.status(400).json({ success: false, error: 'acknowledged 필드가 필요합니다' });
      return;
    }

    const [updated] = await db
      .update(smaxtecEvents)
      .set({ acknowledged })
      .where(eq(smaxtecEvents.eventId, alertId))
      .returning({ eventId: smaxtecEvents.eventId });

    if (!updated) {
      res.status(404).json({ success: false, error: '알림을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data: { alertId: updated.eventId, acknowledged } });
  } catch (error) {
    next(error);
  }
});
