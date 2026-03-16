// Farm Repository

import { eq, and, isNull, ilike, sql } from 'drizzle-orm';
import { getDb } from '../../config/database';
import { farms } from '../schema';
import { buildPaginatedResult } from './base.repo';
import type { PaginationParams, PaginatedResult } from '@cowtalk/shared';

type FarmRow = typeof farms.$inferSelect;

export interface FarmQueryParams extends PaginationParams {
  readonly regionId?: string;
  readonly status?: string;
  readonly search?: string;
}

export async function findFarms(params: FarmQueryParams): Promise<PaginatedResult<FarmRow>> {
  const db = getDb();
  const conditions = [isNull(farms.deletedAt)];

  if (params.regionId) {
    conditions.push(eq(farms.regionId, params.regionId));
  }
  if (params.status) {
    conditions.push(eq(farms.status, params.status));
  }
  if (params.search) {
    conditions.push(ilike(farms.name, `%${params.search}%`));
  }

  const where = and(...conditions);
  const offset = (params.page - 1) * params.limit;

  const [data, countResult] = await Promise.all([
    db.select().from(farms).where(where).limit(params.limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(farms).where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return buildPaginatedResult(data, total, params);
}

export async function findFarmById(farmId: string): Promise<FarmRow | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(farms)
    .where(and(eq(farms.farmId, farmId), isNull(farms.deletedAt)));
  return result[0];
}

export async function createFarm(
  data: typeof farms.$inferInsert,
): Promise<FarmRow> {
  const db = getDb();
  const [row] = await db.insert(farms).values(data).returning();
  if (!row) {
    throw new Error('Failed to create farm');
  }
  return row;
}

export async function updateFarm(
  farmId: string,
  data: Partial<typeof farms.$inferInsert>,
): Promise<FarmRow> {
  const db = getDb();
  const [row] = await db
    .update(farms)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(farms.farmId, farmId))
    .returning();
  if (!row) {
    throw new Error(`Farm not found: ${farmId}`);
  }
  return row;
}

export async function softDeleteFarm(farmId: string): Promise<void> {
  const db = getDb();
  await db
    .update(farms)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(farms.farmId, farmId));
}
