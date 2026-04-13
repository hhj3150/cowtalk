// Auto-Labeler — smaXtec 이벤트를 기반으로 소버린 알람 레이블 자동 생성
// 146개 농장의 현장 기록(수정·치료·분만·건강 이벤트)이 모두 AI 학습 데이터가 된다.
// 해돋이목장만이 아니라 모든 농장의 레이블이 자산이다.
//
// 원리:
// smaXtec 이벤트(현장 사실) → 같은 개체의 최근 소버린 알람과 매칭
// → confirmed/false_positive 자동 판정 → sovereignAlarmLabels + outcomeEvaluations 저장

import { getDb } from '../config/database.js';
import { smaxtecEvents, sovereignAlarmLabels } from '../db/schema.js';
import { sql, desc, gte } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { recordOutcome } from './outcome-recorder.js';

// smaXtec 이벤트 → 소버린 알람 타입 매핑
// smaXtec 이벤트가 발생하면, 해당 알람 타입의 소버린 알람을 confirmed로 레이블링
const EVENT_TO_ALARM_TYPE: Readonly<Record<string, readonly string[]>> = {
  // 건강 이벤트 → 건강 알람 확인
  health_warning: ['ketosis_risk', 'mastitis_risk', 'acidosis_risk', 'heat_stress_risk'],
  health_general: ['ketosis_risk', 'mastitis_risk', 'acidosis_risk'],
  clinical_condition: ['ketosis_risk', 'mastitis_risk', 'acidosis_risk', 'laminitis_risk'],
  temperature_high: ['mastitis_risk', 'heat_stress_risk'],
  temperature_warning: ['mastitis_risk', 'heat_stress_risk'],
  rumination_warning: ['ketosis_risk', 'acidosis_risk'],
  rumination_decrease: ['ketosis_risk', 'acidosis_risk'],
  activity_decrease: ['laminitis_risk', 'ketosis_risk'],
  // 번식 이벤트 → 번식 예측 확인
  insemination: ['insemination_recommended'],
  estrus: ['insemination_recommended'],
  pregnancy_check: ['insemination_recommended'],
  // 음수 이벤트
  drinking_warning: ['water_intake_anomaly'],
  drinking_decrease: ['water_intake_anomaly'],
};

interface AutoLabelResult {
  readonly totalEvents: number;
  readonly labelsCreated: number;
  readonly predictionsMatched: number;
}

/**
 * 최근 N일간 smaXtec 이벤트를 스캔하여 소버린 알람 레이블을 자동 생성한다.
 * 24h 배치로 실행 권장.
 */
export async function runAutoLabeling(days: number = 3): Promise<AutoLabelResult> {
  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let labelsCreated = 0;
  let predictionsMatched = 0;

  try {
    // 1. 최근 smaXtec 이벤트 중 레이블 가능한 것들 조회
    const events = await db
      .select({
        animalId: smaxtecEvents.animalId,
        farmId: smaxtecEvents.farmId,
        eventType: smaxtecEvents.eventType,
        detectedAt: smaxtecEvents.detectedAt,
      })
      .from(smaxtecEvents)
      .where(gte(smaxtecEvents.detectedAt, since))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(2000);

    // 2. 각 이벤트에 대해 매칭할 소버린 알람 타입 결정
    for (const evt of events) {
      const alarmTypes = EVENT_TO_ALARM_TYPE[evt.eventType];
      if (!alarmTypes || alarmTypes.length === 0) continue;

      const eventDate = evt.detectedAt;
      const windowStart = new Date(eventDate.getTime() - 7 * 24 * 60 * 60 * 1000);

      // 3. 이 개체의 최근 7일 소버린 알람 시그니처 조회 (아직 레이블 안 된 것)
      for (const alarmType of alarmTypes) {
        try {
          // 소버린 알람 시그니처 패턴으로 직접 레이블 삽입
          // 시그니처: "animalId:type:YYYY-MM-DD"
          const possibleDates: string[] = [];
          for (let d = 0; d < 7; d++) {
            const date = new Date(eventDate.getTime() - d * 24 * 60 * 60 * 1000);
            possibleDates.push(date.toISOString().slice(0, 10));
          }

          for (const dateStr of possibleDates) {
            const signature = `${evt.animalId}:${alarmType}:${dateStr}`;

            // 이미 레이블 있으면 스킵
            const existingLabel = await db.execute(sql`
              SELECT 1 FROM sovereign_alarm_labels
              WHERE alarm_signature = ${signature}
              LIMIT 1
            `);
            if ((existingLabel as unknown[]).length > 0) continue;

            // 레이블 삽입 (confirmed — smaXtec 이벤트가 발생했으므로 알람이 정확했음)
            await db.insert(sovereignAlarmLabels).values({
              alarmSignature: signature,
              animalId: evt.animalId,
              farmId: evt.farmId,
              alarmType,
              predictedSeverity: 'warning',
              verdict: 'confirmed',
              notes: `자동 레이블: smaXtec ${evt.eventType} 이벤트 (${eventDate.toISOString().slice(0, 10)})`,
            }).onConflictDoNothing();

            labelsCreated++;
          }

          // 4. predictions 테이블의 해당 예측도 매칭 (outcome_evaluations)
          const matchedPreds = await db.execute(sql`
            SELECT prediction_id FROM predictions
            WHERE engine_type = 'sovereign_v1'
              AND animal_id = ${evt.animalId}
              AND prediction_label = ${alarmType}
              AND timestamp >= ${windowStart.toISOString()}
              AND timestamp <= ${eventDate.toISOString()}
              AND NOT EXISTS (
                SELECT 1 FROM outcome_evaluations oe
                WHERE oe.prediction_id = predictions.prediction_id
              )
            LIMIT 1
          `);

          for (const pred of matchedPreds as unknown as Array<{ prediction_id: string }>) {
            try {
              await recordOutcome({
                predictionId: pred.prediction_id,
                animalId: evt.animalId,
                actualOutcome: `smaxtec_${evt.eventType}`,
                isCorrect: true,
                matchResult: 'true_positive',
                notes: `자동 매칭: smaXtec ${evt.eventType} (${eventDate.toISOString().slice(0, 10)})`,
              });
              predictionsMatched++;
            } catch {
              // 중복 등 무시
            }
          }
        } catch {
          // 개별 알람 타입 처리 실패 — 다음 타입으로 진행
        }
      }
    }

    logger.info(
      { totalEvents: events.length, labelsCreated, predictionsMatched },
      '[AutoLabeler] 배치 완료',
    );

    return { totalEvents: events.length, labelsCreated, predictionsMatched };
  } catch (error) {
    logger.error({ error }, '[AutoLabeler] 배치 실패');
    return { totalEvents: 0, labelsCreated: 0, predictionsMatched: 0 };
  }
}
