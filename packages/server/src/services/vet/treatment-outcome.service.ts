// 치료 결과 추적 배치 — 6시간 주기
// 최근 7일 치료 건의 센서 데이터를 비교하여 회복/악화 자동 판정

import { eq, and, gte, desc } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { treatments, healthEvents, sensorDailyAgg, animals, type TreatmentDetails } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';

// ── 타입 ──

interface SensorAvg {
  readonly temp: number | null;
  readonly rumination: number | null;
  readonly activity: number | null;
}

export type RecoveryAssessment = 'recovered' | 'worsened' | 'monitoring';

export interface OutcomeCheckItem {
  readonly treatmentId: string;
  readonly animalId: string;
  readonly earTag: string;
  readonly diagnosis: string;
  readonly administeredAt: Date;
  readonly preSensor: SensorAvg;
  readonly postSensor: SensorAvg;
  readonly assessment: RecoveryAssessment;
}

export interface OutcomeCheckResult {
  readonly checked: number;
  readonly recovered: number;
  readonly worsened: number;
  readonly monitoring: number;
  readonly items: readonly OutcomeCheckItem[];
}

// ── 회복 판정 (순수 함수) ──

export function assessRecovery(pre: SensorAvg, post: SensorAvg): RecoveryAssessment {
  const tempNormalized = post.temp !== null && post.temp < 39.3;
  const tempStillHigh = post.temp !== null && post.temp > 39.8;

  const ruminationImproved = pre.rumination !== null && post.rumination !== null
    && post.rumination > pre.rumination * 1.1;

  if (tempNormalized && ruminationImproved) return 'recovered';
  if (tempStillHigh) return 'worsened';
  if (tempNormalized) return 'recovered'; // 체온만 정상화되어도 회복 판정
  return 'monitoring';
}

// ── 센서 평균 로드 ──

async function loadSensorAvg(
  animalId: string,
  fromDate: Date,
  _toDate: Date,
): Promise<SensorAvg> {
  const db = getDb();
  const fromStr = fromDate.toISOString().slice(0, 10);

  const rows = await db
    .select({ metricType: sensorDailyAgg.metricType, avg: sensorDailyAgg.avg })
    .from(sensorDailyAgg)
    .where(and(
      eq(sensorDailyAgg.animalId, animalId),
      gte(sensorDailyAgg.date, fromStr),
    ))
    .orderBy(desc(sensorDailyAgg.date))
    .limit(30);

  const byType = new Map<string, number[]>();
  for (const r of rows) {
    const arr = byType.get(r.metricType) ?? [];
    arr.push(r.avg);
    byType.set(r.metricType, arr);
  }

  const avg = (type: string): number | null => {
    const vals = byType.get(type);
    if (!vals || vals.length === 0) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  };

  return { temp: avg('temperature'), rumination: avg('rumination'), activity: avg('activity') };
}

// ── 메인 배치 ──

export async function runTreatmentOutcomeCheck(): Promise<OutcomeCheckResult> {
  const db = getDb();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // 최근 7일 치료 건 중 outcomeStatus가 pending이거나 미설정인 건
  const treatmentRows = await db
    .select({
      treatmentId: treatments.treatmentId,
      animalId: healthEvents.animalId,
      earTag: animals.earTag,
      diagnosis: healthEvents.diagnosis,
      administeredAt: treatments.administeredAt,
      details: treatments.details,
    })
    .from(treatments)
    .innerJoin(healthEvents, eq(treatments.healthEventId, healthEvents.eventId))
    .innerJoin(animals, eq(healthEvents.animalId, animals.animalId))
    .where(gte(treatments.administeredAt, sevenDaysAgo))
    .orderBy(desc(treatments.administeredAt))
    .limit(100);

  const pendingRows = treatmentRows.filter((r) => {
    const details = r.details as TreatmentDetails | null;
    return !details?.outcomeStatus || details.outcomeStatus === 'pending';
  });

  const items: OutcomeCheckItem[] = [];

  for (const row of pendingRows) {
    const adminDate = new Date(row.administeredAt);

    // 치료 전 3일 센서
    const preFrom = new Date(adminDate);
    preFrom.setDate(preFrom.getDate() - 3);
    const preSensor = await loadSensorAvg(row.animalId, preFrom, adminDate);

    // 최근 3일 센서
    const now = new Date();
    const postFrom = new Date(now);
    postFrom.setDate(postFrom.getDate() - 3);
    const postSensor = await loadSensorAvg(row.animalId, postFrom, now);

    const assessment = assessRecovery(preSensor, postSensor);

    // 자동 업데이트: worsened/recovered만 (monitoring은 대기)
    if (assessment !== 'monitoring') {
      const currentDetails = (row.details ?? {}) as Record<string, unknown>;
      const updatedDetails = {
        ...currentDetails,
        sensorEvidencePost: postSensor,
        outcomeStatus: 'pending' as const, // 수의사 확인 전까지 pending 유지
      } as TreatmentDetails;

      await db.update(treatments)
        .set({ details: updatedDetails })
        .where(eq(treatments.treatmentId, row.treatmentId));
    }

    items.push({
      treatmentId: row.treatmentId,
      animalId: row.animalId,
      earTag: row.earTag,
      diagnosis: row.diagnosis,
      administeredAt: adminDate,
      preSensor,
      postSensor,
      assessment,
    });
  }

  const result: OutcomeCheckResult = {
    checked: items.length,
    recovered: items.filter((i) => i.assessment === 'recovered').length,
    worsened: items.filter((i) => i.assessment === 'worsened').length,
    monitoring: items.filter((i) => i.assessment === 'monitoring').length,
    items,
  };

  logger.info({
    checked: result.checked,
    recovered: result.recovered,
    worsened: result.worsened,
    monitoring: result.monitoring,
  }, '[TreatmentOutcome] 배치 완료');

  return result;
}
