// 치료 기록 서비스 — tool-executor에서 추출 + 강화
// 기존 healthEvent + treatment 생성 + details jsonb + 휴약 계산 + 센서 스냅샷

import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { animals, healthEvents, treatments, sensorDailyAgg, drugDatabase, type TreatmentDetails } from '../../db/schema.js';
import {
  calculateWithdrawal, resolveWithdrawalDays, kstTimeString,
  type DrugWithdrawalReference,
} from './withdrawal-calculator.js';
import { logger } from '../../lib/logger.js';

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

// ── 약품 DB 휴약 기준 (이름 정확 일치, 대소문자·앞뒤 공백 무시) ──

async function findDrugWithdrawal(drugName: string): Promise<DrugWithdrawalReference | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select({ milkDays: drugDatabase.withdrawalMilkDays, meatDays: drugDatabase.withdrawalMeatDays })
      .from(drugDatabase)
      .where(and(
        eq(drugDatabase.isActive, true),
        sql`lower(trim(${drugDatabase.name})) = lower(trim(${drugName}))`,
      ))
      .limit(1);
    return row ?? null;
  } catch (err) {
    // 조회 실패 시 입력값만으로 계산 — 기록 자체는 막지 않는다 (로그로 드러냄)
    logger.warn({ err, drugName }, '[treatment] 약품 DB 휴약 기준 조회 실패 — 입력값만 사용');
    return null;
  }
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

    // DI-07: 조회·계산(약품 DB·센서 스냅샷)을 먼저 끝내고, health_events·treatments 두 쓰기는 한 트랜잭션으로.
    // 예전엔 두 번째 쓰기가 실패하면 치료 없는 고아 health_event 가 남고, 재시도하면 중복됐다.
    const drug = input.drug;
    let treatmentValues: Omit<typeof treatments.$inferInsert, 'healthEventId'> | undefined;
    let withdrawalEndDate: string | undefined;
    let withdrawalNotes: string[] = [];

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

      // 휴약 계산 (DI-01) — KST 기준, 원유·식육 별도, 입력값과 약품 DB 기준 중 긴 쪽
      const administeredAt = new Date();
      const durDays = input.durationDays ?? 1;
      const resolved = resolveWithdrawalDays(input.withdrawalDays, await findDrugWithdrawal(drug));
      const wdDays = Math.max(resolved.milkDays, resolved.meatDays);
      const milk = calculateWithdrawal(administeredAt, resolved.milkDays, durDays);
      const meat = calculateWithdrawal(administeredAt, resolved.meatDays, durDays);
      const later = milk.withdrawalEndAt >= meat.withdrawalEndAt ? milk : meat;
      withdrawalEndDate = wdDays > 0 ? later.withdrawalEndDate : undefined;
      const endLine = (label: string, days: number, w: typeof milk): string[] =>
        days > 0 ? [`${label} 휴약 종료: ${w.withdrawalEndDate} ${kstTimeString(new Date(w.withdrawalEndAt))} (KST) 이후 출하`] : [];
      withdrawalNotes = [
        ...resolved.warnings,
        ...endLine('원유', resolved.milkDays, milk),
        ...endLine('식육', resolved.meatDays, meat),
      ];

      // 센서 스냅샷
      const sensorEvidencePre = await getSensorSnapshot(animalId, new Date());

      const details: TreatmentDetails = {
        route: input.route,
        frequency: input.frequency,
        durationDays: input.durationDays,
        withdrawalEndDate,
        withdrawal: wdDays > 0 ? {
          milkDays: resolved.milkDays,
          meatDays: resolved.meatDays,
          milkEndAt: milk.withdrawalEndAt,
          meatEndAt: meat.withdrawalEndAt,
          basis: resolved.basis,
          enteredDays: input.withdrawalDays,
        } : undefined,
        clinicalFindings,
        outcomeStatus: 'pending',
        sensorEvidencePre,
      };

      treatmentValues = {
        drug,
        dosage: input.dosage ?? null,
        withdrawalDays: wdDays,
        administeredAt,
        details,
      };
    }

    const written = await db.transaction(async (tx) => {
      const [healthEvent] = await tx.insert(healthEvents).values({
        animalId,
        eventDate: new Date(),
        diagnosis,
        severity,
        notes: input.notes,
      }).returning({ eventId: healthEvents.eventId });
      if (!healthEvent) throw new Error('건강 이벤트 생성 실패');

      let treatmentId: string | undefined;
      if (treatmentValues) {
        const [treatment] = await tx.insert(treatments)
          .values({ ...treatmentValues, healthEventId: healthEvent.eventId })
          .returning({ treatmentId: treatments.treatmentId });
        if (!treatment) throw new Error('치료 기록 생성 실패');
        treatmentId = treatment.treatmentId;
      }
      return { healthEventId: healthEvent.eventId, treatmentId };
    });

    const parts: string[] = [`치료 기록 완료: ${diagnosis}`];
    if (drug) parts.push(`약물: ${drug}`);
    if (input.route) parts.push(`경로: ${input.route}`);
    if (input.frequency) parts.push(`빈도: ${input.frequency}`);
    if (input.durationDays) parts.push(`기간: ${String(input.durationDays)}일`);
    if (withdrawalNotes.length > 0) parts.push(...withdrawalNotes);
    else if (withdrawalEndDate) parts.push(`휴약 종료: ${withdrawalEndDate}`);

    return {
      success: true,
      healthEventId: written.healthEventId,
      treatmentId: written.treatmentId,
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
