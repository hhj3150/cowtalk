// Animal Repository

import { eq, and, isNull, ilike, sql } from 'drizzle-orm';
import { getDb } from '../../config/database';
import { animals } from '../schema';
import { buildPaginatedResult } from './base.repo';
import type { PaginationParams, PaginatedResult } from '@cowtalk/shared';

type AnimalRow = typeof animals.$inferSelect;

export interface AnimalQueryParams extends PaginationParams {
  readonly farmId: string;
  readonly status?: string;
  readonly breed?: string;
  readonly search?: string;
}

export async function findAnimals(params: AnimalQueryParams): Promise<PaginatedResult<AnimalRow>> {
  const db = getDb();
  const conditions = [
    eq(animals.farmId, params.farmId),
    isNull(animals.deletedAt),
  ];

  if (params.status) {
    conditions.push(eq(animals.status, params.status));
  }
  if (params.breed) {
    conditions.push(eq(animals.breed, params.breed));
  }
  if (params.search) {
    conditions.push(ilike(animals.earTag, `%${params.search}%`));
  }

  const where = and(...conditions);
  const offset = (params.page - 1) * params.limit;

  const [data, countResult] = await Promise.all([
    db.select().from(animals).where(where).limit(params.limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(animals).where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  return buildPaginatedResult(data, total, params);
}

export async function findAnimalById(animalId: string): Promise<AnimalRow | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(animals)
    .where(and(eq(animals.animalId, animalId), isNull(animals.deletedAt)));
  return result[0];
}

export async function createAnimal(
  data: typeof animals.$inferInsert,
): Promise<AnimalRow> {
  const db = getDb();
  const [row] = await db.insert(animals).values(data).returning();
  if (!row) {
    throw new Error('Failed to create animal');
  }
  return row;
}

export async function updateAnimal(
  animalId: string,
  data: Partial<typeof animals.$inferInsert>,
): Promise<AnimalRow> {
  const db = getDb();
  const [row] = await db
    .update(animals)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(animals.animalId, animalId))
    .returning();
  if (!row) {
    throw new Error(`Animal not found: ${animalId}`);
  }
  return row;
}

export async function countAnimalsByFarm(farmId: string): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(animals)
    .where(and(eq(animals.farmId, farmId), isNull(animals.deletedAt)));
  return result[0]?.count ?? 0;
}
