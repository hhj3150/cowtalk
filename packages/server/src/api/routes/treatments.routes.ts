// 치료 기록 API — 결과 대기 목록 + 결과 확인
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getDb } from '../../config/database.js';
import { treatments, healthEvents, animals, sensorDailyAgg, type TreatmentDetails } from '../../db/schema.js';
import { eq, desc, gte, and } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export const treatmentsRouter = Router();
treatmentsRouter.use(authenticate);

// ── GET /treatments/pending-outcomes — 결과 대기 목록 ──

treatmentsRouter.get('/pending-outcomes', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 14); // 14일까지 확장 (느린 회복 포함)

    const rows = await db
      .select({
        treatmentId: treatments.treatmentId,
        drug: treatments.drug,
        dosage: treatments.dosage,
        administeredAt: treatments.administeredAt,
        details: treatments.details,
        diagnosis: healthEvents.diagnosis,
        severity: healthEvents.severity,
        animalId: healthEvents.animalId,
        earTag: animals.earTag,
      })
      .from(treatments)
      .innerJoin(healthEvents, eq(treatments.healthEventId, healthEvents.eventId))
      .innerJoin(animals, eq(healthEvents.animalId, animals.animalId))
      .where(gte(treatments.administeredAt, sevenDaysAgo))
      .orderBy(desc(treatments.administeredAt))
      .limit(50);

    // 센서 비교 데이터 추가
    const items = await Promise.all(rows.map(async (row) => {
      const details = row.details as TreatmentDetails | null;
      const preSensor = details?.sensorEvidencePre ?? null;

      // 최근 3일 센서 평균
      const now = new Date();
      const threeDaysAgo = new Date(now);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const fromStr = threeDaysAgo.toISOString().slice(0, 10);

      const sensorRows = await db
        .select({ metricType: sensorDailyAgg.metricType, avg: sensorDailyAgg.avg })
        .from(sensorDailyAgg)
        .where(and(
          eq(sensorDailyAgg.animalId, row.animalId),
          gte(sensorDailyAgg.date, fromStr),
        ))
        .orderBy(desc(sensorDailyAgg.date))
        .limit(15);

      const postTemp = sensorRows.find((s) => s.metricType === 'temperature')?.avg ?? null;
      const postRumination = sensorRows.find((s) => s.metricType === 'rumination')?.avg ?? null;

      // 자동 판정
      const tempNormalized = postTemp !== null && postTemp < 39.3;
      const tempHigh = postTemp !== null && postTemp > 39.8;
      const autoAssessment = tempNormalized ? 'recovered' : tempHigh ? 'worsened' : 'monitoring';

      return {
        treatmentId: row.treatmentId,
        animalId: row.animalId,
        earTag: row.earTag,
        diagnosis: row.diagnosis,
        severity: row.severity,
        drug: row.drug,
        dosage: row.dosage,
        administeredAt: row.administeredAt,
        outcomeStatus: details?.outcomeStatus ?? 'pending',
        withdrawalEndDate: details?.withdrawalEndDate ?? null,
        route: details?.route ?? null,
        sensor: {
          pre: preSensor,
          post: { temp: postTemp, rumination: postRumination },
        },
        autoAssessment,
        daysSinceTreatment: Math.floor((now.getTime() - new Date(row.administeredAt).getTime()) / (24 * 60 * 60 * 1000)),
      };
    }));

    res.json({ success: true, data: items, total: items.length });
  } catch (error) {
    logger.error({ error }, '[Treatments] pending-outcomes 조회 실패');
    next(error);
  }
});

// ── POST /treatments/:treatmentId/outcome — 수의사 결과 확인 ──

treatmentsRouter.post('/:treatmentId/outcome', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const treatmentId = req.params.treatmentId as string;
    const { outcomeStatus, note } = req.body as {
      outcomeStatus: 'recovered' | 'relapsed' | 'worsened';
      note?: string;
    };

    if (!treatmentId || !outcomeStatus) {
      res.status(400).json({ success: false, error: 'treatmentId와 outcomeStatus 필수' });
      return;
    }

    const validStatuses = ['recovered', 'relapsed', 'worsened'] as const;
    if (!validStatuses.includes(outcomeStatus as typeof validStatuses[number])) {
      res.status(400).json({ success: false, error: 'outcomeStatus는 recovered/relapsed/worsened 중 하나' });
      return;
    }

    const db = getDb();
    const userId = (req as unknown as { user?: { userId?: string } }).user?.userId ?? 'unknown';

    // 기존 treatment 조회
    const [existing] = await db
      .select({ treatmentId: treatments.treatmentId, details: treatments.details })
      .from(treatments)
      .where(eq(treatments.treatmentId, treatmentId))
      .limit(1);

    if (!existing) {
      res.status(404).json({ success: false, error: '치료 기록을 찾을 수 없습니다' });
      return;
    }

    const currentDetails = (existing.details ?? {}) as Record<string, unknown>;
    const updatedDetails = {
      ...currentDetails,
      outcomeStatus,
      outcomeDate: new Date().toISOString(),
      outcomeConfirmedBy: userId,
      ...(note ? { outcomeNote: note } : {}),
    } as TreatmentDetails;

    await db.update(treatments)
      .set({ details: updatedDetails })
      .where(eq(treatments.treatmentId, treatmentId));

    logger.info({ treatmentId, outcomeStatus, userId }, '[Treatments] 결과 확인 완료');
    res.json({ success: true, data: { treatmentId, outcomeStatus } });
  } catch (error) {
    logger.error({ error }, '[Treatments] 결과 확인 실패');
    next(error);
  }
});
