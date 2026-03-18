// 액션 플랜 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { alerts, farms } from '../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import '../../types/express.d.js';

export const actionRouter = Router();

actionRouter.use(authenticate);

// GET /actions — 액션 플랜 목록 (alerts 기반)
actionRouter.get('/', requirePermission('action', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const farmId = req.query.farmId as string | undefined;
    const status = (req.query.status as string) ?? 'new';

    const conditions = [eq(alerts.status, status)];
    if (farmId) {
      conditions.push(eq(alerts.farmId, farmId));
    }

    const actions = await db
      .select({
        alertId: alerts.alertId,
        alertType: alerts.alertType,
        farmId: alerts.farmId,
        farmName: farms.name,
        animalId: alerts.animalId,
        priority: alerts.priority,
        status: alerts.status,
        title: alerts.title,
        explanation: alerts.explanation,
        recommendedAction: alerts.recommendedAction,
        createdAt: alerts.createdAt,
      })
      .from(alerts)
      .innerJoin(farms, eq(alerts.farmId, farms.farmId))
      .where(and(...conditions))
      .orderBy(desc(alerts.createdAt))
      .limit(50);

    res.json({ success: true, data: actions });
  } catch (error) {
    next(error);
  }
});

// GET /actions/:actionId — 단일 액션 상세
actionRouter.get('/:actionId', requirePermission('action', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const alertId = req.params.actionId as string;

    const [action] = await db
      .select({
        alertId: alerts.alertId,
        alertType: alerts.alertType,
        farmId: alerts.farmId,
        farmName: farms.name,
        animalId: alerts.animalId,
        priority: alerts.priority,
        status: alerts.status,
        title: alerts.title,
        explanation: alerts.explanation,
        recommendedAction: alerts.recommendedAction,
        createdAt: alerts.createdAt,
        updatedAt: alerts.updatedAt,
      })
      .from(alerts)
      .innerJoin(farms, eq(alerts.farmId, farms.farmId))
      .where(eq(alerts.alertId, alertId));

    if (!action) {
      res.status(404).json({ success: false, error: '액션을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data: action });
  } catch (error) {
    next(error);
  }
});

// PATCH /actions/:actionId/status — 액션 상태 변경
actionRouter.patch('/:actionId/status', requirePermission('action', 'update'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const alertId = req.params.actionId as string;
    const { status } = req.body;

    const [updated] = await db
      .update(alerts)
      .set({
        status: status as string,
        updatedAt: new Date(),
      })
      .where(eq(alerts.alertId, alertId))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, error: '액션을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});
