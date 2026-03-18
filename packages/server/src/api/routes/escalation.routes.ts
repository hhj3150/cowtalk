// 에스컬레이션 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { alertEscalations, alerts, farms } from '../../db/schema.js';
import { eq, and, count, desc } from 'drizzle-orm';
import '../../types/express.d.js';

export const escalationRouter = Router();

escalationRouter.use(authenticate);

// GET /escalation/unacknowledged — 미확인 알림
escalationRouter.get('/unacknowledged', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const unacknowledged = await db
      .select({
        escalationId: alertEscalations.escalationId,
        alertId: alertEscalations.alertId,
        farmId: alertEscalations.farmId,
        farmName: farms.name,
        alertTitle: alerts.title,
        alertPriority: alerts.priority,
        escalationLevel: alertEscalations.escalationLevel,
        escalatedAt: alertEscalations.escalatedAt,
        reason: alertEscalations.reason,
        status: alertEscalations.status,
      })
      .from(alertEscalations)
      .innerJoin(alerts, eq(alertEscalations.alertId, alerts.alertId))
      .innerJoin(farms, eq(alertEscalations.farmId, farms.farmId))
      .where(eq(alertEscalations.status, 'pending'))
      .orderBy(desc(alertEscalations.escalatedAt))
      .limit(50);

    res.json({ success: true, data: unacknowledged });
  } catch (error) {
    next(error);
  }
});

// POST /escalation/acknowledge/:alertId — 알림 확인
escalationRouter.post('/acknowledge/:alertId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const alertId = req.params.alertId as string;
    const { notes } = req.body ?? {};
    const acknowledgedBy = req.user!.userId;

    const [updated] = await db
      .update(alertEscalations)
      .set({
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        acknowledgedBy,
      })
      .where(and(
        eq(alertEscalations.alertId, alertId),
        eq(alertEscalations.status, 'pending'),
      ))
      .returning();

    if (!updated) {
      res.status(404).json({ success: false, error: '미확인 에스컬레이션을 찾을 수 없습니다' });
      return;
    }

    res.json({
      success: true,
      data: { ...updated, notes },
    });
  } catch (error) {
    next(error);
  }
});

// GET /escalation/config — 에스컬레이션 설정 (정적 정의)
escalationRouter.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = {
      levels: [
        { level: 1, target: 'farmer', timeout: 30, label: '농장주' },
        { level: 2, target: 'veterinarian', timeout: 60, label: '수의사' },
        { level: 3, target: 'government_admin', timeout: 120, label: '관리기관' },
      ],
      severityThresholds: {
        critical: { autoEscalateAfterMin: 15 },
        high: { autoEscalateAfterMin: 30 },
        medium: { autoEscalateAfterMin: 60 },
      },
    };

    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
});

// GET /escalation/stats — 에스컬레이션 통계
escalationRouter.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();

    const [pendingResult] = await db
      .select({ count: count() })
      .from(alertEscalations)
      .where(eq(alertEscalations.status, 'pending'));

    const [totalResult] = await db
      .select({ count: count() })
      .from(alertEscalations);

    const [acknowledgedResult] = await db
      .select({ count: count() })
      .from(alertEscalations)
      .where(eq(alertEscalations.status, 'acknowledged'));

    const levelStats = await db
      .select({
        level: alertEscalations.escalationLevel,
        count: count(),
      })
      .from(alertEscalations)
      .groupBy(alertEscalations.escalationLevel);

    const stats = {
      unacknowledgedCount: pendingResult?.count ?? 0,
      totalEscalations: totalResult?.count ?? 0,
      acknowledgedCount: acknowledgedResult?.count ?? 0,
      byLevel: levelStats.map((l) => ({ level: l.level, count: l.count })),
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});
