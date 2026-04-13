/**
 * 알람 패턴 스냅샷 캡처 서비스
 * smaXtec 이벤트 발생 시 전후 48h 센서 데이터를 자동 캡처
 */

import { getDb } from '../../../config/database.js';
import { alarmPatternSnapshots, sensorDailyAgg } from '../../../db/schema.js';
import { and, gte, lte, eq } from 'drizzle-orm';
import { logger } from '../../../lib/logger.js';

interface DailyEntry {
  readonly date: string;
  readonly temp_avg: number | null;
  readonly rum_avg: number | null;
  readonly act_avg: number | null;
}

interface SensorSnapshot {
  readonly daily: readonly DailyEntry[];
}

async function fetchDailySnapshot(
  animalId: string,
  fromDate: Date,
  toDate: Date,
): Promise<SensorSnapshot> {
  const db = getDb();
  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);

  const rows = await db.select()
    .from(sensorDailyAgg)
    .where(and(
      eq(sensorDailyAgg.animalId, animalId),
      gte(sensorDailyAgg.date, fromStr),
      lte(sensorDailyAgg.date, toStr),
    ));

  // group by date
  const byDate = new Map<string, { temp?: number; rum?: number; act?: number }>();
  for (const row of rows) {
    const d = typeof row.date === 'string' ? row.date : (row.date as Date).toISOString().slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, {});
    const entry = byDate.get(d)!;
    if (row.metricType === 'temp')      entry.temp = row.avg;
    if (row.metricType === 'rum_index') entry.rum  = row.avg / 60;
    if (row.metricType === 'act')       entry.act  = row.avg;
  }

  const daily: DailyEntry[] = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date,
      temp_avg: v.temp ?? null,
      rum_avg:  v.rum  ?? null,
      act_avg:  v.act  ?? null,
    }));

  return { daily };
}

/**
 * smaXtec 이벤트 저장 직후 호출 — 이벤트 발생 전 48h 센서 데이터 캡처
 */
export async function captureBeforeSnapshot(
  animalId: string,
  farmId: string,
  eventType: string,
  eventDetectedAt: Date,
  smaxtecEventId?: string,
): Promise<void> {
  try {
    const db = getDb();
    const fromDate = new Date(eventDetectedAt.getTime() - 48 * 3600_000);

    const snapshot = await fetchDailySnapshot(animalId, fromDate, eventDetectedAt);

    await db.insert(alarmPatternSnapshots).values({
      animalId,
      farmId,
      eventType,
      eventDetectedAt,
      smaxtecEventId: smaxtecEventId ?? null,
      sensorBefore: snapshot,
      captureStatus: 'before_captured',
    });

    logger.debug({ animalId, eventType }, '[Snapshot] before captured');
  } catch (error) {
    logger.warn({ error, animalId, eventType }, '[Snapshot] before capture failed');
  }
}

/**
 * 48h 경과 후 이벤트 이후 센서 데이터 캡처 (스케줄러에서 호출)
 */
export async function completeAfterSnapshots(): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - 48 * 3600_000);

  // 48h 경과했지만 아직 after가 없는 스냅샷 조회
  const pending = await db.select()
    .from(alarmPatternSnapshots)
    .where(and(
      eq(alarmPatternSnapshots.captureStatus, 'before_captured'),
      lte(alarmPatternSnapshots.eventDetectedAt, cutoff),
    ))
    .limit(100);

  let completed = 0;
  for (const row of pending) {
    try {
      const afterEnd = new Date(row.eventDetectedAt.getTime() + 48 * 3600_000);
      const snapshot = await fetchDailySnapshot(
        row.animalId,
        row.eventDetectedAt,
        afterEnd,
      );

      await db.update(alarmPatternSnapshots)
        .set({
          sensorAfter: snapshot,
          captureStatus: 'complete',
          completedAt: new Date(),
        })
        .where(eq(alarmPatternSnapshots.snapshotId, row.snapshotId));

      completed++;
    } catch (error) {
      logger.warn({ error, snapshotId: row.snapshotId }, '[Snapshot] after capture failed');
    }
  }

  if (completed > 0) {
    logger.info({ completed }, '[Snapshot] after snapshots completed');
  }
  return completed;
}
