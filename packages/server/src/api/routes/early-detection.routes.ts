// 질병 조기감지 API
// GET  /early-detection/farm/:farmId/alerts    — 활성 경보 목록
// POST /early-detection/evaluate/:animalId     — 단일 개체 DSI 즉시 평가
// GET  /early-detection/farm/:farmId/cluster   — 집단 발열 상태
// GET  /early-detection/farm/:farmId/signature-check — 법정전염병 시그니처 검사

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { getDb } from '../../config/database.js';
import { animals, farms } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { calculateDSI, type DSIResult } from '../../services/earlyDetection/disease-detection.engine.js';
import { evaluateFarmCluster } from '../../services/earlyDetection/farm-cluster.service.js';
import { matchSignature } from '../../services/earlyDetection/disease-signature.db.js';
import { logger } from '../../lib/logger.js';

export const earlyDetectionRouter = Router();

earlyDetectionRouter.use(authenticate);

const farmIdSchema = z.string().uuid();

// ===========================
// GET /farm/:farmId/alerts
// ===========================

earlyDetectionRouter.get('/farm/:farmId/alerts', requireFarmAccess, async (req, res, next) => {
  try {
    const farmId = farmIdSchema.parse(req.params.farmId);
    const db = getDb();

    const farmAnimals = await db.select({
      animalId: animals.animalId,
      earTag: animals.earTag,
    })
      .from(animals)
      .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active')))
      .limit(50);

    const sample = farmAnimals.slice(0, 20);
    const dsiResults = await Promise.allSettled(
      sample.map(async (a) => {
        const dsi = await calculateDSI(a.animalId);
        return { ...dsi, earTag: a.earTag };
      }),
    );

    const alerts = (dsiResults
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<DSIResult & { earTag: string }>).value)
      .filter((v) => v.dsi >= 30))
      .sort((a, b) => b.dsi - a.dsi);

    res.json({
      success: true,
      data: {
        farmId,
        totalEvaluated: sample.length,
        alertCount: alerts.length,
        alerts: alerts.map((a) => ({
          animalId: a.animalId,
          earTag: a.earTag,
          dsi: a.dsi,
          grade: a.grade,
          tempLevel: a.tempLevel,
          triggerEpidemicAlert: a.triggerEpidemicAlert,
          computedAt: a.computedAt,
        })),
        evaluatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ===========================
// POST /evaluate/:animalId
// ===========================

const evaluateBodySchema = z.object({
  peakTemp: z.number().min(35).max(45).optional(),
  onsetHours: z.number().min(0).max(240).optional(),
  ruminationDropPct: z.number().min(0).max(100).optional(),
  hasRuminationCessation: z.boolean().optional(),
}).optional();

earlyDetectionRouter.post('/evaluate/:animalId', async (req, res, next) => {
  try {
    const animalId = z.string().uuid().parse(req.params.animalId);
    const body = evaluateBodySchema.parse(req.body);

    const dsiResult = await calculateDSI(animalId);

    let diseaseMatches: ReturnType<typeof matchSignature> | null = null;
    if (body?.peakTemp && body?.ruminationDropPct !== undefined) {
      diseaseMatches = matchSignature(
        dsiResult.tempScore > 0 ? 39.5 : 38.5,
        body.peakTemp,
        body.onsetHours ?? 12,
        body.ruminationDropPct,
        body.hasRuminationCessation ?? false,
      ).filter((m) => m.similarity >= 30);
    }

    res.json({ success: true, data: { dsi: dsiResult, diseaseMatches } });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /farm/:farmId/cluster
// ===========================

earlyDetectionRouter.get('/farm/:farmId/cluster', requireFarmAccess, async (req, res, next) => {
  try {
    const farmId = farmIdSchema.parse(req.params.farmId);
    const ambientTemp = req.query.ambientTemp ? Number(req.query.ambientTemp) : undefined;
    const result = await evaluateFarmCluster(farmId, ambientTemp);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /farm/:farmId/signature-check
// ===========================

earlyDetectionRouter.get('/farm/:farmId/signature-check', requireFarmAccess, async (req, res, next) => {
  try {
    const farmId = farmIdSchema.parse(req.params.farmId);
    const db = getDb();

    const farmRow = await db.select({ name: farms.name })
      .from(farms)
      .where(eq(farms.farmId, farmId))
      .limit(1);

    if (!farmRow[0]) {
      res.status(404).json({ success: false, error: { code: 'FARM_NOT_FOUND' } });
      return;
    }

    const peakTemp = Number(req.query.peakTemp ?? 40.0);
    const ruminationDropPct = Number(req.query.ruminationDropPct ?? 30);
    const onsetHours = Number(req.query.onsetHours ?? 12);
    const hasRuminationCessation = req.query.cessation === 'true';

    const matches = matchSignature(peakTemp, peakTemp, onsetHours, ruminationDropPct, hasRuminationCessation);
    const topMatches = matches.filter((m) => m.similarity >= 30).slice(0, 3);

    logger.info({ farmId, topMatch: topMatches[0]?.code }, '[EarlyDetection] Signature check');

    res.json({
      success: true,
      data: {
        farmId,
        farmName: farmRow[0].name,
        topMatches,
        requiresImmediateAction: topMatches.some((m) => m.requiresVetAlert),
        requiresKahisReport: topMatches.some((m) => m.requiresKahisReport),
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});
