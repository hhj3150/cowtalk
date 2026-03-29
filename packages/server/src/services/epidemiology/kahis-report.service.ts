// KAHIS 보고서 서비스 — 보고서 생성·조회·상태관리
// 역학조사(investigation) 연결 + 제출 워크플로우

import { getDb } from '../../config/database.js';
import {
  insertReport,
  getReportById,
  listReports,
  updateReport,
  type InsertReportInput,
  type ReportRow,
} from '../../db/repositories/kahis-report.repository.js';
import { logger } from '../../lib/logger.js';
import type {
  KahisReportData,
  KahisReportType,
  KahisReportStatus,
} from '@cowtalk/shared';

// ===========================
// Row → API 응답 변환
// ===========================

function rowToReportData(row: ReportRow): KahisReportData {
  return {
    reportId: row.reportId,
    investigationId: row.investigationId,
    reportType: row.reportType as KahisReportType,
    diseaseCode: row.diseaseCode,
    diseaseName: row.diseaseName,
    status: row.status as KahisReportStatus,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    responseAt: row.responseAt?.toISOString() ?? null,
    reportData: (row.reportData ?? {}) as Record<string, unknown>,
    submittedBy: row.submittedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ===========================
// 보고서 생성
// ===========================

export async function createKahisReport(
  input: InsertReportInput,
): Promise<KahisReportData> {
  const db = getDb();
  const reportId = await insertReport(db, input);
  logger.info({ reportId, investigationId: input.investigationId, reportType: input.reportType }, '[KahisReport] 보고서 생성');

  const row = await getReportById(db, reportId);
  if (!row) throw new Error(`Report insert succeeded but read failed: ${reportId}`);

  return rowToReportData(row);
}

// ===========================
// 보고서 상세 조회
// ===========================

export async function getKahisReport(reportId: string): Promise<KahisReportData | null> {
  const db = getDb();
  const row = await getReportById(db, reportId);
  return row ? rowToReportData(row) : null;
}

// ===========================
// 보고서 목록 조회 (필터)
// ===========================

export async function listKahisReports(filters?: {
  readonly investigationId?: string;
  readonly status?: string;
  readonly reportType?: string;
  readonly since?: string;
  readonly limit?: number;
}): Promise<readonly KahisReportData[]> {
  const db = getDb();
  const rows = await listReports(db, {
    investigationId: filters?.investigationId,
    status: filters?.status as KahisReportStatus | undefined,
    reportType: filters?.reportType as KahisReportType | undefined,
    since: filters?.since ? new Date(filters.since) : undefined,
    limit: filters?.limit,
  });
  return rows.map(rowToReportData);
}

// ===========================
// 보고서 상태 변경
// ===========================

export async function updateKahisReport(
  reportId: string,
  patch: {
    readonly status?: KahisReportStatus;
    readonly reportData?: Record<string, unknown>;
  },
): Promise<KahisReportData | null> {
  const db = getDb();

  logger.info({ reportId, patch }, '[KahisReport] 보고서 상태 변경');

  const row = await updateReport(db, reportId, patch);
  return row ? rowToReportData(row) : null;
}

// ===========================
// 역학조사별 보고서 목록
// ===========================

export async function getReportsByInvestigation(
  investigationId: string,
): Promise<readonly KahisReportData[]> {
  return listKahisReports({ investigationId });
}
