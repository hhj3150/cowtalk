// Prediction Bridge — 3개 AI 소스를 predictions 테이블로 연결
// 소버린 알람, 감별진단, 번식 추천이 생성될 때마다 predictions에 저장하여
// outcome-recorder/model-evaluator 파이프라인이 성능 지표를 산출할 수 있게 함.

import { getDb } from '../config/database.js';
import { predictions } from '../db/schema.js';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { kstToday } from '../lib/kst.js';
import { inputHash } from '../lib/provenance.js';
import type { SovereignAlarm } from '../services/sovereign-alarm.service.js';
import type { DifferentialDiagnosisResult } from '../services/vet/differential-diagnosis.service.js';
import type { BreedingAdvice } from '../services/breeding/breeding-advisor.service.js';

// ── 소버린 알람 → prediction ──

/** DI-17: 번식 권고의 근거 발정 이벤트 — 없거나 조회 실패면 null */
export async function findHeatEventId(animalId: string, heatDetectedAt: string): Promise<string | null> {
  const at = new Date(heatDetectedAt);
  if (!Number.isFinite(at.getTime())) return null;
  try {
    const rows = await getDb().execute(sql`
      SELECT event_id FROM smaxtec_events
      WHERE animal_id = ${animalId}
        AND event_type IN ('estrus', 'heat')
        AND detected_at BETWEEN ${new Date(at.getTime() - 12 * 3_600_000).toISOString()}::timestamptz
                            AND ${new Date(at.getTime() + 12 * 3_600_000).toISOString()}::timestamptz
      ORDER BY abs(extract(epoch FROM detected_at - ${at.toISOString()}::timestamptz))
      LIMIT 1
    `) as unknown as Array<{ event_id: string }>;
    return rows[0]?.event_id ?? null;
  } catch (err) {
    logger.debug({ err, animalId }, '[PredBridge] 발정 이벤트 조회 실패 — 출처 없이 저장');
    return null;
  }
}

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
      // D4 (BUG-005): alarm.confidence 는 0-1 canonical. probability/confidence/rankScore 모두 0-1.
      probability: alarm.confidence,
      confidence: alarm.confidence,
      severity: alarm.severity,
      rankScore: alarm.confidence,
      predictionLabel: alarm.type,
      explanationText: alarm.reasoning || alarm.title,
      contributingFeatures: alarm.dataPoints ?? {},
      recommendedAction: alarm.actionPlan || '모니터링 지속',
      modelVersion: 'sovereign-v1.0',
      roleSpecific: {},
      // DI-17: 결정적 알람 서명(animalId:type:날짜) — 같은 알람의 레이블·평가와 짝지을 수 있게
      sourceRef: `sovereign:${alarm.alarmSignature}`.slice(0, 200),
      inputHash: inputHash({ features: alarm.dataPoints ?? {} }),
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
        // D4 (BUG-005): predictions.confidence 는 0-1 canonical.
        // candidate.probability 는 0-100 (diff-diagnosis 내부 단위) → ÷100 변환.
        probability: candidate.probability / 100,
        confidence: candidate.probability / 100,
        severity: result.urgencyLevel === 'immediate' ? 'critical'
          : result.urgencyLevel === 'within_24h' ? 'high' : 'medium',
        rankScore: candidate.probability / 100,
        predictionLabel: candidate.disease,
        explanationText: `${candidate.diseaseKo} (확률 ${candidate.probability}%)`,
        // AI-06: 결측값을 0 으로 저장하면 학습·평가에서 '측정값 0'으로 읽힌다 → null 로 보존
        contributingFeatures: diagnosisFeatures(candidate.evidence),
        recommendedAction: candidate.confirmatoryTests[0] ?? '수의사 진찰 권장',
        modelVersion: 'diff-diag-v1.0',
        // DI-17: 판단에 쓴 센서 구간
        sourceRef: result.sensorWindow ? `sensor_daily_agg:${result.sensorWindow.from}..${result.sensorWindow.to}` : null,
        roleSpecific: {},
        // AI-06: 계산한 데이터 품질을 함께 남긴다 (예전: 버려짐 → 평가 때 근거 부족 예측과 구분 불가)
        dataQuality: { level: result.dataQuality },
        // AI-08: 같은 입력으로 다른 판단이 나왔는지 대조할 수 있게 입력 지문을 남긴다
        inputHash: inputHash({ features: diagnosisFeatures(candidate.evidence), dataQuality: result.dataQuality }),
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

/** 감별진단 근거 → 저장용 특성 (결측은 null) */
export function diagnosisFeatures(
  evidence: ReadonlyArray<{ readonly metric: string; readonly currentValue?: number | null }>,
): Record<string, number | null> {
  return Object.fromEntries(
    evidence.map((e) => [e.metric, typeof e.currentValue === 'number' && Number.isFinite(e.currentValue) ? e.currentValue : null]),
  );
}

// ── 번식 추천 → prediction ──

export async function saveBreedingAdviceAsPrediction(advice: BreedingAdvice): Promise<void> {
  try {
    const db = getDb();
    const today = kstToday();

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
      // D4 (BUG-005): predictions.confidence 는 0-1 canonical.
      probability: 0.85,
      confidence: 0.85,
      severity: 'high',
      rankScore: 0.85,
      predictionLabel: 'insemination_recommended',
      explanationText: advice.optimalTimeLabel,
      contributingFeatures: { windowStart: advice.windowStartHours, windowEnd: advice.windowEndHours },
      inputHash: inputHash({ features: { windowStart: advice.windowStartHours, windowEnd: advice.windowEndHours } }),
      recommendedAction: advice.recommendations[0]
        ? `추천 정액: ${advice.recommendations[0].bullName} (점수 ${advice.recommendations[0].score})`
        : '수정 적기 도달',
      modelVersion: 'breeding-v1.0',
      roleSpecific: {},
      // DI-17: 근거가 된 발정 이벤트 (발정 시각 ±12시간 안 가장 가까운 smaXtec 발정)
      sourceEventId: await findHeatEventId(advice.animalId, advice.heatDetectedAt),
    });

    logger.debug({ animalId: advice.animalId }, '[PredBridge] Breeding advice saved');
  } catch (error) {
    logger.warn({ error, animalId: advice.animalId }, '[PredBridge] Failed to save breeding advice');
  }
}
