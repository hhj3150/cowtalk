// 방역조치 서비스 — 격리, 소독, 이동제한, 백신, 모니터링 조치 관리

import { getDb } from '../../config/database.js';
import {
  insertAction,
  getActionById,
  listActions,
  updateAction,
  type InsertActionInput,
  type ActionRow,
} from '../../db/repositories/quarantine-action.repository.js';
import { logger } from '../../lib/logger.js';
import type {
  QuarantineActionData,
  QuarantineActionDbType,
  QuarantineActionStatus,
} from '@cowtalk/shared';

// ===========================
// Row → API 응답 변환
// ===========================

function rowToActionData(row: ActionRow): QuarantineActionData {
  return {
    actionId: row.actionId,
    farmId: row.farmId,
    investigationId: row.investigationId,
    clusterId: row.clusterId,
    actionType: row.actionType as QuarantineActionDbType,
    status: row.status as QuarantineActionStatus,
    description: row.description,
    assignedTo: row.assignedTo,
    dueDate: row.dueDate?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ===========================
// 방역조치 생성
// ===========================

export async function createQuarantineAction(
  input: InsertActionInput,
): Promise<QuarantineActionData> {
  const db = getDb();
  const actionId = await insertAction(db, input);
  logger.info({ actionId, farmId: input.farmId, actionType: input.actionType }, '[QuarantineAction] 조치 생성');

  const row = await getActionById(db, actionId);
  if (!row) throw new Error(`Action insert succeeded but read failed: ${actionId}`);

  return rowToActionData(row);
}

// ===========================
// 조치 상세 조회
// ===========================

export async function getQuarantineAction(actionId: string): Promise<QuarantineActionData | null> {
  const db = getDb();
  const row = await getActionById(db, actionId);
  return row ? rowToActionData(row) : null;
}

// ===========================
// 조치 목록 조회 (필터)
// ===========================

export async function listQuarantineActions(filters?: {
  readonly farmId?: string;
  readonly status?: string;
  readonly actionType?: string;
  readonly since?: string;
  readonly limit?: number;
}): Promise<readonly QuarantineActionData[]> {
  const db = getDb();
  const rows = await listActions(db, {
    farmId: filters?.farmId,
    status: filters?.status as QuarantineActionStatus | undefined,
    actionType: filters?.actionType as QuarantineActionDbType | undefined,
    since: filters?.since ? new Date(filters.since) : undefined,
    limit: filters?.limit,
  });
  return rows.map(rowToActionData);
}

// ===========================
// 조치 상태 변경
// ===========================

export async function updateQuarantineAction(
  actionId: string,
  patch: {
    readonly status?: QuarantineActionStatus;
    readonly notes?: string;
    readonly assignedTo?: string;
  },
): Promise<QuarantineActionData | null> {
  const db = getDb();

  logger.info({ actionId, patch }, '[QuarantineAction] 조치 상태 변경');

  const row = await updateAction(db, actionId, patch);
  return row ? rowToActionData(row) : null;
}

// ===========================
// 농장별 대기 조치 수
// ===========================

export async function getPendingActionCount(farmId: string): Promise<number> {
  const db = getDb();
  const rows = await listActions(db, { farmId, status: 'pending', limit: 200 });
  return rows.length;
}
