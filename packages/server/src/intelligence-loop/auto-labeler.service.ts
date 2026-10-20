// Auto-Labeler — smaXtec 이벤트를 기반으로 소버린 알람 레이블 자동 생성
// 146개 농장의 현장 기록(수정·치료·분만·건강 이벤트)이 모두 AI 학습 데이터가 된다.
// 해돋이목장만이 아니라 모든 농장의 레이블이 자산이다.
//
// 원리:
// smaXtec 이벤트(현장 사실) → 같은 개체에 **실제로 발사된** 최근 소버린 알람(predictions)과 매칭
// → confirmed 판정 → sovereignAlarmLabels + outcomeEvaluations 저장 (AI-02: 알람 없는 레이블 생성 금지)

import { getDb } from '../config/database.js';
import { smaxtecEvents, sovereignAlarmLabels } from '../db/schema.js';
import { sql, desc, gte } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { recordOutcome } from './outcome-recorder.js';
import { MATCHED_AUTO_LABEL_PREFIX } from './label-source.js';

// smaXtec 이벤트 → 소버린 알람 타입 매핑
// smaXtec 이벤트가 발생하면, 해당 알람 타입의 소버린 알람을 confirmed로 레이블링
const EVENT_TO_ALARM_TYPE: Readonly<Record<string, readonly string[]>> = {
  // ── 질병 리스크 (기존) ──
  health_warning: ['ketosis_risk', 'mastitis_risk', 'acidosis_risk', 'heat_stress', 'health_general'],
  health_general: ['ketosis_risk', 'mastitis_risk', 'acidosis_risk', 'health_general'],
  clinical_condition: ['ketosis_risk', 'mastitis_risk', 'acidosis_risk', 'laminitis_risk', 'clinical_condition'],

  // ── 체온 (기존 + 신규) ──
  temperature_high: ['mastitis_risk', 'heat_stress', 'temperature_high'],
  temperature_low: ['temperature_low'],
  temperature_warning: ['mastitis_risk', 'heat_stress', 'temperature_warning'],

  // ── 반추 (기존 + 신규) ──
  rumination_decrease: ['ketosis_risk', 'acidosis_risk', 'rumination_decrease'],
  rumination_warning: ['ketosis_risk', 'acidosis_risk', 'rumination_warning'],

  // ── 활동 (기존 + 신규) ──
  activity_increase: ['activity_increase', 'estrus'],
  activity_decrease: ['laminitis_risk', 'ketosis_risk', 'activity_decrease'],
  activity_warning: ['activity_warning'],

  // ── 발정 (신규) ──
  estrus: ['estrus', 'insemination_recommended'],
  estrus_dnb: ['estrus_dnb'],

  // ── 분만 (신규) ──
  calving_detection: ['calving_detection'],
  calving_waiting: ['calving_waiting'],
  calving_confirmation: ['calving_detection'],
  abortion: ['abortion'],

  // ── 사양/음수 (기존 + 신규) ──
  feeding_warning: ['feeding_warning'],
  drinking_warning: ['water_decrease', 'water_increase'],
  drinking_decrease: ['water_decrease'],

  // ── 번식 기록 → 번식 예측 확인 ──
  insemination: ['insemination_recommended'],
  pregnancy_check: ['insemination_recommended'],

  // ── 대사성 질병 (신규) ──
  milk_fever: ['milk_fever', 'downer_cow'],
  retained_placenta: ['retained_placenta'],
  downer_cow: ['downer_cow', 'milk_fever'],

  // ── 관리 이벤트 ──
  dry_off: ['calving_waiting'],
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

      // 3. AI-02: 실제로 발사된 소버린 알람(predictions)과 매칭될 때만 확진 레이블을 만든다.
      //    예전엔 알람 실재를 보지 않고 (알람 유형 × 7일) 시그니처를 전부 'confirmed' 로 넣었다.
      for (const alarmType of alarmTypes) {
        try {
          const matchedPreds = await db.execute(sql`
            SELECT prediction_id, created_at FROM predictions
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

          for (const pred of matchedPreds as unknown as Array<{ prediction_id: string; created_at: string | Date }>) {
            const firedAt = new Date(pred.created_at);
            const inserted = await db.insert(sovereignAlarmLabels).values({
              alarmSignature: fpSignature(evt.animalId, alarmType, firedAt),
              animalId: evt.animalId,
              farmId: evt.farmId,
              alarmType,
              predictedSeverity: 'warning',
              verdict: 'confirmed',
              notes: `${MATCHED_AUTO_LABEL_PREFIX} ${firedAt.toISOString().slice(0, 10)} 알람 → smaXtec ${evt.eventType} (${eventDate.toISOString().slice(0, 10)})`,
            }).onConflictDoNothing().returning({ labelId: sovereignAlarmLabels.labelId });
            labelsCreated += inserted.length;

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

/** FP 라벨 시그니처 — 기존 confirmed 경로와 동일 패턴 (순수 함수 — 테스트 대상) */
export function fpSignature(animalId: string, predictionLabel: string, createdAt: Date): string {
  return `${animalId}:${predictionLabel}:${createdAt.toISOString().slice(0, 10)}`;
}

export interface FpLabelingResult {
  readonly windowDays: number;
  readonly candidates: number;
  readonly labeled: number;
  readonly skippedExisting: number;
  readonly outcomesRecorded: number;
  readonly unlabelableNullAnimal: number;
  readonly durationMs: number;
}

/**
 * DATA-05-B — 오탐(false_positive) 자동 라벨링. 드라이런(DATA-05)의 승격판.
 *
 * 규칙(보수적): 60일 전 ~ windowDays(기본 14)일 전 사이에 발사된 sovereign 알람 중,
 * 같은 개체에서 windowDays 내 smaXtec 이벤트가 **한 건도 없으면** 오탐으로 라벨한다.
 * (관련 유형만이 아니라 어떤 이벤트라도 있으면 스킵 — 오라벨 위험 최소화)
 *
 * 안전장치:
 * - 이미 라벨된 시그니처는 onConflictDoNothing — 전문가/확진 라벨을 절대 덮지 않음
 * - 이미 outcome_evaluations 매칭된 예측은 후보에서 제외
 * - 배치 상한(batchLimit, 오래된 것부터) — 첫 실행 폭주 방지, 잔여는 다음 배치가 처리
 * - animal_id 없는 예측은 라벨 불가 — 별도 카운트로 정직하게 보고
 *
 * 목적: 라벨 표본의 confirmed 100% 편향 해소 → threshold-learner·prompt-improver가
 * 실제 오탐률 기반으로 동작하게 한다.
 */
export async function runFalsePositiveLabeling(
  options?: { windowDays?: number; batchLimit?: number },
): Promise<FpLabelingResult> {
  const windowDays = options?.windowDays ?? 14;
  const batchLimit = Math.min(options?.batchLimit ?? 500, 2000);
  const startedAt = Date.now();
  const db = getDb();

  let labeled = 0;
  let skippedExisting = 0;
  let outcomesRecorded = 0;

  try {
    // 라벨 가능한 오탐 후보 (오래된 것부터 — 배치가 며칠에 걸쳐 따라잡는다)
    const rows = await db.execute(sql`
      SELECT p.prediction_id, p.animal_id, p.farm_id, p.prediction_label, p.severity, p.created_at
      FROM predictions p
      WHERE p.engine_type = 'sovereign_v1'
        AND p.created_at <  NOW() - make_interval(days => ${windowDays}::int)
        AND p.created_at >= NOW() - INTERVAL '60 days'
        AND p.animal_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM smaxtec_events se
          WHERE se.animal_id = p.animal_id
            AND se.detected_at BETWEEN p.created_at
                                   AND p.created_at + make_interval(days => ${windowDays}::int)
        )
        AND NOT EXISTS (
          SELECT 1 FROM outcome_evaluations oe
          WHERE oe.prediction_id = p.prediction_id
        )
      ORDER BY p.created_at ASC
      LIMIT ${batchLimit}
    `);
    const candidates = rows as unknown as Array<{
      prediction_id: string;
      animal_id: string;
      farm_id: string;
      prediction_label: string;
      severity: string | null;
      created_at: string | Date;
    }>;

    for (const cand of candidates) {
      const createdAt = new Date(cand.created_at);
      const signature = fpSignature(cand.animal_id, cand.prediction_label, createdAt);

      const inserted = await db
        .insert(sovereignAlarmLabels)
        .values({
          alarmSignature: signature,
          animalId: cand.animal_id,
          farmId: cand.farm_id,
          alarmType: cand.prediction_label,
          predictedSeverity: cand.severity ?? 'warning',
          verdict: 'false_positive',
          notes: `자동 오탐 라벨: 알람 후 ${windowDays}일간 smaXtec 이벤트 없음 (DATA-05-B)`,
        })
        .onConflictDoNothing()
        .returning({ labelId: sovereignAlarmLabels.labelId });

      if (inserted.length === 0) {
        // 이미 라벨 존재 (전문가/확진 라벨 보호) — outcome도 만들지 않음
        skippedExisting++;
        continue;
      }
      labeled++;

      try {
        await recordOutcome({
          predictionId: cand.prediction_id,
          animalId: cand.animal_id,
          actualOutcome: `no_smaxtec_event_within_${windowDays}d`,
          isCorrect: false,
          matchResult: 'false_positive',
          notes: `자동 오탐 매칭 (DATA-05-B, ${createdAt.toISOString().slice(0, 10)} 알람)`,
        });
        outcomesRecorded++;
      } catch {
        // outcome 중복 등 — 라벨은 이미 생성됨, 비치명
      }
    }

    // animal_id 없는 후보는 라벨 불가 — 규모만 정직하게 보고
    const nullRows = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM predictions p
      WHERE p.engine_type = 'sovereign_v1'
        AND p.created_at <  NOW() - make_interval(days => ${windowDays}::int)
        AND p.created_at >= NOW() - INTERVAL '60 days'
        AND p.animal_id IS NULL
    `);
    const unlabelableNullAnimal = Number((nullRows as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0);

    const result: FpLabelingResult = {
      windowDays,
      candidates: candidates.length,
      labeled,
      skippedExisting,
      outcomesRecorded,
      unlabelableNullAnimal,
      durationMs: Date.now() - startedAt,
    };
    logger.info(result, '[AutoLabeler] FP 라벨링(DATA-05-B) 완료');
    return result;
  } catch (error) {
    logger.error({ error }, '[AutoLabeler] FP 라벨링 실패');
    return {
      windowDays, candidates: 0, labeled, skippedExisting, outcomesRecorded,
      unlabelableNullAnimal: 0, durationMs: Date.now() - startedAt,
    };
  }
}
