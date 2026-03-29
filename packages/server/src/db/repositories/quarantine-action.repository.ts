// 방역조치 DB 리포지토리
// quarantine_actions 테이블 CRUD

import { eq, and, desc, gte } from 'drizzle-orm';
import { quarantineActions, farms } from '../schema.js';
import { getDb } from '../../config/database.js';
import type { QuarantineActionDbType, QuarantineActionStatus } from '@cowtalk/shared';

type DB = ReturnType<typeof getDb>;

// ======================================================================
// INSERT
// ======================================================================

export interface InsertActionInput {
  readonly farmId: string;
  readonly investigationId?: string;
  readonly clusterId?: string;
  readonly actionType: QuarantineActionDbType;
  readonly description: string;
  readonly assignedTo?: string;
  readonly dueDate?: Date;
  readonly notes?: string;
}

export async function insertAction(
  db: DB,
  input: InsertActionInput,
): Promise<string> {
  const [row] = await db
    .insert(quarantineActions)
    .values({
      farmId: input.farmId,
      investigationId: input.investigationId ?? null,
      clusterId: input.clusterId ?? null,
      actionType: input.actionType,
      status: 'pending',
      description: input.description,
      assignedTo: input.assignedTo ?? null,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? '',
    })
    .returning({ actionId: quarantineActions.actionId });

  return row!.actionId;
}

// ======================================================================
// SELECT by ID (with farm JOIN)
// ======================================================================

export async function getActionById(
  db: DB,
  actionId: string,
): Promise<ActionRow | null> {
  const rows = await db
    .select({
      actionId: quarantineActions.actionId,
      farmId: quarantineActions.farmId,
      investigationId: quarantineActions.investigationId,
      clusterId: quarantineActions.clusterId,
      actionType: quarantineActions.actionType,
      status: quarantineActions.status,
      description: quarantineActions.description,
      assignedTo: quarantineActions.assignedTo,
      dueDate: quarantineActions.dueDate,
      completedAt: quarantineActions.completedAt,
      notes: quarantineActions.notes,
      createdAt: quarantineActions.createdAt,
      updatedAt: quarantineActions.updatedAt,
      farmName: farms.name,
    })
    .from(quarantineActions)
    .innerJoin(farms, eq(quarantineActions.farmId, farms.farmId))
    .where(eq(quarantineActions.actionId, actionId))
    .limit(1);

  return rows[0] ?? null;
}

// ======================================================================
// LIST with filters
// ======================================================================

export async function listActions(
  db: DB,
  filters?: {
    readonly farmId?: string;
    readonly status?: QuarantineActionStatus;
    readonly actionType?: QuarantineActionDbType;
    readonly since?: Date;
    readonly limit?: number;
  },
): Promise<readonly ActionRow[]> {
  const conditions: ReturnType<typeof eq>[] = [];

  if (filters?.farmId) {
    conditions.push(eq(quarantineActions.farmId, filters.farmId));
  }
  if (filters?.status) {
    conditions.push(eq(quarantineActions.status, filters.status));
  }
  if (filters?.actionType) {
    conditions.push(eq(quarantineActions.actionType, filters.actionType));
  }
  if (filters?.since) {
    conditions.push(gte(quarantineActions.createdAt, filters.since));
  }

  return db
    .select({
      actionId: quarantineActions.actionId,
      farmId: quarantineActions.farmId,
      investigationId: quarantineActions.investigationId,
      clusterId: quarantineActions.clusterId,
      actionType: quarantineActions.actionType,
      status: quarantineActions.status,
      description: quarantineActions.description,
      assignedTo: quarantineActions.assignedTo,
      dueDate: quarantineActions.dueDate,
      completedAt: quarantineActions.completedAt,
      notes: quarantineActions.notes,
      createdAt: quarantineActions.createdAt,
      updatedAt: quarantineActions.updatedAt,
      farmName: farms.name,
    })
    .from(quarantineActions)
    .innerJoin(farms, eq(quarantineActions.farmId, farms.farmId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(quarantineActions.createdAt))
    .limit(filters?.limit ?? 50);
}

// ======================================================================
// UPDATE status
// ======================================================================

export async function updateAction(
  db: DB,
  actionId: string,
  patch: {
    readonly status?: QuarantineActionStatus;
    readonly notes?: string;
    readonly assignedTo?: string;
    readonly completedAt?: Date;
  },
): Promise<ActionRow | null> {
  const setValues: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.status !== undefined) setValues.status = patch.status;
  if (patch.notes !== undefined) setValues.notes = patch.notes;
  if (patch.assignedTo !== undefined) setValues.assignedTo = patch.assignedTo;
  if (patch.completedAt !== undefined) setValues.completedAt = patch.completedAt;

  // 완료 상태로 변경 시 completedAt 자동 설정
  if (patch.status === 'completed' && !patch.completedAt) {
    setValues.completedAt = new Date();
  }

  const [updated] = await db
    .update(quarantineActions)
    .set(setValues)
    .where(eq(quarantineActions.actionId, actionId))
    .returning({ actionId: quarantineActions.actionId });

  if (!updated) return null;

  return getActionById(db, actionId);
}

// ======================================================================
// Row 타입
// ======================================================================

export interface ActionRow {
  readonly actionId: string;
  readonly farmId: string;
  readonly investigationId: string | null;
  readonly clusterId: string | null;
  readonly actionType: string;
  readonly status: string;
  readonly description: string;
  readonly assignedTo: string | null;
  readonly dueDate: Date | null;
  readonly completedAt: Date | null;
  readonly notes: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly farmName: string;
}
