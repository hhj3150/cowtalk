// 지역 AI 해석 캐시 리포지토리 — regional_interpretations 읽기/upsert
// 키: (regionId, role, model) 1행. profileHash 로 staleness 판별. (animal 캐시와 동일 구조)

import { and, eq } from 'drizzle-orm';
import { getDb } from '../../config/database.js';
import { regionalInterpretations } from '../schema.js';
import type { RegionalInterpretation } from '@cowtalk/shared';

export interface CachedRegionalRow {
  readonly regionId: string;
  readonly role: string;
  readonly model: string;
  readonly profileHash: string;
  readonly result: RegionalInterpretation;
  readonly updatedAt: Date;
}

export async function getCachedRegionalInterpretation(
  regionId: string,
  role: string,
  model: string,
): Promise<CachedRegionalRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(regionalInterpretations)
    .where(
      and(
        eq(regionalInterpretations.regionId, regionId),
        eq(regionalInterpretations.role, role),
        eq(regionalInterpretations.model, model),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    regionId: row.regionId,
    role: row.role,
    model: row.model,
    profileHash: row.profileHash,
    result: row.result as RegionalInterpretation,
    updatedAt: row.updatedAt,
  };
}

export async function upsertCachedRegionalInterpretation(input: {
  readonly regionId: string;
  readonly role: string;
  readonly model: string;
  readonly profileHash: string;
  readonly result: RegionalInterpretation;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(regionalInterpretations)
    .values({
      regionId: input.regionId,
      role: input.role,
      model: input.model,
      profileHash: input.profileHash,
      result: input.result,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        regionalInterpretations.regionId,
        regionalInterpretations.role,
        regionalInterpretations.model,
      ],
      set: {
        profileHash: input.profileHash,
        result: input.result,
        updatedAt: new Date(),
      },
    });
}
