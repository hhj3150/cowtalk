/**
 * 배치 일간 센서 요약 로더 — N+1 → 1쿼리
 */

import { getDb } from '../../config/database.js';
import { sensorDailyAgg } from '../../db/schema.js';
import { and, gte, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { DailySummary } from './types.js';

export async function getBatchDailySummaries(
  animalIds: readonly string[],
  days: number,
): Promise<Map<string, DailySummary[]>> {
  if (animalIds.length === 0) return new Map();
  const db = getDb();
  const since = new Date(Date.now() - days * 86400_000);

  const rows = await db.select()
    .from(sensorDailyAgg)
    .where(and(
      sql`${sensorDailyAgg.animalId} = ANY(${animalIds})`,
      gte(sensorDailyAgg.date, since.toISOString().slice(0, 10)),
    ))
    .orderBy(desc(sensorDailyAgg.date));

  const nested = new Map<string, Map<string, { temp?: number; rum?: number; act?: number; dr?: number }>>();
  for (const row of rows) {
    const aid = row.animalId;
    const d = typeof row.date === 'string' ? row.date : (row.date as Date).toISOString().slice(0, 10);
    if (!nested.has(aid)) nested.set(aid, new Map());
    const byDate = nested.get(aid)!;
    if (!byDate.has(d)) byDate.set(d, {});
    const entry = byDate.get(d)!;
    // metric_type 매핑: DB에 temperature/rumination/activity 또는 temp/rum_index/act로 저장
    const mt = row.metricType;
    if (mt === 'temp' || mt === 'temperature')           entry.temp = row.avg;
    if (mt === 'rum_index' || mt === 'rumination')       entry.rum  = mt === 'rum_index' ? row.avg / 60 : row.avg;
    if (mt === 'act' || mt === 'activity')               entry.act  = row.avg;
    if (mt === 'water_intake' || mt === 'drinking')      entry.dr   = mt === 'water_intake' ? row.avg * 144 : row.avg;
  }

  const result = new Map<string, DailySummary[]>();
  for (const aid of animalIds) {
    const byDate = nested.get(aid);
    if (!byDate) { result.set(aid, []); continue; }
    result.set(aid,
      Array.from(byDate.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, v]) => ({
          date,
          tempAvg: v.temp ?? null,
          rumAvg:  v.rum  ?? null,
          actAvg:  v.act  ?? null,
          drSum:   v.dr   ?? null,
        })),
    );
  }
  return result;
}
