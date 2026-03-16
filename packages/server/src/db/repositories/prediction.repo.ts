// Prediction Repository

import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { getDb } from '../../config/database';
import { predictions } from '../schema';
import { buildPaginatedResult } from './base.repo';
import type { PaginationParams, PaginatedResult } from '@cowtalk/shared';

type PredictionRow = typeof predictions.$inferSelect;

export interface PredictionQueryParams extends PaginationParams {
  readonly farmId?: string;
  readonly animalId?: string;
  readonly engineType?: string;
  readonly since?: Date;
}

export async function findPredictions(
  params: PredictionQueryParams,
): Promise<PaginatedResult<PredictionRow>> {
  const db = getDb();
  const conditions = [];

  if (params.farmId) {
    conditions.push(eq(predictions.farmId, params.farmId));
  }
  if (params.animalId) {
    conditions.push(eq(predictions.animalId, params.animalId));
  }
  if (params.engineType) {
    conditions.push(eq(predictions.engineType, params.engineType));
  }
  if (params.since) {
    conditions.push(gte(predictions.timestamp, params.since));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const offset = (params.page - 1) * params.limit;

  const [data, countResult] = await Promise.all([
    db
      .select()
      .from(predictions)
      .where(where)
      .orderBy(desc(predictions.timestamp))
      .limit(params.limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(predictions)
      .where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return buildPaginatedResult(data, total, params);
}

export async function findPredictionById(
  predictionId: string,
): Promise<PredictionRow | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(predictions)
    .where(eq(predictions.predictionId, predictionId));
  return result[0];
}

export async function createPrediction(
  data: typeof predictions.$inferInsert,
): Promise<PredictionRow> {
  const db = getDb();
  const [row] = await db.insert(predictions).values(data).returning();
  if (!row) {
    throw new Error('Failed to create prediction');
  }
  return row;
}

export async function createPredictions(
  data: readonly (typeof predictions.$inferInsert)[],
): Promise<readonly PredictionRow[]> {
  if (data.length === 0) return [];
  const db = getDb();
  return db.insert(predictions).values([...data]).returning();
}
