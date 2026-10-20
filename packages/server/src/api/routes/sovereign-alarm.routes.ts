// 소버린 AI 알람 API
// GET /sovereign-alarms?farmId=&limit=30

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireScopedIds } from '../middleware/animal-access.js';
import { generateSovereignAlarms, saveSovereignAlarmLabel, getSovereignAlarmAccuracy } from '../../services/sovereign-alarm.service.js';
import { computeAccuracyComparison } from '../../services/sovereign-alarm/comparison/accuracy-comparison.service.js';
import { getRuleCount } from '../../services/sovereign-alarm/rules/rule-registry.js';
import { runThresholdLearning, runFarmThresholdLearning } from '../../intelligence-loop/threshold-learner.js';
import { computePatternSummaries, findSimilarPatterns, runPatternMining } from '../../services/sovereign-alarm/pattern-mining.service.js';
import { logger } from '../../lib/logger.js';
import { requirePlatformAdmin } from '../middleware/rbac.js';

export const sovereignAlarmRouter = Router();
sovereignAlarmRouter.use(authenticate);

const querySchema = z.object({
  farmId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

sovereignAlarmRouter.get('/', requireScopedIds([{ source: 'query', field: 'farmId', kind: 'farm' }]), async (req, res, _next) => {
  try {
    const { farmId, limit } = querySchema.parse(req.query);
    const alarms = await generateSovereignAlarms(farmId, limit);
    res.json({ success: true, data: { alarms, generatedAt: new Date().toISOString() } });
  } catch (err) {
    // UI 크래시 방지를 위한 graceful degrade
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, msg }, 'sovereign alarm degraded fallback');
    res.json({ success: true, data: { alarms: [], generatedAt: new Date().toISOString() } });
  }
});

const labelSchema = z.object({
  alarmSignature:    z.string().min(1),
  animalId:          z.string().uuid(),
  farmId:            z.string().uuid(),
  alarmType:         z.string().min(1),
  predictedSeverity: z.string().min(1),
  verdict:           z.enum(['confirmed', 'false_positive', 'modified']),
  notes:             z.string().optional(),
});

sovereignAlarmRouter.post('/label', requireScopedIds([{ source: 'body', field: 'animalId', kind: 'animal' }, { source: 'body', field: 'farmId', kind: 'farm' }]), async (req, res, next) => {
  try {
    const input = labelSchema.parse(req.body);
    await saveSovereignAlarmLabel(input);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'sovereign alarm label error');
    next(err);
  }
});

sovereignAlarmRouter.get('/accuracy', requireScopedIds([{ source: 'query', field: 'farmId', kind: 'farm' }]), async (req, res, next) => {
  try {
    const farmId = z.string().uuid().parse(req.query.farmId);
    const accuracy = await getSovereignAlarmAccuracy(farmId);
    res.json({ success: true, data: accuracy });
  } catch (err) {
    logger.error({ err }, 'sovereign alarm accuracy error');
    next(err);
  }
});

// smaXtec vs CowTalk 정확도 비교
const comparisonSchema = z.object({
  farmId: z.string().uuid(),
  days: z.coerce.number().int().min(1).max(365).default(90),
});

sovereignAlarmRouter.get('/comparison', requireScopedIds([{ source: 'query', field: 'farmId', kind: 'farm' }]), async (req, res, next) => {
  try {
    const { farmId, days } = comparisonSchema.parse(req.query);
    const comparison = await computeAccuracyComparison(farmId, undefined, days);
    res.json({
      success: true,
      data: {
        comparison,
        ruleCount: getRuleCount(),
        periodDays: days,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error({ err }, 'sovereign alarm comparison error');
    next(err);
  }
});

// ── 임계값 학습 (Phase 2) ──

// NEW-04: 알람 임계값(전역·농장)을 바꾸는 학습 실행 — 플랫폼 관리자만 (예전: 로그인한 누구나)
sovereignAlarmRouter.post('/learning/run', requirePlatformAdmin, async (req, res, next) => {
  try {
    const days = z.coerce.number().int().min(1).max(365).default(90).parse(req.query.days ?? 90);
    const farmId = z.string().uuid().optional().parse(req.query.farmId);
    const result = farmId
      ? await runFarmThresholdLearning(farmId, days)
      : await runThresholdLearning(days);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error({ err }, 'threshold learning error');
    next(err);
  }
});

// ── 패턴 마이닝 (Phase 2) ──

sovereignAlarmRouter.get('/patterns/summary', async (req, res, next) => {
  try {
    const farmId = z.string().uuid().optional().parse(req.query.farmId);
    const summaries = await computePatternSummaries(farmId ?? undefined);
    res.json({ success: true, data: { summaries, generatedAt: new Date().toISOString() } });
  } catch (err) {
    logger.error({ err }, 'pattern summary error');
    next(err);
  }
});

const similarSchema = z.object({
  tempMean: z.coerce.number().optional(),
  rumMean: z.coerce.number().optional(),
  actMean: z.coerce.number().optional(),
  tempTrend: z.coerce.number().optional(),
  rumTrend: z.coerce.number().optional(),
  eventType: z.string().optional(),
  topK: z.coerce.number().int().min(1).max(20).default(5),
});

sovereignAlarmRouter.get('/patterns/similar', async (req, res, next) => {
  try {
    const { tempMean, rumMean, actMean, tempTrend, rumTrend, eventType, topK } = similarSchema.parse(req.query);
    const results = await findSimilarPatterns(
      {
        tempMean: tempMean ?? null,
        rumMean: rumMean ?? null,
        actMean: actMean ?? null,
        tempTrend: tempTrend ?? null,
        rumTrend: rumTrend ?? null,
      },
      eventType,
      topK,
    );
    res.json({ success: true, data: { results, generatedAt: new Date().toISOString() } });
  } catch (err) {
    logger.error({ err }, 'similar pattern error');
    next(err);
  }
});

// NEW-04: 전 농장 패턴 마이닝(무거운 배치) — 플랫폼 관리자만
sovereignAlarmRouter.post('/patterns/mine', requirePlatformAdmin, async (_req, res, next) => {
  try {
    const result = await runPatternMining();
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error({ err }, 'pattern mining error');
    next(err);
  }
});
