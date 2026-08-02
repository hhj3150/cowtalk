// 예측 라우트 — 실제 DB 쿼리

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { paginationSchema } from '@cowtalk/shared';
import { getDb } from '../../config/database.js';
import { predictions, animals, smaxtecEvents } from '../../db/schema.js';
import { eq, desc, count, sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

// animal + time 조건 빌더
function animalSince(animalId: string, since: Date) {
  return sql`${smaxtecEvents.animalId} = ${animalId} AND ${smaxtecEvents.detectedAt} >= ${since.toISOString()}`;
}
function animalTypesSince(animalId: string, eventType: string, since: Date) {
  return sql`${smaxtecEvents.animalId} = ${animalId} AND ${smaxtecEvents.eventType} = ${eventType} AND ${smaxtecEvents.detectedAt} >= ${since.toISOString()}`;
}

export const predictionRouter = Router();

predictionRouter.use(authenticate);

// GET /predictions — 예측 목록
predictionRouter.get('/', requirePermission('prediction', 'read'), validate({ query: paginationSchema }), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const predictionList = await db
      .select({
        predictionId: predictions.predictionId,
        animalId: predictions.animalId,
        animalName: animals.name,
        animalEarTag: animals.earTag,
        engineType: predictions.engineType,
        predictionLabel: predictions.predictionLabel,
        probability: predictions.probability,
        confidence: predictions.confidence,
        severity: predictions.severity,
        timestamp: predictions.timestamp,
      })
      .from(predictions)
      .leftJoin(animals, eq(predictions.animalId, animals.animalId))
      .orderBy(desc(predictions.timestamp))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db
      .select({ count: count() })
      .from(predictions);

    const total = totalResult?.count ?? 0;

    res.json({
      success: true,
      data: predictionList,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

// GET /predictions/:predictionId — 예측 상세
predictionRouter.get('/:predictionId', requirePermission('prediction', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const predictionId = req.params.predictionId as string;

    const [prediction] = await db
      .select({
        predictionId: predictions.predictionId,
        animalId: predictions.animalId,
        animalName: animals.name,
        engineType: predictions.engineType,
        predictionLabel: predictions.predictionLabel,
        probability: predictions.probability,
        confidence: predictions.confidence,
        severity: predictions.severity,
        explanationText: predictions.explanationText,
        contributingFeatures: predictions.contributingFeatures,
        recommendedAction: predictions.recommendedAction,
        roleSpecific: predictions.roleSpecific,
        timestamp: predictions.timestamp,
      })
      .from(predictions)
      .leftJoin(animals, eq(predictions.animalId, animals.animalId))
      .where(eq(predictions.predictionId, predictionId));

    if (!prediction) {
      res.status(404).json({ success: false, error: '예측을 찾을 수 없습니다' });
      return;
    }

    res.json({ success: true, data: prediction });
  } catch (error) {
    next(error);
  }
});

// ===========================
// AI 예측: 질병 조기 예측 — 72시간 센서 분석
// GET /api/predictions/health/:cowId
// ===========================

predictionRouter.get('/health/:cowId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cowId = req.params.cowId as string;
    const db = getDb();
    const since72h = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const healthTypes = ['temperature_high', 'clinical_condition', 'health_general', 'rumination_decrease', 'activity_decrease'];

    const [recentEvents, baselineEvents] = await Promise.all([
      db.select({ eventType: smaxtecEvents.eventType, severity: smaxtecEvents.severity, detectedAt: smaxtecEvents.detectedAt })
        .from(smaxtecEvents)
        .where(animalSince(cowId, since72h))
        .orderBy(desc(smaxtecEvents.detectedAt)).limit(50),
      db.select({ eventType: smaxtecEvents.eventType, count: count() })
        .from(smaxtecEvents)
        .where(animalSince(cowId, since30d))
        .groupBy(smaxtecEvents.eventType),
    ]);

    const recent72hHealth = recentEvents.filter((e) => healthTypes.includes(e.eventType));
    const criticalCount = recent72hHealth.filter((e) => e.severity === 'critical' || e.severity === 'high').length;
    const baseline30d = baselineEvents.reduce((s, e) => s + (healthTypes.includes(e.eventType) ? Number(e.count) : 0), 0);
    const avgPer72h = (baseline30d / 30) * 3;
    const density = avgPer72h > 0 ? recent72hHealth.length / avgPer72h : 0;

    let riskScore = 0;
    const reasons: string[] = [];

    if (recent72hHealth.length > 0) { riskScore += Math.min(30, recent72hHealth.length * 10); reasons.push(`72시간 내 건강 이벤트 ${recent72hHealth.length}건`); }
    if (criticalCount > 0) { riskScore += Math.min(40, criticalCount * 20); reasons.push(`긴급/높음 ${criticalCount}건`); }
    if (density > 2) { riskScore += 20; reasons.push(`30일 평균 대비 ${density.toFixed(1)}배 집중`); }
    const uniqueTypes = new Set(recent72hHealth.map((e) => e.eventType));
    if (uniqueTypes.size >= 2) { riskScore += 10; reasons.push(`복합 이상: ${Array.from(uniqueTypes).join(', ')}`); }
    riskScore = Math.min(100, riskScore);

    res.json({ success: true, data: {
      animalId: cowId, predictionType: 'health', riskScore,
      riskLevel: riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'warning' : riskScore >= 15 ? 'caution' : 'normal',
      reasons, recentEvents: recent72hHealth.slice(0, 5).map((e) => ({ type: e.eventType, severity: e.severity, at: e.detectedAt?.toISOString() })),
      recommendation: riskScore >= 70 ? '즉시 수의 진료 권장' : riskScore >= 40 ? '24시간 이내 관찰 강화' : '정기 모니터링 유지',
    }});
  } catch (error) { logger.error({ error }, 'Health prediction failed'); next(error); }
});

// ===========================
// AI 예측: 발정 주기 예측
// GET /api/predictions/estrus/:cowId
// ===========================

predictionRouter.get('/estrus/:cowId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cowId = req.params.cowId as string;
    const db = getDb();
    const since1y = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    const estrusEvents = await db.select({ detectedAt: smaxtecEvents.detectedAt })
      .from(smaxtecEvents)
      .where(animalTypesSince(cowId, 'estrus', since1y))
      .orderBy(smaxtecEvents.detectedAt);

    if (estrusEvents.length < 2) {
      res.json({ success: true, data: { animalId: cowId, predictionType: 'estrus', hasData: false, message: '발정 이력 2건 미만 — 주기 예측 불가', estrusCount: estrusEvents.length }});
      return;
    }

    const intervals: number[] = [];
    for (let i = 1; i < estrusEvents.length; i++) {
      const days = (estrusEvents[i]!.detectedAt!.getTime() - estrusEvents[i - 1]!.detectedAt!.getTime()) / (24 * 60 * 60 * 1000);
      if (days >= 15 && days <= 30) intervals.push(days);
    }

    const avgCycle = intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : 21;
    const lastEstrus = estrusEvents[estrusEvents.length - 1]!.detectedAt!;
    const daysSinceLast = (Date.now() - lastEstrus.getTime()) / (24 * 60 * 60 * 1000);
    const nextDate = new Date(lastEstrus.getTime() + avgCycle * 24 * 60 * 60 * 1000);
    const daysUntil = Math.max(0, (nextDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    res.json({ success: true, data: {
      animalId: cowId, predictionType: 'estrus', hasData: true,
      avgCycleDays: Math.round(avgCycle * 10) / 10, estrusCount: estrusEvents.length,
      lastEstrusDate: lastEstrus.toISOString(), daysSinceLastEstrus: Math.round(daysSinceLast),
      nextEstrusDate: nextDate.toISOString(), daysUntilNext: Math.round(daysUntil * 10) / 10,
      isWithin3Days: daysUntil <= 3,
      confidence: intervals.length >= 5 ? 'high' : intervals.length >= 3 ? 'medium' : 'low',
      reasoning: `마지막 발정 후 ${Math.round(daysSinceLast)}일 경과. 평균 주기 ${avgCycle.toFixed(1)}일 (${intervals.length}회 기반). 예상 다음 발정: ${nextDate.toLocaleDateString('ko-KR')}.`,
    }});
  } catch (error) { logger.error({ error }, 'Estrus prediction failed'); next(error); }
});

// ===========================
// AI 예측: 분만 시점 예측
// GET /api/predictions/calving/:cowId
// ===========================

predictionRouter.get('/calving/:cowId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cowId = req.params.cowId as string;
    const db = getDb();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const events = await db.select({ eventType: smaxtecEvents.eventType, severity: smaxtecEvents.severity, detectedAt: smaxtecEvents.detectedAt })
      .from(smaxtecEvents)
      .where(animalSince(cowId, since7d))
      .orderBy(desc(smaxtecEvents.detectedAt));

    const calvingEvents = events.filter((e) => ['calving_detection', 'calving_confirmation', 'calving_waiting'].includes(e.eventType));
    const tempLow = events.filter((e) => e.eventType === 'temperature_low');
    const actDec = events.filter((e) => e.eventType === 'activity_decrease');

    let risk = 'low';
    const reasons: string[] = [];

    if (calvingEvents.length > 0) { risk = 'imminent'; reasons.push(`분만 감지 이벤트 ${calvingEvents.length}건`); }
    else if (tempLow.length > 0 && actDec.length > 0) { risk = 'high'; reasons.push('체온 하강 + 활동 감소 — 12~24시간 내 분만 가능'); }
    else if (tempLow.length > 0) { risk = 'medium'; reasons.push('체온 하강 감지 — 분만 전조 가능'); }

    res.json({ success: true, data: {
      animalId: cowId, predictionType: 'calving', calvingRisk: risk, reasons,
      recommendation: risk === 'imminent' ? '분만실 이동 즉시. 난산 대비 + 초유 준비.' : risk === 'high' ? '12~24시간 내 분만 예상. 야간 긴급도 Critical.' : risk === 'medium' ? '체온 추이 계속 관찰.' : '분만 징후 없음.',
    }});
  } catch (error) { logger.error({ error }, 'Calving prediction failed'); next(error); }
});
