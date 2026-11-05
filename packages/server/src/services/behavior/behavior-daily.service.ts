// 행동 일별 지표 저장·조회 — 출처(source)와 무관한 단일 경로
// 수집 어댑터(센서 API)와 CSV 업로드·수기 입력이 모두 이 함수로 저장한다.

import { getDb } from '../../config/database.js';
import { behaviorDaily } from '../../db/schema.js';
import { and, eq, gte, desc, sql } from 'drizzle-orm';
import type { BehaviorDailyInput, BehaviorDailyRecord, BehaviorGroupKey, BehaviorMetrics } from '@cowtalk/shared';

type Row = typeof behaviorDaily.$inferSelect;

/** DB 행 → 공용 레코드 (값이 없는 지표는 빼서 내려보낸다) */
export function toBehaviorRecord(r: Row): BehaviorDailyRecord {
  const m: Record<string, number> = {};
  const put = (k: keyof BehaviorMetrics, v: number | null): void => { if (v !== null) m[k] = v; };
  put('lyingHours', r.lyingHours);
  put('standingHours', r.standingHours);
  put('standingActiveHours', r.standingActiveHours);
  put('standingInactiveHours', r.standingInactiveHours);
  put('movingHours', r.movingHours);
  put('ruminationLyingMin', r.ruminationLyingMin);
  put('ruminationStandingMin', r.ruminationStandingMin);
  put('ruminationLyingPct', r.ruminationLyingPct);
  put('ruminationStandingPct', r.ruminationStandingPct);
  put('peakLyingSyncPct', r.peakLyingSyncPct);
  put('animalCount', r.animalCount);
  return {
    farmId: r.farmId,
    groupKey: r.groupKey as BehaviorGroupKey,
    date: r.date,
    source: r.source,
    metrics: m,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function columns(m: BehaviorMetrics) {
  return {
    lyingHours: m.lyingHours ?? null,
    standingHours: m.standingHours ?? null,
    standingActiveHours: m.standingActiveHours ?? null,
    standingInactiveHours: m.standingInactiveHours ?? null,
    movingHours: m.movingHours ?? null,
    ruminationLyingMin: m.ruminationLyingMin ?? null,
    ruminationStandingMin: m.ruminationStandingMin ?? null,
    ruminationLyingPct: m.ruminationLyingPct ?? null,
    ruminationStandingPct: m.ruminationStandingPct ?? null,
    peakLyingSyncPct: m.peakLyingSyncPct ?? null,
    animalCount: m.animalCount == null ? null : Math.round(m.animalCount),
  };
}

/** 검증을 마친 행만 받는다 (validateBehaviorRows). 같은 농장·그룹·날짜·출처는 갱신 */
export async function upsertBehaviorRows(
  farmId: string,
  rows: readonly BehaviorDailyInput[],
  source: string,
  userId: string | null,
  raw?: readonly unknown[],
): Promise<{ readonly saved: number }> {
  const db = getDb();
  let saved = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const cols = columns(r.metrics);
    await db.insert(behaviorDaily)
      .values({ farmId, groupKey: r.groupKey, date: r.date, source, ...cols, raw: raw?.[i] ?? null, createdBy: userId })
      .onConflictDoUpdate({
        target: [behaviorDaily.farmId, behaviorDaily.groupKey, behaviorDaily.date, behaviorDaily.source],
        set: { ...cols, raw: raw?.[i] ?? null, updatedAt: sql`now()` },
      });
    saved += 1;
  }
  return { saved };
}

/** 최근 N일 (날짜 오름차순) */
export async function listBehaviorDaily(farmId: string, days: number): Promise<BehaviorDailyRecord[]> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.select().from(behaviorDaily)
    .where(and(eq(behaviorDaily.farmId, farmId), gte(behaviorDaily.date, since)))
    .orderBy(desc(behaviorDaily.date))
    .limit(2000);
  return rows.map(toBehaviorRecord).reverse();
}
