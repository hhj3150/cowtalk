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

interface FpCandidateDryRunResult {
  readonly windowDays: number;
  readonly oldAlarmsTotal: number;
  readonly oldAlarmsMatched: number;
  readonly fpCandidates: number;
  readonly fpCandidatePct: number;
  readonly sampleSignatures: string[];
  readonly durationMs: number;
}

/**
 * DATA-05 드라이런 — false_positive 후보 규모만 카운트한다. DB 쓰기 없음.
 *
 * windowDays(기본 14) 이전에 발사된 sovereign 알람 중, 같은 개체에서
 * windowDays 내 smaXtec 이벤트가 한 건도 매칭되지 않은 알람을 "잠재 false_positive"로
 * 집계만 한다. sovereign_alarm_labels / outcome_evaluations 등 어떤 테이블에도 INSERT 하지 않는다.
 * 실제 fp_candidate 라벨링은 후속 사이클(DATA-05-B)에서 진행한다.
 *
 * animal_id IS NULL 인 predictions 행은 매칭이 불가능하므로 잠재 FP 에 계상한다(B3와 동일 시맨틱).
 */
export async function countFalsePositiveCandidates(
  options?: { windowDays?: number; sampleLimit?: number },
): Promise<FpCandidateDryRunResult> {
  const windowDays = options?.windowDays ?? 14;
  const sampleLimit = options?.sampleLimit ?? 5;
  const startedAt = Date.now();
  const db = getDb();

  // 60일 전 ~ windowDays일 전 사이에 발사된 sovereign 알람을 대상으로 한다.
  const totalsRows = await db.execute(sql`
    WITH old_alarms AS (
      SELECT p.prediction_id, p.animal_id, p.created_at
      FROM predictions p
      WHERE p.engine_type = 'sovereign_v1'
        AND p.created_at <  NOW() - make_interval(days => ${windowDays}::int)
        AND p.created_at >= NOW() - INTERVAL '60 days'
    ),
    matched AS (
      SELECT DISTINCT oa.prediction_id
      FROM old_alarms oa
      JOIN smaxtec_events se
        ON se.animal_id = oa.animal_id
       AND se.detected_at BETWEEN oa.created_at
                              AND oa.created_at + make_interval(days => ${windowDays}::int)
    )
    SELECT
      (SELECT COUNT(*) FROM old_alarms) AS old_total,
      (SELECT COUNT(*) FROM matched)    AS old_matched
  `);

  const totals = (totalsRows as unknown as Array<{ old_total: string | number; old_matched: string | number }>)[0];
  const oldAlarmsTotal = Number(totals?.old_total ?? 0);
  const oldAlarmsMatched = Number(totals?.old_matched ?? 0);
  const fpCandidates = oldAlarmsTotal - oldAlarmsMatched;
  const fpCandidatePct = Math.round((100 * fpCandidates / Math.max(oldAlarmsTotal, 1)) * 100) / 100;

  // 매칭 안 된(잠재 FP) 알람 중 최근 sampleLimit 개의 시그니처 표본.
  // 시그니처 패턴은 기존 auto-labeler 와 동일: `${animalId}:${alarmType}:${YYYY-MM-DD}`
  const sampleRows = await db.execute(sql`
    SELECT p.animal_id, p.prediction_label, p.created_at
    FROM predictions p
    WHERE p.engine_type = 'sovereign_v1'
      AND p.created_at <  NOW() - make_interval(days => ${windowDays}::int)
      AND p.created_at >= NOW() - INTERVAL '60 days'
      AND NOT EXISTS (
        SELECT 1 FROM smaxtec_events se
        WHERE se.animal_id = p.animal_id
          AND se.detected_at BETWEEN p.created_at
                                 AND p.created_at + make_interval(days => ${windowDays}::int)
      )
    ORDER BY p.created_at DESC
    LIMIT ${sampleLimit}
  `);

  const sampleSignatures = (sampleRows as unknown as Array<{
    animal_id: string | null;
    prediction_label: string | null;
    created_at: string | Date;
  }>).map((r) => {
    const dateStr = new Date(r.created_at).toISOString().slice(0, 10);
    return `${r.animal_id ?? 'null'}:${r.prediction_label ?? 'unknown'}:${dateStr}`;
  });

  return {
    windowDays,
    oldAlarmsTotal,
    oldAlarmsMatched,
    fpCandidates,
    fpCandidatePct,
    sampleSignatures,
    durationMs: Date.now() - startedAt,
  };
}

// DATA-05-B: fp_candidate 시범 적재 1회당 최대 행 수 — 외부에서 어떤 값을 넘겨도 이 cap을 넘을 수 없다.
const HARD_PILOT_CAP = 100;

interface FpPilotResult {
  readonly windowDays: number;
  readonly pilotLimit: number;
  readonly examined: number;
  readonly inserted: number;
  readonly skippedConflict: number;
  readonly skippedNullAnimal: number;
  readonly insertedSamples: string[];
  readonly durationMs: number;
}

/**
 * DATA-05-B 시범 적재 — countFalsePositiveCandidates 가 측정한 후보군 중
 * 최대 HARD_PILOT_CAP(100)건만 verdict='fp_candidate' 로 1회 적재한다.
 *
 * 안전마진:
 *  - HARD_PILOT_CAP=100 으로 함수 내부에서 강제 cap (외부 인자로 우회 불가)
 *  - verdict='fp_candidate' (varchar(20) 호환, 'false_positive' 와 명확히 구분)
 *  - onConflictDoNothing — 기존 confirmed 라벨 보존
 *  - animal_id NULL 행은 시그니처 생성 불가 → skip
 *
 * 자동 배치에서 호출 금지. master(government_admin) 명시 트리거 전용.
 */
export async function insertFalsePositiveCandidatesPilot(
  options?: { windowDays?: number; pilotLimit?: number },
): Promise<FpPilotResult> {
  const windowDays = options?.windowDays ?? 14;
  const effectiveLimit = Math.min(options?.pilotLimit ?? HARD_PILOT_CAP, HARD_PILOT_CAP);
  const startedAt = Date.now();
  const db = getDb();

  // 60일 전 ~ windowDays일 전 발사된 sovereign 알람 중, windowDays 내 smaXtec 미매칭분을
  // 가장 오래된 순으로 effectiveLimit 개 가져온다.
  const rows = await db.execute(sql`
    SELECT p.prediction_id, p.animal_id, p.farm_id, p.prediction_label, p.severity, p.created_at
    FROM predictions p
    WHERE p.engine_type = 'sovereign_v1'
      AND p.created_at <  NOW() - make_interval(days => ${windowDays}::int)
      AND p.created_at >= NOW() - INTERVAL '60 days'
      AND NOT EXISTS (
        SELECT 1 FROM smaxtec_events se
        WHERE se.animal_id = p.animal_id
          AND se.detected_at BETWEEN p.created_at
                                 AND p.created_at + make_interval(days => ${windowDays}::int)
      )
    ORDER BY p.created_at ASC
    LIMIT ${effectiveLimit}
  `);

  const candidates = rows as unknown as Array<{
    prediction_id: string;
    animal_id: string | null;
    farm_id: string;
    prediction_label: string | null;
    severity: string | null;
    created_at: string | Date;
  }>;

  let inserted = 0;
  let skippedConflict = 0;
  let skippedNullAnimal = 0;
  const insertedSamples: string[] = [];

  for (const c of candidates) {
    if (!c.animal_id) {
      skippedNullAnimal++;
      continue;
    }
    const created = new Date(c.created_at);
    const dateStr = created.toISOString().slice(0, 10);
    // alarm_type 컬럼은 varchar(50) — prediction_label(varchar(200)) 방어 truncate.
    const alarmType = (c.prediction_label ?? 'unknown').slice(0, 50);
    const signature = `${c.animal_id}:${alarmType}:${dateStr}`;

    try {
      const insertedRows = await db
        .insert(sovereignAlarmLabels)
        .values({
          alarmSignature: signature,
          animalId: c.animal_id,
          farmId: c.farm_id,
          alarmType,
          predictedSeverity: (c.severity ?? 'warning').slice(0, 20),
          verdict: 'fp_candidate',
          notes: `fp_candidate (DATA-05-B 시범, windowDays=${windowDays}, smaxtec 매칭 0건, alarm_created=${created.toISOString()})`,
        })
        .onConflictDoNothing()
        .returning({ alarmSignature: sovereignAlarmLabels.alarmSignature });

      if (insertedRows.length > 0) {
        inserted++;
        if (insertedSamples.length < 10) insertedSamples.push(signature);
      } else {
        skippedConflict++;
      }
    } catch (err) {
      // 개별 행 INSERT 실패 — 배치 전체 중단하지 않고 다음 행으로 진행 (CLAUDE.md 규칙10: 로깅 필수).
      logger.warn({ err, signature }, '[FP-pilot] 행 INSERT 실패');
    }
  }

  return {
    windowDays,
    pilotLimit: effectiveLimit,
    examined: candidates.length,
    inserted,
    skippedConflict,
    skippedNullAnimal,
    insertedSamples,
    durationMs: Date.now() - startedAt,
  };
}
