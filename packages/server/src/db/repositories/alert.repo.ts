// Alert Repository

import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../../config/database';
import { alerts, alertHistory } from '../schema';
import { buildPaginatedResult } from './base.repo';
import type { PaginationParams, PaginatedResult } from '@cowtalk/shared';

type AlertRow = typeof alerts.$inferSelect;

export interface AlertQueryParams extends PaginationParams {
  readonly farmId?: string;
  readonly animalId?: string;
  readonly alertType?: string;
  readonly priority?: string;
  readonly status?: string;
}

export async function findAlerts(
  params: AlertQueryParams,
): Promise<PaginatedResult<AlertRow>> {
  const db = getDb();
  const conditions = [];

  if (params.farmId) {
    conditions.push(eq(alerts.farmId, params.farmId));
  }
  if (params.animalId) {
    conditions.push(eq(alerts.animalId, params.animalId));
  }
  if (params.alertType) {
    conditions.push(eq(alerts.alertType, params.alertType));
  }
  if (params.priority) {
    conditions.push(eq(alerts.priority, params.priority));
  }
  if (params.status) {
    conditions.push(eq(alerts.status, params.status));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (params.page - 1) * params.limit;

  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(alerts)
      .where(where)
      .orderBy(desc(alerts.createdAt))
      .limit(params.limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(alerts)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return buildPaginatedResult(data, total, params);
}

export async function findAlertById(alertId: string): Promise<AlertRow | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(alerts)
    .where(eq(alerts.alertId, alertId));
  return result[0];
}

export async function createAlert(
  data: typeof alerts.$inferInsert,
): Promise<AlertRow> {
  const db = getDb();
  const [row] = await db.insert(alerts).values(data).returning();
  if (!row) {
    throw new Error('Failed to create alert');
  }
  return row;
}

export async function updateAlertStatus(
  alertId: string,
  newStatus: string,
  changedBy?: string,
  notes?: string,
): Promise<AlertRow> {
  const db = getDb();
  const existing = await findAlertById(alertId);
  if (!existing) {
    throw new Error(`Alert not found: ${alertId}`);
  }

  // 이력 기록
  await db.insert(alertHistory).values({
    alertId,
    previousStatus: existing.status,
    newStatus,
    changedBy: changedBy ?? null,
    notes: notes ?? null,
  });

  // 상태 업데이트
  const [row] = await db
    .update(alerts)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(alerts.alertId, alertId))
    .returning();

  if (!row) {
    throw new Error(`Failed to update alert: ${alertId}`);
  }
  return row;
}

export async function checkDuplicate(dedupKey: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(alerts)
    .where(
      and(
        eq(alerts.dedupKey, dedupKey),
        eq(alerts.status, 'new'),
      ),
    );
  return (result[0]?.count ?? 0) > 0;
}
