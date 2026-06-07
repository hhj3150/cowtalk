// 수의사 진료센터 — 진료기록 저장/조회 서비스
// 저장 시 clinical-context를 snapshot으로 동결한다 (발행 후 불변 보장의 기반).

import { getDb } from '../../config/database.js';
import {
  veterinaryVisits, veterinaryVisitSnapshots, farms, animals, userFarmAccess,
} from '../../db/schema.js';
import { eq, and, desc, isNull, inArray } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { buildClinicalContext, extractSnapshotSections } from './clinical-context.service.js';

// ── 수의사 접근 가능 농장 목록 ──
// farmIds가 토큰에 있으면 그것, 없으면(multi_farm 수의사) userFarmAccess 또는 전체 활성 농장.
export async function listAccessibleFarms(farmIds: readonly string[]): Promise<unknown[]> {
  const db = getDb();
  const base = farmIds.length > 0
    ? db.select().from(farms).where(and(inArray(farms.farmId, [...farmIds]), isNull(farms.deletedAt)))
    : db.select().from(farms).where(isNull(farms.deletedAt));
  const rows = await base.orderBy(desc(farms.updatedAt)).limit(500);
  return rows.map((f) => ({
    farm_id: f.farmId,
    farm_name: f.name,
    owner_name: f.ownerName ?? null,
    address: f.address ?? null,
    region_id: f.regionId ?? null,
    current_head_count: f.currentHeadCount ?? null,
  }));
}

// 수의사가 특정 농장에 접근 가능한지 확인
export async function vetCanAccessFarm(
  farmId: string, farmIds: readonly string[], userId: string,
): Promise<boolean> {
  if (farmIds.includes(farmId)) return true;
  const db = getDb();
  // userFarmAccess에 명시 권한이 있으면 허용
  const access = await db.select({ farmId: userFarmAccess.farmId })
    .from(userFarmAccess)
    .where(and(eq(userFarmAccess.userId, userId), eq(userFarmAccess.farmId, farmId)))
    .limit(1);
  if (access.length > 0) return true;
  // multi_farm 수의사(토큰 farmIds 비어있음)는 전체 농장 접근 허용 (1단계 정책)
  return farmIds.length === 0;
}

// ── 농장 내 개체 목록 (문제 개체 우선) ──
export async function listFarmAnimals(farmId: string): Promise<unknown[]> {
  const db = getDb();
  const rows = await db.select()
    .from(animals)
    .where(and(eq(animals.farmId, farmId), eq(animals.status, 'active'), isNull(animals.deletedAt)))
    .orderBy(desc(animals.updatedAt))
    .limit(2000);
  return rows.map((a) => ({
    animal_id: a.animalId,
    ear_tag_number: a.earTag,
    trace_id: a.traceId ?? null,
    name: a.name ?? null,
    breed: a.breed,
    sex: a.sex,
    parity: a.parity,
    days_in_milk: a.daysInMilk ?? null,
    lactation_status: a.lactationStatus,
    status: a.status,
  }));
}

// ── 진료 저장 (visit + snapshot 동결) ──
export interface SaveVisitInput {
  readonly farmId: string;
  readonly animalId: string;
  readonly veterinarianId: string;
  readonly visitReason?: string;
  readonly chiefComplaint?: string;
  readonly farmerStatement?: string;
  readonly physicalExam?: string;
  readonly clinicalFindings?: string;
  readonly differentialDiagnosis?: string;
  readonly finalDiagnosis?: string;
  readonly treatment?: string;
  readonly prescription?: string;
  readonly medication?: string;
  readonly withdrawalPeriod?: string;
  readonly prognosis?: string;
  readonly followUpDate?: string;
  readonly farmerInstruction?: string;
  readonly quarantineRequired?: boolean;
  readonly veterinarianNotes?: string;
  readonly status?: string;
  readonly inputMethod?: string;
  readonly rawConversationNote?: string;
  readonly fieldVisitLocation?: string;
  // 2단계 — 대화형 기록
  readonly aiStructuredNote?: Record<string, unknown>;
  readonly veterinarianConfirmedAiNote?: boolean;
}

export async function saveVisit(input: SaveVisitInput): Promise<{ visitId: string } | null> {
  const db = getDb();

  // 저장 시점 clinical-context 조립 → snapshot 동결
  const ctx = await buildClinicalContext(input.farmId, input.animalId);
  if (!ctx) {
    return null; // 개체/농장 불일치
  }
  const snap = extractSnapshotSections(ctx);

  const [visit] = await db.insert(veterinaryVisits).values({
    farmId: input.farmId,
    animalId: input.animalId,
    veterinarianId: input.veterinarianId,
    visitReason: input.visitReason ?? null,
    chiefComplaint: input.chiefComplaint ?? null,
    farmerStatement: input.farmerStatement ?? null,
    physicalExam: input.physicalExam ?? null,
    clinicalFindings: input.clinicalFindings ?? null,
    differentialDiagnosis: input.differentialDiagnosis ?? null,
    finalDiagnosis: input.finalDiagnosis ?? null,
    treatment: input.treatment ?? null,
    prescription: input.prescription ?? null,
    medication: input.medication ?? null,
    withdrawalPeriod: input.withdrawalPeriod ?? null,
    prognosis: input.prognosis ?? null,
    followUpDate: input.followUpDate ?? null,
    farmerInstruction: input.farmerInstruction ?? null,
    quarantineRequired: input.quarantineRequired ?? false,
    veterinarianNotes: input.veterinarianNotes ?? null,
    status: input.status ?? 'saved',
    inputMethod: input.inputMethod ?? 'manual',
    rawConversationNote: input.rawConversationNote ?? null,
    fieldVisitLocation: input.fieldVisitLocation ?? null,
    aiStructuredNoteJson: input.aiStructuredNote ?? null,
    veterinarianConfirmedAiNote: input.veterinarianConfirmedAiNote ?? false,
    confirmedAt: input.veterinarianConfirmedAiNote ? new Date() : null,
  }).returning({ visitId: veterinaryVisits.visitId });

  if (!visit) return null;

  await db.insert(veterinaryVisitSnapshots).values({
    visitId: visit.visitId,
    farmSnapshotJson: snap.farmSnapshotJson,
    animalSnapshotJson: snap.animalSnapshotJson,
    reproductionSnapshotJson: snap.reproductionSnapshotJson,
    healthHistorySnapshotJson: snap.healthHistorySnapshotJson,
    sensorSnapshotJson: snap.sensorSnapshotJson,
    publicDataSnapshotJson: snap.publicDataSnapshotJson,
  });

  logger.info({ visitId: visit.visitId, farmId: input.farmId, animalId: input.animalId, vet: input.veterinarianId }, '[VetCenter] 진료기록 저장 + snapshot 동결');
  return { visitId: visit.visitId };
}

// ── 개체별 과거 진료기록 목록 ──
export async function listAnimalVisits(animalId: string): Promise<unknown[]> {
  const db = getDb();
  const rows = await db.select()
    .from(veterinaryVisits)
    .where(eq(veterinaryVisits.animalId, animalId))
    .orderBy(desc(veterinaryVisits.visitDatetime))
    .limit(50);
  return rows.map((v) => ({
    visit_id: v.visitId,
    visit_datetime: v.visitDatetime,
    visit_reason: v.visitReason,
    chief_complaint: v.chiefComplaint,
    final_diagnosis: v.finalDiagnosis,
    treatment: v.treatment,
    prescription: v.prescription,
    withdrawal_period: v.withdrawalPeriod,
    status: v.status,
    input_method: v.inputMethod,
  }));
}

// ── 진료 상세 (snapshot 포함) ──
export async function getVisitDetail(visitId: string): Promise<unknown | null> {
  const db = getDb();
  const [visit] = await db.select().from(veterinaryVisits).where(eq(veterinaryVisits.visitId, visitId)).limit(1);
  if (!visit) return null;
  const [snapshot] = await db.select().from(veterinaryVisitSnapshots).where(eq(veterinaryVisitSnapshots.visitId, visitId)).limit(1);
  return { visit, snapshot: snapshot ?? null };
}
