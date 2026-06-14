// AI 해석 캐시 리포지토리 — animal_interpretations 읽기/upsert
// 키: (animalId, role, model) 1행. profileHash 로 staleness 판별.

import { and, eq } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { animalInterpretations } from '../schema.js';
import type { AnimalInterpretation } from '@cowtalk/shared';

export interface CachedInterpretationRow {
  readonly animalId: string;
  readonly role: string;
  readonly model: string;
  readonly profileHash: string;
  readonly result: AnimalInterpretation;
  readonly updatedAt: Date;
}

export async function getCachedInterpretation(
  animalId: string,
  role: string,
  model: string,
): Promise<CachedInterpretationRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(animalInterpretations)
    .where(
      and(
        eq(animalInterpretations.animalId, animalId),
        eq(animalInterpretations.role, role),
        eq(animalInterpretations.model, model),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    animalId: row.animalId,
    role: row.role,
    model: row.model,
    profileHash: row.profileHash,
    result: row.result as AnimalInterpretation,
    updatedAt: row.updatedAt,
  };
}

export async function upsertCachedInterpretation(input: {
  readonly animalId: string;
  readonly role: string;
  readonly model: string;
  readonly profileHash: string;
  readonly result: AnimalInterpretation;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(animalInterpretations)
    .values({
      animalId: input.animalId,
      role: input.role,
      model: input.model,
      profileHash: input.profileHash,
      result: input.result,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        animalInterpretations.animalId,
        animalInterpretations.role,
        animalInterpretations.model,
      ],
      set: {
        profileHash: input.profileHash,
        result: input.result,
        updatedAt: new Date(),
      },
    });
}
