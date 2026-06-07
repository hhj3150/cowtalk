// 수의사 진료센터 — clinical-context 조립 서비스
// 개체 진료차트 진입 시, 기존 CowTalk 데이터에서 6개 snapshot을 자동 조립한다.
// 수의사는 이 데이터를 다시 입력하지 않는다. 진료 저장 시 이 snapshot이 동결된다.

import { getDb } from '../../config/database.js';
import {
  farms, animals, breedingEvents, pregnancyChecks, calvingEvents,
  healthEvents, treatments, clinicalObservations, vaccineRecords,
  smaxtecEvents, sensorDailyAgg, veterinaryVisits,
} from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';

// ── 타입 ──

export interface ClinicalContext {
  readonly farm_snapshot: Record<string, unknown>;
  readonly animal_snapshot: Record<string, unknown>;
  readonly reproduction_snapshot: Record<string, unknown>;
  readonly health_history_snapshot: Record<string, unknown>;
  readonly sensor_snapshot: Record<string, unknown>;
  readonly public_data_snapshot: Record<string, unknown>;
  readonly recent_visits: readonly Record<string, unknown>[];
  readonly active_alerts: readonly Record<string, unknown>[];
  readonly current_withdrawal_status: Record<string, unknown>;
  readonly document_history: readonly Record<string, unknown>[];
  readonly external_sync_status: Record<string, unknown>;
}

function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
}

// ── 메인: clinical-context 조립 ──

export async function buildClinicalContext(
  farmId: string,
  animalId: string,
): Promise<ClinicalContext | null> {
  const db = getDb();

  // 개체 + 농장 확인 (병렬)
  const [animalRows, farmRows] = await Promise.all([
    db.select().from(animals).where(eq(animals.animalId, animalId)).limit(1),
    db.select().from(farms).where(eq(farms.farmId, farmId)).limit(1),
  ]);

  const animal = animalRows[0];
  const farm = farmRows[0];
  if (!animal || !farm) {
    return null;
  }
  // 개체가 해당 농장 소속인지 검증
  if (animal.farmId !== farmId) {
    return null;
  }

  // 나머지 데이터 병렬 조회
  const [
    breedingRows, pregnancyRows, calvingRows,
    healthRows, treatmentRows, observationRows, vaccineRows,
    sensorEventRows, sensorAggRows, recentVisitRows,
  ] = await Promise.all([
    db.select().from(breedingEvents).where(eq(breedingEvents.animalId, animalId)).orderBy(desc(breedingEvents.eventDate)).limit(20),
    db.select().from(pregnancyChecks).where(eq(pregnancyChecks.animalId, animalId)).orderBy(desc(pregnancyChecks.checkDate)).limit(10),
    db.select().from(calvingEvents).where(eq(calvingEvents.animalId, animalId)).orderBy(desc(calvingEvents.calvingDate)).limit(5),
    db.select().from(healthEvents).where(eq(healthEvents.animalId, animalId)).orderBy(desc(healthEvents.eventDate)).limit(20),
    db.select().from(treatments).orderBy(desc(treatments.administeredAt)).limit(200),
    db.select().from(clinicalObservations).where(eq(clinicalObservations.animalId, animalId)).orderBy(desc(clinicalObservations.observedAt)).limit(20),
    db.select().from(vaccineRecords).where(eq(vaccineRecords.animalId, animalId)).orderBy(desc(vaccineRecords.administeredAt)).limit(20),
    db.select().from(smaxtecEvents).where(eq(smaxtecEvents.animalId, animalId)).orderBy(desc(smaxtecEvents.detectedAt)).limit(20),
    db.select().from(sensorDailyAgg).where(eq(sensorDailyAgg.animalId, animalId)).orderBy(desc(sensorDailyAgg.date)).limit(60),
    db.select().from(veterinaryVisits).where(eq(veterinaryVisits.animalId, animalId)).orderBy(desc(veterinaryVisits.visitDatetime)).limit(10),
  ]);

  // 치료는 healthEvent 경유라 이 개체 건강이벤트에 연결된 것만 필터
  const healthEventIds = new Set(healthRows.map((h) => h.eventId));
  const animalTreatments = treatmentRows.filter((t) => t.healthEventId && healthEventIds.has(t.healthEventId));

  // ── farm_snapshot ──
  const farm_snapshot = {
    farm_id: farm.farmId,
    farm_name: farm.name,
    owner_name: farm.ownerName ?? null,
    owner_phone: farm.phone ?? null,
    address: farm.address ?? null,
    jurisdiction: farm.regionId ?? null,
    farm_license_number: farm.externalId ?? null,
    assigned_veterinarian: null,
  };

  // ── animal_snapshot ──
  const birthDate = animal.birthDate ? new Date(animal.birthDate) : null;
  const lastCalving = calvingRows[0]?.calvingDate ? new Date(calvingRows[0].calvingDate) : null;
  const lastInsemination = breedingRows.find((b) => b.type === 'insemination')?.eventDate ?? null;
  const animal_snapshot = {
    animal_id: animal.animalId,
    ear_tag_number: animal.earTag,
    trace_id: animal.traceId ?? null,
    name: animal.name ?? null,
    species: 'cattle',
    breed: animal.breed,
    breed_type: animal.breedType,
    sex: animal.sex,
    birth_date: animal.birthDate ?? null,
    age_months: birthDate ? monthsBetween(birthDate, new Date()) : null,
    parity: animal.parity,
    days_in_milk: animal.daysInMilk ?? null,
    lactation_status: animal.lactationStatus,
    last_insemination_date: lastInsemination,
    last_calving_date: lastCalving ? lastCalving.toISOString() : null,
    current_status: animal.status,
  };

  // ── reproduction_snapshot ──
  const lastEstrus = breedingRows.find((b) => b.type === 'heat')?.eventDate ?? null;
  const inseminationCount = breedingRows.filter((b) => b.type === 'insemination').length;
  const lastPregnancy = pregnancyRows[0];
  const daysPostpartum = lastCalving ? Math.floor((Date.now() - lastCalving.getTime()) / 86_400_000) : null;
  const reproduction_snapshot = {
    last_estrus_date: lastEstrus,
    last_insemination_date: lastInsemination,
    insemination_count: inseminationCount,
    pregnancy_check_result: lastPregnancy?.result ?? null,
    days_open: null,
    days_postpartum: daysPostpartum,
    reproductive_alerts: sensorEventRows
      .filter((e) => ['estrus', 'no_insemination', 'abortion'].includes(e.eventType))
      .slice(0, 5)
      .map((e) => ({ type: e.eventType, detected_at: e.detectedAt })),
  };

  // ── health_history_snapshot ──
  const health_history_snapshot = {
    previous_diagnoses: healthRows.map((h) => ({ diagnosis: h.diagnosis, severity: h.severity, date: h.eventDate, notes: h.notes ?? null })),
    previous_treatments: animalTreatments.map((t) => ({ drug: t.drug, dosage: t.dosage ?? null, withdrawal_days: t.withdrawalDays, administered_at: t.administeredAt })),
    previous_prescriptions: animalTreatments.filter((t) => t.drug).map((t) => ({ drug: t.drug, dosage: t.dosage ?? null })),
    vaccination_history: vaccineRows.map((v) => ({ vaccine_name: v.vaccineName, batch_number: v.batchNumber ?? null, administered_at: v.administeredAt })),
    antibiotic_history: animalTreatments.filter((t) => t.withdrawalDays && t.withdrawalDays > 0).map((t) => ({ drug: t.drug, withdrawal_days: t.withdrawalDays, administered_at: t.administeredAt })),
    withdrawal_history: animalTreatments.filter((t) => t.withdrawalDays && t.withdrawalDays > 0).map((t) => ({ drug: t.drug, withdrawal_days: t.withdrawalDays, administered_at: t.administeredAt })),
    chronic_conditions: [],
    field_observations: observationRows.map((o) => ({ type: o.observationType, description: o.description, observed_at: o.observedAt })),
  };

  // ── sensor_snapshot ── (일별 집계에서 최신 + 7일 추이)
  const byMetric = (metric: string) => sensorAggRows.filter((r) => r.metricType === metric);
  const latestOf = (metric: string): number | null => {
    const rows = byMetric(metric);
    return rows[0]?.avg ?? null;
  };
  const trendOf = (metric: string): string => {
    const rows = byMetric(metric);
    if (rows.length < 2) return 'insufficient_data';
    const latest = rows[0]?.avg ?? null;
    const prev7 = rows.slice(1, 8);
    if (latest === null || prev7.length === 0) return 'insufficient_data';
    const avgPrev = prev7.reduce((s, r) => s + (r.avg ?? 0), 0) / prev7.length;
    const diff = latest - avgPrev;
    if (Math.abs(diff) < 0.01 * Math.abs(avgPrev || 1)) return 'stable';
    return diff > 0 ? 'rising' : 'falling';
  };
  const latestAlert = sensorEventRows.find((e) => !e.acknowledged) ?? sensorEventRows[0] ?? null;
  const sensor_snapshot = {
    measured_at: sensorAggRows[0]?.date ?? null,
    temperature: latestOf('temperature'),
    temperature_24h_trend: trendOf('temperature'),
    temperature_7d_trend: trendOf('temperature'),
    rumination: latestOf('rumination'),
    rumination_trend: trendOf('rumination'),
    activity: latestOf('activity'),
    activity_trend: trendOf('activity'),
    alert_type: latestAlert?.eventType ?? null,
    alert_level: latestAlert?.severity ?? null,
    trend_summary: `체온 ${trendOf('temperature')}, 반추 ${trendOf('rumination')}, 활동 ${trendOf('activity')}`,
  };

  // ── public_data_snapshot ── (1단계: traceId만 실데이터, 나머지 placeholder)
  const public_data_snapshot = {
    livestock_traceability_id: animal.traceId ?? null,
    registered_farm_id: farm.externalId ?? null,
    movement_history: [],
    quarantine_status: 'unknown',
    jurisdiction: farm.regionId ?? null,
    notifiable_disease_warning: null,
    _note: '공공데이터 API는 향후 connector로 연동 예정 (1단계 placeholder)',
  };

  // ── recent_visits ──
  const recent_visits = recentVisitRows.map((v) => ({
    visit_id: v.visitId,
    visit_datetime: v.visitDatetime,
    final_diagnosis: v.finalDiagnosis ?? null,
    chief_complaint: v.chiefComplaint ?? null,
    status: v.status,
  }));

  // ── active_alerts ── (미확인 센서 이벤트)
  const active_alerts = sensorEventRows
    .filter((e) => !e.acknowledged)
    .slice(0, 10)
    .map((e) => ({ event_id: e.eventId, event_type: e.eventType, severity: e.severity, detected_at: e.detectedAt }));

  // ── current_withdrawal_status ── (진행 중 휴약기 추정)
  const now = Date.now();
  const activeWithdrawals = animalTreatments
    .filter((t) => {
      if (!t.withdrawalDays || t.withdrawalDays <= 0 || !t.administeredAt) return false;
      const end = new Date(t.administeredAt).getTime() + t.withdrawalDays * 86_400_000;
      return end > now;
    })
    .map((t) => {
      const end = new Date(t.administeredAt!).getTime() + (t.withdrawalDays ?? 0) * 86_400_000;
      return { drug: t.drug, withdrawal_days: t.withdrawalDays, ends_at: new Date(end).toISOString(), days_remaining: Math.ceil((end - now) / 86_400_000) };
    });
  const current_withdrawal_status = {
    in_withdrawal: activeWithdrawals.length > 0,
    active_withdrawals: activeWithdrawals,
  };

  return {
    farm_snapshot,
    animal_snapshot,
    reproduction_snapshot,
    health_history_snapshot,
    sensor_snapshot,
    public_data_snapshot,
    recent_visits,
    active_alerts,
    current_withdrawal_status,
    document_history: [], // 4단계 문서 모듈에서 채움
    external_sync_status: {}, // 8단계 외부연동에서 채움
  };
}

// 진료 저장 시 snapshot으로 동결할 6개 섹션만 추출
export function extractSnapshotSections(ctx: ClinicalContext): {
  farmSnapshotJson: Record<string, unknown>;
  animalSnapshotJson: Record<string, unknown>;
  reproductionSnapshotJson: Record<string, unknown>;
  healthHistorySnapshotJson: Record<string, unknown>;
  sensorSnapshotJson: Record<string, unknown>;
  publicDataSnapshotJson: Record<string, unknown>;
} {
  return {
    farmSnapshotJson: ctx.farm_snapshot,
    animalSnapshotJson: ctx.animal_snapshot,
    reproductionSnapshotJson: ctx.reproduction_snapshot,
    healthHistorySnapshotJson: ctx.health_history_snapshot,
    sensorSnapshotJson: ctx.sensor_snapshot,
    publicDataSnapshotJson: ctx.public_data_snapshot,
  };
}

void logger;
