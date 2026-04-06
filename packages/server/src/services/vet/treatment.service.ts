// 치료 기록 서비스 — tool-executor에서 추출 + 강화
// 기존 healthEvent + treatment 생성 + details jsonb + 휴약 계산 + 센서 스냅샷

import { eq, and, desc, gte } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { animals, healthEvents, treatments, sensorDailyAgg, type TreatmentDetails } from '../../db/schema.js';
import { calculateWithdrawal } from './withdrawal-calculator.js';

// ── 입력 타입 ──

export interface RecordTreatmentInput {
  readonly animalId: string;
  readonly diagnosis: string;
  readonly severity?: string;
  readonly notes?: string;
  readonly drug?: string;
  readonly dosage?: string;
  readonly withdrawalDays?: number;
  // 강화 필드
  readonly route?: 'IM' | 'IV' | 'SC' | 'PO' | 'topical' | 'intramammary';
  readonly frequency?: string;
  readonly durationDays?: number;
  readonly rectalTemp?: number;
  readonly cmtResult?: string;
  readonly bcs?: number;
  readonly hydrationLevel?: 'normal' | 'mild' | 'moderate' | 'severe';
  readonly affectedQuarter?: string;
}

// ── 출력 타입 ──

export interface RecordTreatmentResult {
  readonly success: boolean;
  readonly healthEventId?: string;
  readonly treatmentId?: string;
  readonly diagnosis: string;
  readonly severity: string;
  readonly drug: string;
  readonly withdrawalEndDate?: string;
  readonly message: string;
  readonly error?: string;
}

// ── 센서 스냅샷 ──

async function getSensorSnapshot(
  animalId: string,
  beforeDate: Date,
): Promise<TreatmentDetails['sensorEvidencePre']> {
  const db = getDb();
  const threeDaysAgo = new Date(beforeDate);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const dateStr = threeDaysAgo.toISOString().slice(0, 10);

  const rows = await db
    .select({ metricType: sensorDailyAgg.metricType, avg: sensorDailyAgg.avg })
    .from(sensorDailyAgg)
    .where(and(
      eq(sensorDailyAgg.animalId, animalId),
      gte(sensorDailyAgg.date, dateStr),
    ))
    .orderBy(desc(sensorDailyAgg.date))
    .limit(30);

  if (rows.length === 0) return undefined;

  const byType = new Map<string, number[]>();
  for (const r of rows) {
    const arr = byType.get(r.metricType) ?? [];
    arr.push(r.avg);
    byType.set(r.metricType, arr);
  }

  const avgOf = (type: string): number | undefined => {
    const vals = byType.get(type);
    if (!vals || vals.length === 0) return undefined;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  };

  return {
    temp: avgOf('temperature'),
    rumination: avgOf('rumination'),
    activity: avgOf('activity'),
  };
}

// ── 메인 서비스 ──

export async function recordTreatment(input: RecordTreatmentInput): Promise<RecordTreatmentResult> {
  const db = getDb();
  const { animalId, diagnosis } = input;

  if (!animalId || !diagnosis) {
    return { success: false, diagnosis: '', severity: '', drug: '', message: '', error: 'animalId와 diagnosis는 필수입니다.' };
  }

  // 개체 확인
  const animalRows = await db
    .select({ animalId: animals.animalId, farmId: animals.farmId })
    .from(animals)
    .where(and(eq(animals.animalId, animalId), eq(animals.status, 'active')))
    .limit(1);

  if (animalRows.length === 0) {
    return { success: false, diagnosis, severity: '', drug: '', message: '', error: '해당 개체를 찾을 수 없습니다.' };
  }

  try {
    const severity = input.severity ?? 'medium';

    // 1. healthEvent 생성
    const [healthEvent] = await db.insert(healthEvents).values({
      animalId,
      eventDate: new Date(),
      diagnosis,
      severity,
      notes: input.notes,
    }).returning({ eventId: healthEvents.eventId });

    if (!healthEvent) {
      return { success: false, diagnosis, severity, drug: '', message: '', error: '건강 이벤트 생성 실패' };
    }

    // 2. treatment 기록 (약물 정보가 있는 경우)
    const drug = input.drug;
    let treatmentId: string | undefined;
    let withdrawalEndDate: string | undefined;

    if (drug) {
      // 임상소견 조합
      const clinicalFindings: TreatmentDetails['clinicalFindings'] =
        (input.rectalTemp || input.cmtResult || input.bcs || input.hydrationLevel || input.affectedQuarter)
          ? {
              rectalTemp: input.rectalTemp,
              cmtResult: input.cmtResult,
              bcs: input.bcs,
              hydrationLevel: input.hydrationLevel,
              affectedQuarter: input.affectedQuarter,
            }
          : undefined;

      // 휴약 계산
      const wdDays = input.withdrawalDays ?? 0;
      const durDays = input.durationDays ?? 1;
      const withdrawal = wdDays > 0 ? calculateWithdrawal(new Date(), wdDays, durDays) : undefined;
      withdrawalEndDate = withdrawal?.withdrawalEndDate;

      // 센서 스냅샷
      const sensorEvidencePre = await getSensorSnapshot(animalId, new Date());

      const details: TreatmentDetails = {
        route: input.route,
        frequency: input.frequency,
        durationDays: input.durationDays,
        withdrawalEndDate,
        clinicalFindings,
        outcomeStatus: 'pending',
        sensorEvidencePre,
      };

      const [treatment] = await db.insert(treatments).values({
        healthEventId: healthEvent.eventId,
        drug,
        dosage: input.dosage ?? null,
        withdrawalDays: wdDays,
        administeredAt: new Date(),
        details,
      }).returning({ treatmentId: treatments.treatmentId });

      treatmentId = treatment?.treatmentId;
    }

    const parts: string[] = [`치료 기록 완료: ${diagnosis}`];
    if (drug) parts.push(`약물: ${drug}`);
    if (input.route) parts.push(`경로: ${input.route}`);
    if (input.frequency) parts.push(`빈도: ${input.frequency}`);
    if (input.durationDays) parts.push(`기간: ${String(input.durationDays)}일`);
    if (withdrawalEndDate) parts.push(`휴약 종료: ${withdrawalEndDate}`);

    return {
      success: true,
      healthEventId: healthEvent.eventId,
      treatmentId,
      diagnosis,
      severity,
      drug: drug ?? '미투약',
      withdrawalEndDate,
      message: parts.join('. '),
    };
  } catch (error) {
    return {
      success: false, diagnosis, severity: input.severity ?? 'medium',
      drug: input.drug ?? '', message: '',
      error: `치료 기록 실패: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
