// KAHIS 보고서 DB 리포지토리
// kahis_reports 테이블 CRUD

import { eq, and, desc, gte } from 'drizzle-orm';
import { kahisReports, investigations, farms } from '../schema.js';
import { getDb } from '../../config/database.js';
import type { KahisReportType, KahisReportStatus } from '@cowtalk/shared';

type DB = ReturnType<typeof getDb>;

// ======================================================================
// INSERT
// ======================================================================

export interface InsertReportInput {
  readonly investigationId: string;
  readonly reportType: KahisReportType;
  readonly diseaseCode: string;
  readonly diseaseName: string;
  readonly reportData?: Record<string, unknown>;
  readonly submittedBy?: string;
}

export async function insertReport(
  db: DB,
  input: InsertReportInput,
): Promise<string> {
  const [row] = await db
    .insert(kahisReports)
    .values({
      investigationId: input.investigationId,
      reportType: input.reportType,
      diseaseCode: input.diseaseCode,
      diseaseName: input.diseaseName,
      status: 'draft',
      reportData: input.reportData ?? {},
      submittedBy: input.submittedBy ?? null,
    })
    .returning({ reportId: kahisReports.reportId });

  return row!.reportId;
}

// ======================================================================
// SELECT by ID (with investigation + farm JOIN)
// ======================================================================

export async function getReportById(
  db: DB,
  reportId: string,
): Promise<ReportRow | null> {
  const rows = await db
    .select({
      reportId: kahisReports.reportId,
      investigationId: kahisReports.investigationId,
      reportType: kahisReports.reportType,
      diseaseCode: kahisReports.diseaseCode,
      diseaseName: kahisReports.diseaseName,
      status: kahisReports.status,
      submittedAt: kahisReports.submittedAt,
      responseAt: kahisReports.responseAt,
      reportData: kahisReports.reportData,
      submittedBy: kahisReports.submittedBy,
      createdAt: kahisReports.createdAt,
      updatedAt: kahisReports.updatedAt,
      farmId: investigations.farmId,
      farmName: farms.name,
    })
    .from(kahisReports)
    .innerJoin(investigations, eq(kahisReports.investigationId, investigations.investigationId))
    .innerJoin(farms, eq(investigations.farmId, farms.farmId))
    .where(eq(kahisReports.reportId, reportId))
    .limit(1);

  return rows[0] ?? null;
}

// ======================================================================
// LIST with filters
// ======================================================================

export async function listReports(
  db: DB,
  filters?: {
    readonly investigationId?: string;
    readonly status?: KahisReportStatus;
    readonly reportType?: KahisReportType;
    readonly since?: Date;
    readonly limit?: number;
  },
): Promise<readonly ReportRow[]> {
  const conditions: ReturnType<typeof eq>[] = [];

  if (filters?.investigationId) {
    conditions.push(eq(kahisReports.investigationId, filters.investigationId));
  }
  if (filters?.status) {
    conditions.push(eq(kahisReports.status, filters.status));
  }
  if (filters?.reportType) {
    conditions.push(eq(kahisReports.reportType, filters.reportType));
  }
  if (filters?.since) {
    conditions.push(gte(kahisReports.createdAt, filters.since));
  }

  return db
    .select({
      reportId: kahisReports.reportId,
      investigationId: kahisReports.investigationId,
      reportType: kahisReports.reportType,
      diseaseCode: kahisReports.diseaseCode,
      diseaseName: kahisReports.diseaseName,
      status: kahisReports.status,
      submittedAt: kahisReports.submittedAt,
      responseAt: kahisReports.responseAt,
      reportData: kahisReports.reportData,
      submittedBy: kahisReports.submittedBy,
      createdAt: kahisReports.createdAt,
      updatedAt: kahisReports.updatedAt,
      farmId: investigations.farmId,
      farmName: farms.name,
    })
    .from(kahisReports)
    .innerJoin(investigations, eq(kahisReports.investigationId, investigations.investigationId))
    .innerJoin(farms, eq(investigations.farmId, farms.farmId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(kahisReports.createdAt))
    .limit(filters?.limit ?? 50);
}

// ======================================================================
// UPDATE
// ======================================================================

export async function updateReport(
  db: DB,
  reportId: string,
  patch: {
    readonly status?: KahisReportStatus;
    readonly reportData?: Record<string, unknown>;
    readonly submittedAt?: Date;
    readonly responseAt?: Date;
  },
): Promise<ReportRow | null> {
  const setValues: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.status !== undefined) setValues.status = patch.status;
  if (patch.reportData !== undefined) setValues.reportData = patch.reportData;
  if (patch.submittedAt !== undefined) setValues.submittedAt = patch.submittedAt;
  if (patch.responseAt !== undefined) setValues.responseAt = patch.responseAt;

  // submitted 상태로 변경 시 submittedAt 자동 설정
  if (patch.status === 'submitted' && !patch.submittedAt) {
    setValues.submittedAt = new Date();
  }

  const [updated] = await db
    .update(kahisReports)
    .set(setValues)
    .where(eq(kahisReports.reportId, reportId))
    .returning({ reportId: kahisReports.reportId });

  if (!updated) return null;

  return getReportById(db, reportId);
}

// ======================================================================
// Row 타입
// ======================================================================

export interface ReportRow {
  readonly reportId: string;
  readonly investigationId: string;
  readonly reportType: string;
  readonly diseaseCode: string;
  readonly diseaseName: string;
  readonly status: string;
  readonly submittedAt: Date | null;
  readonly responseAt: Date | null;
  readonly reportData: unknown;
  readonly submittedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly farmId: string;
  readonly farmName: string;
}
