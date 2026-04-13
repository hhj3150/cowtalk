/**
 * smaXtec vs CowTalk 정확도 비교 엔진
 * 동일 개체·유사 이벤트 타입에 대해 리드타임 + 일치율 자동 산출
 */

import { getDb } from '../../../config/database.js';
import { sql } from 'drizzle-orm';
import { SENSOR_DETECTABLE_EVENT_TYPES } from '../rules/rule-registry.js';

export interface ComparisonResult {
  readonly eventType: string;
  readonly totalSmaxtecEvents: number;
  readonly matchedByCowTalk: number;
  readonly missedByCowTalk: number;
  readonly falsePositiveCowTalk: number;
  readonly matchRate: number;
  readonly avgLeadTimeHours: number;
  readonly sensitivity: number;
  readonly precision: number;
}

/** smaXtec 이벤트 타입 → 소버린 알람 타입 매핑 */
const EVENT_TO_ALARM_MAP: Record<string, readonly string[]> = {
  // 체온
  temperature_high: ['temperature_high', 'mastitis_risk'],
  temperature_low: ['temperature_low'],
  temperature_warning: ['temperature_warning'],
  // 반추
  rumination_decrease: ['rumination_decrease', 'ketosis_risk', 'acidosis_risk'],
  rumination_warning: ['rumination_warning'],
  // 활동
  activity_increase: ['activity_increase', 'estrus'],
  activity_decrease: ['activity_decrease', 'laminitis_risk'],
  activity_warning: ['activity_warning'],
  // 발정
  estrus: ['estrus', 'activity_increase'],
  estrus_dnb: ['estrus_dnb'],
  // 분만
  calving_detection: ['calving_detection'],
  calving_waiting: ['calving_waiting'],
  abortion: ['abortion'],
  // 건강
  health_general: ['health_general', 'clinical_condition'],
  health_warning: ['health_general'],
  clinical_condition: ['clinical_condition'],
  // 사양
  feeding_warning: ['feeding_warning'],
  // 음수
  water_decrease: ['water_decrease'],
  water_increase: ['water_increase'],
  // 질병 리스크 역방향 (CowTalk → smaXtec 매칭)
  heat_stress: ['heat_stress'],
  ketosis_risk: ['rumination_decrease'],
  mastitis_risk: ['temperature_high'],
  acidosis_risk: ['rumination_decrease'],
  laminitis_risk: ['activity_decrease'],
};

interface SmaxtecEvent {
  readonly eventId: string;
  readonly animalId: string;
  readonly eventType: string;
  readonly detectedAt: Date;
}

interface CowTalkPrediction {
  readonly predictionId: string;
  readonly animalId: string;
  readonly predictionLabel: string;
  readonly timestamp: Date;
}

export async function computeAccuracyComparison(
  farmId: string,
  eventTypes?: readonly string[],
  days = 90,
): Promise<ComparisonResult[]> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86400_000);
  const sinceStr = since.toISOString();

  // 1. smaXtec 이벤트 조회
  const smaxtecEvents: SmaxtecEvent[] = await db.execute(sql`
    SELECT event_id as "eventId", animal_id as "animalId",
           event_type as "eventType", detected_at as "detectedAt"
    FROM smaxtec_events
    WHERE farm_id = ${farmId}
      AND detected_at >= ${sinceStr}::timestamptz
    ORDER BY detected_at DESC
  `) as unknown as SmaxtecEvent[];

  // 2. CowTalk 소버린 알람 predictions 조회
  const cowTalkPredictions: CowTalkPrediction[] = await db.execute(sql`
    SELECT prediction_id as "predictionId", animal_id as "animalId",
           prediction_label as "predictionLabel", timestamp
    FROM predictions
    WHERE farm_id = ${farmId}
      AND engine_type = 'sovereign_v1'
      AND timestamp >= ${sinceStr}::timestamptz
    ORDER BY timestamp DESC
  `) as unknown as CowTalkPrediction[];

  // 3. 타입별 매칭
  const targetTypes = eventTypes ?? SENSOR_DETECTABLE_EVENT_TYPES;
  const results: ComparisonResult[] = [];

  for (const eType of targetTypes) {
    const matchAlarmTypes = EVENT_TO_ALARM_MAP[eType] ?? [eType];

    // 해당 타입의 smaXtec 이벤트
    const sEvents = smaxtecEvents.filter(e => e.eventType === eType);

    // 해당 타입의 CowTalk 알람
    const cAlarms = cowTalkPredictions.filter(p => matchAlarmTypes.includes(p.predictionLabel));

    let matched = 0;
    let missed = 0;
    const leadTimes: number[] = [];
    const matchedCowTalkIds = new Set<string>();

    // smaXtec 이벤트 → CowTalk 매칭 (±72h 윈도우)
    for (const se of sEvents) {
      const seTime = new Date(se.detectedAt).getTime();
      const windowMs = 72 * 3600_000;

      const match = cAlarms.find(ca =>
        ca.animalId === se.animalId
        && Math.abs(new Date(ca.timestamp).getTime() - seTime) <= windowMs
        && !matchedCowTalkIds.has(ca.predictionId),
      );

      if (match) {
        matched++;
        matchedCowTalkIds.add(match.predictionId);
        const leadTimeH = (seTime - new Date(match.timestamp).getTime()) / 3600_000;
        leadTimes.push(leadTimeH);
      } else {
        missed++;
      }
    }

    // CowTalk만 감지 (smaXtec 없음) = false positive
    const falsePositive = cAlarms.filter(ca => !matchedCowTalkIds.has(ca.predictionId)).length;

    const total = sEvents.length;
    const tp = matched;
    const fn = missed;
    const fp = falsePositive;

    results.push({
      eventType: eType,
      totalSmaxtecEvents: total,
      matchedByCowTalk: tp,
      missedByCowTalk: fn,
      falsePositiveCowTalk: fp,
      matchRate: total > 0 ? Math.round((tp / total) * 100) : 0,
      avgLeadTimeHours: leadTimes.length > 0
        ? Math.round((leadTimes.reduce((s, v) => s + v, 0) / leadTimes.length) * 10) / 10
        : 0,
      sensitivity: (tp + fn) > 0 ? Math.round((tp / (tp + fn)) * 100) : 0,
      precision: (tp + fp) > 0 ? Math.round((tp / (tp + fp)) * 100) : 0,
    });
  }

  return results.filter(r => r.totalSmaxtecEvents > 0 || r.falsePositiveCowTalk > 0);
}
