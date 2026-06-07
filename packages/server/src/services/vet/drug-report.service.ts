// KAHIS 약물사용 보고 — 처방대상 약물 필수기록 강제(오남용 방지) + 상위 DB 보고.
import { getDb } from '../../config/database.js';
import { veterinaryDrugReports } from '../../db/schema.js';
import { eq, desc, inArray } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { getVisitDocumentData, getVetIssuer } from './visit.service.js';
import { getVetProfile } from './vet-profile.service.js';
import { kahisDrugReportConnector } from '../../pipeline/connectors/stubs/kahis-drug-report.connector.js';

export interface DrugReportInput {
  readonly drugName?: string | null;
  readonly drugCode?: string | null;
  readonly isPrescriptionTarget?: boolean;
  readonly dosage?: string | null;
  readonly route?: string | null;
  readonly withdrawalNote?: string | null;
  readonly administeredAt?: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  drugName: '약품명', dosage: '용법·용량', administeredAt: '투약일', withdrawalNote: '휴약기간',
};

// 순수 함수 — 필수 입력 검증. 처방대상 약물은 휴약·용량까지 필수(오남용 방지).
export function validateDrugReport(input: DrugReportInput): { ok: boolean; missing: string[] } {
  const isEmpty = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === '';
  const required = input.isPrescriptionTarget
    ? ['drugName', 'dosage', 'administeredAt', 'withdrawalNote']
    : ['drugName', 'administeredAt'];
  const missing = required
    .filter((f) => isEmpty((input as Record<string, unknown>)[f]))
    .map((f) => FIELD_LABELS[f] ?? f);
  return { ok: missing.length === 0, missing };
}

export interface DrugReportView {
  readonly report_id: string | null;
  readonly visit_id: string;
  readonly drug_name: string | null;
  readonly drug_code: string | null;
  readonly is_prescription_target: boolean;
  readonly dosage: string | null;
  readonly route: string | null;
  readonly withdrawal_note: string | null;
  readonly administered_at: string | null;
  readonly status: string;
  readonly receipt_no: string | null;
  readonly submitted_at: Date | null;
}

function toView(visitId: string, r: typeof veterinaryDrugReports.$inferSelect | undefined): DrugReportView | null {
  if (!r) return null;
  return {
    report_id: r.reportId,
    visit_id: visitId,
    drug_name: r.drugName,
    drug_code: r.drugCode,
    is_prescription_target: r.isPrescriptionTarget,
    dosage: r.dosage,
    route: r.route,
    withdrawal_note: r.withdrawalNote,
    administered_at: r.administeredAt,
    status: r.status,
    receipt_no: r.receiptNo,
    submitted_at: r.submittedAt,
  };
}

export async function getDrugReport(visitId: string): Promise<DrugReportView | null> {
  const db = getDb();
  const [r] = await db.select().from(veterinaryDrugReports)
    .where(eq(veterinaryDrugReports.visitId, visitId)).limit(1);
  return toView(visitId, r);
}

// 약물보고 작성/수정 (draft 저장). farmId/animalId는 visit에서 파생.
export async function upsertDrugReport(
  visitId: string, vetId: string, input: DrugReportInput,
): Promise<{ report: DrugReportView; validation: { ok: boolean; missing: string[] } } | null> {
  const data = await getVisitDocumentData(visitId);
  if (!data) return null;
  const animalId = typeof data.visit.animalId === 'string' ? data.visit.animalId : '';
  const db = getDb();
  const validation = validateDrugReport(input);

  const values = {
    visitId,
    farmId: data.farmId,
    animalId,
    vetId,
    drugName: input.drugName ?? null,
    drugCode: input.drugCode ?? null,
    isPrescriptionTarget: input.isPrescriptionTarget ?? false,
    dosage: input.dosage ?? null,
    route: input.route ?? null,
    withdrawalNote: input.withdrawalNote ?? null,
    administeredAt: input.administeredAt ?? null,
    status: 'draft' as const,
    updatedAt: new Date(),
  };
  await db.insert(veterinaryDrugReports).values(values)
    .onConflictDoUpdate({
      target: veterinaryDrugReports.visitId,
      set: {
        drugName: values.drugName, drugCode: values.drugCode,
        isPrescriptionTarget: values.isPrescriptionTarget, dosage: values.dosage,
        route: values.route, withdrawalNote: values.withdrawalNote,
        administeredAt: values.administeredAt, status: 'draft', updatedAt: values.updatedAt,
      },
    });
  const report = await getDrugReport(visitId);
  return { report: report as DrugReportView, validation };
}

export interface SubmitDrugReportResult {
  readonly status: string;
  readonly receiptNo: string | null;
  readonly testMode?: boolean;
}

// 약물보고 제출 — 필수검증 통과해야 제출 가능(미통과 시 missing 반환).
export async function submitDrugReport(
  visitId: string,
): Promise<{ ok: true; result: SubmitDrugReportResult } | { ok: false; missing: string[] } | null> {
  const db = getDb();
  const [r] = await db.select().from(veterinaryDrugReports)
    .where(eq(veterinaryDrugReports.visitId, visitId)).limit(1);
  if (!r) return null;

  const validation = validateDrugReport({
    drugName: r.drugName, dosage: r.dosage, administeredAt: r.administeredAt,
    withdrawalNote: r.withdrawalNote, isPrescriptionTarget: r.isPrescriptionTarget,
  });
  if (!validation.ok) return { ok: false, missing: validation.missing };

  // KAHIS 페이로드 조립 (이력제번호 + 발행 수의사 면허)
  const docData = await getVisitDocumentData(visitId);
  const animalSnap = (docData?.snapshot?.animalSnapshotJson as Record<string, unknown> | undefined) ?? {};
  const issuer = await getVetIssuer(r.vetId);
  const profile = await getVetProfile(r.vetId);
  const payload: Record<string, unknown> = {
    trace_id: animalSnap.trace_id ?? null,
    ear_tag_number: animalSnap.ear_tag_number ?? null,
    drug_name: r.drugName,
    drug_code: r.drugCode,
    is_prescription_target: r.isPrescriptionTarget,
    dosage: r.dosage,
    route: r.route,
    withdrawal_note: r.withdrawalNote,
    administered_at: r.administeredAt,
    veterinarian: { name: issuer?.name ?? null, license_number: profile?.licenseNumber ?? null },
  };

  const submitRes = await kahisDrugReportConnector.submit(payload);
  const now = new Date();
  const status = submitRes.accepted ? 'accepted' : 'submitted';
  await db.update(veterinaryDrugReports).set({
    status, payloadJson: payload, receiptNo: submitRes.receiptNo,
    submittedAt: now, responseAt: submitRes.accepted ? now : null, updatedAt: now,
  }).where(eq(veterinaryDrugReports.visitId, visitId));

  logger.info({ visitId, receiptNo: submitRes.receiptNo, testMode: submitRes.testMode }, '[VetCenter] KAHIS 약물보고 제출');
  return { ok: true, result: { status, receiptNo: submitRes.receiptNo, testMode: submitRes.testMode } };
}

// 약물보고 목록 (수의사 접근 농장 기준)
export async function listDrugReports(farmIds: readonly string[]): Promise<unknown[]> {
  if (farmIds.length === 0) return [];
  const db = getDb();
  const rows = await db.select().from(veterinaryDrugReports)
    .where(inArray(veterinaryDrugReports.farmId, [...farmIds]))
    .orderBy(desc(veterinaryDrugReports.updatedAt))
    .limit(200);
  return rows.map((r) => ({
    report_id: r.reportId,
    visit_id: r.visitId,
    drug_name: r.drugName,
    is_prescription_target: r.isPrescriptionTarget,
    status: r.status,
    receipt_no: r.receiptNo,
    administered_at: r.administeredAt,
    submitted_at: r.submittedAt,
  }));
}
