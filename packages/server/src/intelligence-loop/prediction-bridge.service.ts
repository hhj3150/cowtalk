// Prediction Bridge — 3개 AI 소스를 predictions 테이블로 연결
// 소버린 알람, 감별진단, 번식 추천이 생성될 때마다 predictions에 저장하여
// outcome-recorder/model-evaluator 파이프라인이 성능 지표를 산출할 수 있게 함.

import { getDb } from '../config/database.js';
import { predictions } from '../db/schema.js';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import type { SovereignAlarm } from '../services/sovereign-alarm.service.js';
import type { DifferentialDiagnosisResult } from '../services/vet/differential-diagnosis.service.js';
import type { BreedingAdvice } from '../services/breeding/breeding-advisor.service.js';

// ── 소버린 알람 → prediction ──

export async function saveSovereignAlarmAsPrediction(alarm: SovereignAlarm): Promise<void> {
  try {
    const db = getDb();

    // 빈 animalId/farmId 방어 (룰 반환 시 빈 문자열 가능)
    if (!alarm.animalId || !alarm.farmId || alarm.animalId.length < 10) {
      return;
    }

    await db.insert(predictions).values({
      engineType: 'sovereign_v1',
      animalId: alarm.animalId,
      farmId: alarm.farmId,
      timestamp: new Date(),
      probability: alarm.confidence / 100,
      confidence: alarm.confidence,
      severity: alarm.severity,
      rankScore: alarm.confidence / 100,
      predictionLabel: alarm.type,
      explanationText: alarm.reasoning || alarm.title,
      contributingFeatures: alarm.dataPoints ?? {},
      recommendedAction: alarm.actionPlan || '모니터링 지속',
      modelVersion: 'sovereign-v1.0',
      roleSpecific: {},
    });

    logger.debug({ animalId: alarm.animalId, type: alarm.type }, '[PredBridge] Sovereign alarm saved');
  } catch (error) {
    logger.warn({ error, animalId: alarm.animalId }, '[PredBridge] Failed to save sovereign alarm');
  }
}

export async function saveSovereignAlarmsBatch(alarms: readonly SovereignAlarm[]): Promise<number> {
  let saved = 0;
  for (const alarm of alarms) {
    await saveSovereignAlarmAsPrediction(alarm);
    saved++;
  }
  return saved;
}

// ── 감별진단 → prediction ──

export async function saveDifferentialDiagnosisAsPrediction(
  result: DifferentialDiagnosisResult,
): Promise<void> {
  if (!result.candidates || result.candidates.length === 0) return;

  try {
    const db = getDb();
    const top3 = result.candidates.slice(0, 3);

    // farmId 조회 (감별진단은 개체 기반이므로 animalId → farmId 연결 필요)
    const farmRow = await db.execute(sql`
      SELECT farm_id FROM animals WHERE animal_id = ${result.animalId} LIMIT 1
    `);
    const farmId = (farmRow as unknown as Array<{ farm_id: string }>)[0]?.farm_id;
    if (!farmId) return;

    for (const candidate of top3) {
      await db.insert(predictions).values({
        engineType: 'diff_diagnosis_v1',
        animalId: result.animalId,
        farmId,
        timestamp: new Date(),
        probability: candidate.probability / 100,
        confidence: candidate.probability,
        severity: result.urgencyLevel === 'immediate' ? 'critical'
          : result.urgencyLevel === 'within_24h' ? 'high' : 'medium',
        rankScore: candidate.probability / 100,
        predictionLabel: candidate.disease,
        explanationText: `${candidate.diseaseKo} (확률 ${candidate.probability}%)`,
        contributingFeatures: Object.fromEntries(
          candidate.evidence.map((e) => [e.metric, e.currentValue ?? 0]),
        ),
        recommendedAction: candidate.confirmatoryTests[0] ?? '수의사 진찰 권장',
        modelVersion: 'diff-diag-v1.0',
        roleSpecific: {},
      });
    }

    logger.debug(
      { animalId: result.animalId, topDisease: top3[0]?.disease },
      '[PredBridge] Differential diagnosis saved',
    );
  } catch (error) {
    logger.warn({ error, animalId: result.animalId }, '[PredBridge] Failed to save diff diagnosis');
  }
}

// ── 번식 추천 → prediction ──

export async function saveBreedingAdviceAsPrediction(advice: BreedingAdvice): Promise<void> {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    // 같은 날 같은 개체는 1회만
    const existing = await db.execute(sql`
      SELECT 1 FROM predictions
      WHERE engine_type = 'breeding_advisor_v1'
        AND animal_id = ${advice.animalId}
        AND timestamp::date = ${today}::date
      LIMIT 1
    `);
    if ((existing as unknown[]).length > 0) return;

    await db.insert(predictions).values({
      engineType: 'breeding_advisor_v1',
      animalId: advice.animalId,
      farmId: advice.farmId,
      timestamp: new Date(),
      probability: 0.85,
      confidence: 85,
      severity: 'high',
      rankScore: 0.85,
      predictionLabel: 'insemination_recommended',
      explanationText: advice.optimalTimeLabel,
      contributingFeatures: { windowStart: advice.windowStartHours, windowEnd: advice.windowEndHours },
      recommendedAction: advice.recommendations[0]
        ? `추천 정액: ${advice.recommendations[0].bullName} (점수 ${advice.recommendations[0].score})`
        : '수정 적기 도달',
      modelVersion: 'breeding-v1.0',
      roleSpecific: {},
    });

    logger.debug({ animalId: advice.animalId }, '[PredBridge] Breeding advice saved');
  } catch (error) {
    logger.warn({ error, animalId: advice.animalId }, '[PredBridge] Failed to save breeding advice');
  }
}
