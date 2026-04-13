/**
 * 소버린 알람 레이블 관리 + 정확도 통계
 */

import { getDb } from '../../config/database.js';
import { sovereignAlarmLabels } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { SaveSovereignLabelInput, SovereignAlarmAccuracy } from './types.js';

export async function saveSovereignAlarmLabel(input: SaveSovereignLabelInput): Promise<void> {
  const db = getDb();
  await db.insert(sovereignAlarmLabels)
    .values({
      alarmSignature:    input.alarmSignature,
      animalId:          input.animalId,
      farmId:            input.farmId,
      alarmType:         input.alarmType,
      predictedSeverity: input.predictedSeverity,
      verdict:           input.verdict,
      notes:             input.notes ?? null,
    })
    .onConflictDoUpdate({
      target: sovereignAlarmLabels.alarmSignature,
      set: {
        verdict:   input.verdict,
        notes:     input.notes ?? null,
        labeledAt: new Date(),
      },
    });
}

export async function getSovereignAlarmAccuracy(farmId: string): Promise<SovereignAlarmAccuracy> {
  const db = getDb();
  const rows = await db.select()
    .from(sovereignAlarmLabels)
    .where(eq(sovereignAlarmLabels.farmId, farmId));

  const byType: Record<string, { confirmed: number; falsePositive: number; modified: number; total: number }> = {};
  let confirmed = 0, falsePositive = 0, modified = 0;

  for (const row of rows) {
    const t = byType[row.alarmType] ?? { confirmed: 0, falsePositive: 0, modified: 0, total: 0 };
    if (row.verdict === 'confirmed') { t.confirmed++; confirmed++; }
    else if (row.verdict === 'false_positive') { t.falsePositive++; falsePositive++; }
    else if (row.verdict === 'modified') { t.modified++; modified++; }
    t.total++;
    byType[row.alarmType] = t;
  }

  const total = rows.length;
  return {
    totalLabeled: total,
    confirmed,
    falsePositive,
    modified,
    accuracy: total > 0 ? Math.round((confirmed / total) * 100) : 0,
    byType,
  };
}
