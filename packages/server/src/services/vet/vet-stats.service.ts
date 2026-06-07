// 수의사 진료 통계 — 진료 건수·질병 분포·문서/약물보고 현황 KPI (읽기 전용).
import { getDb } from '../../config/database.js';
import { veterinaryVisits, veterinaryDocumentDeliveries, veterinaryDrugReports } from '../../db/schema.js';
import { and, gte, inArray, isNotNull, eq, sql, desc, type SQL } from 'drizzle-orm';

export interface VetStats {
  readonly total_visits: number;
  readonly visits_30d: number;
  readonly documents_sent: number;
  readonly drug_reports_submitted: number;
  readonly prescription_target_count: number;
  readonly diagnosis_distribution: ReadonlyArray<{ diagnosis: string; count: number }>;
  readonly recent_trend: ReadonlyArray<{ date: string; count: number }>;
}

const ONE = sql<number>`count(*)::int`;

async function scalarCount(where: SQL | undefined, table: 'visits' | 'deliveries' | 'drug'): Promise<number> {
  const db = getDb();
  const from = table === 'visits' ? veterinaryVisits
    : table === 'deliveries' ? veterinaryDocumentDeliveries
    : veterinaryDrugReports;
  const [row] = await db.select({ value: ONE }).from(from).where(where);
  return row?.value ?? 0;
}

// farmIds 비어있으면 전체(multi_farm 수의사) — vetCanAccessFarm와 동일 의미
function visitFarmFilter(farmIds: readonly string[]): SQL | undefined {
  return farmIds.length > 0 ? inArray(veterinaryVisits.farmId, [...farmIds]) : undefined;
}

export async function getVetStats(farmIds: readonly string[]): Promise<VetStats> {
  const db = getDb();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const vFilter = visitFarmFilter(farmIds);
  const dFilter = farmIds.length > 0 ? inArray(veterinaryDocumentDeliveries.farmId, [...farmIds]) : undefined;
  const rFilter = farmIds.length > 0 ? inArray(veterinaryDrugReports.farmId, [...farmIds]) : undefined;

  const totalVisits = await scalarCount(vFilter, 'visits');
  const visits30d = await scalarCount(and(...[gte(veterinaryVisits.visitDatetime, since30), vFilter].filter(Boolean) as SQL[]), 'visits');
  const documentsSent = await scalarCount(dFilter, 'deliveries');
  const drugReportsSubmitted = await scalarCount(
    and(...[inArray(veterinaryDrugReports.status, ['submitted', 'accepted']), rFilter].filter(Boolean) as SQL[]),
    'drug',
  );
  const prescriptionTargetCount = await scalarCount(
    and(...[eq(veterinaryDrugReports.isPrescriptionTarget, true), rFilter].filter(Boolean) as SQL[]),
    'drug',
  );

  // 질병 분포 (최종진단 top 5)
  const diagConds = [isNotNull(veterinaryVisits.finalDiagnosis), sql`btrim(${veterinaryVisits.finalDiagnosis}) <> ''`];
  if (vFilter) diagConds.push(vFilter);
  const diagRows = await db.select({
    diagnosis: veterinaryVisits.finalDiagnosis,
    count: ONE,
  }).from(veterinaryVisits)
    .where(and(...diagConds))
    .groupBy(veterinaryVisits.finalDiagnosis)
    .orderBy(desc(ONE))
    .limit(5);

  // 최근 14일 진료 추이
  const trendConds = [gte(veterinaryVisits.visitDatetime, since14)];
  if (vFilter) trendConds.push(vFilter);
  const dayExpr = sql<string>`to_char(date_trunc('day', ${veterinaryVisits.visitDatetime}), 'YYYY-MM-DD')`;
  const trendRows = await db.select({ date: dayExpr, count: ONE })
    .from(veterinaryVisits)
    .where(and(...trendConds))
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  return {
    total_visits: totalVisits,
    visits_30d: visits30d,
    documents_sent: documentsSent,
    drug_reports_submitted: drugReportsSubmitted,
    prescription_target_count: prescriptionTargetCount,
    diagnosis_distribution: diagRows.map((r) => ({ diagnosis: r.diagnosis ?? '미상', count: r.count })),
    recent_trend: trendRows.map((r) => ({ date: r.date, count: r.count })),
  };
}
