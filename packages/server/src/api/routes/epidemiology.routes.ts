// 역학 AI API
// GET  /epidemiology/radius/:farmId      — 반경별 위험 분석
// POST /epidemiology/simulate            — SEIR 시뮬레이션
// GET  /epidemiology/contact-network/:farmId — 접촉 네트워크 그래프
// GET  /epidemiology/wind-risk/:farmId   — 바람 방향 전파 위험

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireFarmAccess } from '../middleware/rbac.js';
import { analyzeRadius } from '../../services/epidemiology/radius-analyzer.js';
import { runAndStoreSEIR, runSEIRFeedbackLoop, getCalibratedR0 } from '../../services/epidemiology/seir-feedback.service.js';
import { buildContactNetwork } from '../../services/epidemiology/contact-tracer.js';
import { calculateWindRisk } from '../../services/epidemiology/wind-risk.calculator.js';
import { getDb } from '../../config/database.js';
import { farms } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

export const epidemiologyRouter = Router();

epidemiologyRouter.use(authenticate);

const farmIdSchema = z.string().uuid();

const legalDiseaseSchema = z.enum(['FMD', 'BRUCELLOSIS', 'TB', 'BEF', 'LSD', 'ANTHRAX']);

// ===========================
// GET /radius/:farmId
// ===========================

epidemiologyRouter.get('/radius/:farmId', requireFarmAccess, async (req, res, next) => {
  try {
    const farmId = farmIdSchema.parse(req.params.farmId);

    const radiiParam = req.query.radii;
    let radiiKm: number[] | undefined;
    if (typeof radiiParam === 'string') {
      radiiKm = radiiParam.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);
    }

    const result = await analyzeRadius(farmId, radiiKm);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ===========================
// POST /simulate
// ===========================

const simulateBodySchema = z.object({
  diseaseCode: legalDiseaseSchema,
  totalPopulation: z.number().int().min(1).max(1_000_000),
  totalFarms: z.number().int().min(1).max(100_000),
  initialInfected: z.number().int().min(1).max(1000).optional(),
  simulationDays: z.number().int().min(7).max(365).optional(),
});

epidemiologyRouter.post('/simulate', async (req, res, next) => {
  try {
    const body = simulateBodySchema.parse(req.body);

    // SEIR 피드백 루프: 시뮬레이션 실행 + 결과 DB 저장
    const farmId = typeof req.query.farmId === 'string' ? req.query.farmId : undefined;
    const result = await runAndStoreSEIR({ ...body, farmId });

    logger.info(
      { diseaseCode: body.diseaseCode, pop: body.totalPopulation },
      '[Epidemiology] SEIR simulation run + stored',
    );

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ===========================
// POST /feedback — SEIR 피드백 루프 배치 실행
// ===========================

epidemiologyRouter.post('/feedback', async (_req, res, next) => {
  try {
    const days = 90;
    const result = await runSEIRFeedbackLoop(days);

    logger.info(
      { evaluated: result.predictionsEvaluated, calibrations: result.calibrations.length },
      '[Epidemiology] SEIR feedback loop completed',
    );

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /calibrated-r0 — 보정된 R0 조회
// ===========================

epidemiologyRouter.get('/calibrated-r0', (_req, res) => {
  const calibrated = getCalibratedR0();
  const result: Record<string, number> = {};
  for (const [disease, r0] of calibrated) {
    result[disease] = r0;
  }
  res.json({ success: true, data: { calibratedR0: result, generatedAt: new Date().toISOString() } });
});

// ===========================
// GET /contact-network/:farmId
// ===========================

epidemiologyRouter.get('/contact-network/:farmId', requireFarmAccess, async (req, res, next) => {
  try {
    const farmId = farmIdSchema.parse(req.params.farmId);
    const days = Math.min(Number(req.query.days ?? 30), 90);

    const result = await buildContactNetwork(farmId, days);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ===========================
// GET /wind-risk/:farmId
// ===========================

const windRiskQuerySchema = z.object({
  diseaseCode: legalDiseaseSchema,
  windDeg: z.coerce.number().min(0).max(360),
  windSpeedMs: z.coerce.number().min(0).max(50),
  isDaytime: z.enum(['true', 'false']).optional().transform((v) => v !== 'false'),
});

epidemiologyRouter.get('/wind-risk/:farmId', requireFarmAccess, async (req, res, next) => {
  try {
    const farmId = farmIdSchema.parse(req.params.farmId);
    const query = windRiskQuerySchema.parse(req.query);

    // 중심 농장 + 주변 농장 조회
    const db = getDb();
    const allFarmsRows = await db.select({
      farmId: farms.farmId,
      name: farms.name,
      lat: farms.lat,
      lng: farms.lng,
    })
      .from(farms)
      .where(eq(farms.status, 'active'));

    const sourceFarm = allFarmsRows.find((f) => f.farmId === farmId);
    if (!sourceFarm) {
      res.status(404).json({ success: false, error: { code: 'FARM_NOT_FOUND' } });
      return;
    }

    const nearbyFarms = allFarmsRows
      .filter((f) => f.farmId !== farmId)
      .map((f) => ({
        farmId: f.farmId,
        farmName: f.name,
        lat: f.lat,
        lng: f.lng,
      }));

    const result = calculateWindRisk({
      sourceFarmId: farmId,
      sourceLat: sourceFarm.lat,
      sourceLng: sourceFarm.lng,
      diseaseCode: query.diseaseCode,
      windDeg: query.windDeg,
      windSpeedMs: query.windSpeedMs,
      nearbyFarms,
      isDaytime: query.isDaytime,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});
