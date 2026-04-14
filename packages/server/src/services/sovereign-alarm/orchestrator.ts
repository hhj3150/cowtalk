/**
 * 소버린 알람 오케스트레이터
 * 전체 룰 레지스트리를 순회하며 농장 단위 알람 생성 + 레이블 보정
 */

import { getDb } from '../../config/database.js';
import { animals, sovereignAlarmLabels } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { logger } from '../../lib/logger.js';
import { saveSovereignAlarmsBatch } from '../../intelligence-loop/prediction-bridge.service.js';
import { getConfidenceMultipliers } from '../../intelligence-loop/threshold-learner.js';
import { getBatchDailySummaries } from './data-loader.js';
import { getSovereignAlarmAccuracy } from './label.service.js';
import { getAllRules } from './rules/rule-registry.js';
import type { SovereignAlarm, AnimalProfile } from './types.js';

export async function generateSovereignAlarms(farmId: string, limit = 30): Promise<SovereignAlarm[]> {
  const db = getDb();

  const farmAnimals: AnimalProfile[] = await db.select({
    animalId: animals.animalId,
    farmId: animals.farmId,
    earTag: animals.earTag,
    name: animals.name,
    daysInMilk: animals.daysInMilk,
    parity: animals.parity,
    lactationStatus: animals.lactationStatus,
  })
    .from(animals)
    .where(and(
      eq(animals.farmId, farmId),
      eq(animals.status, 'active'),
    ))
    .limit(80);

  const alarms: SovereignAlarm[] = [];
  const animalIds = farmAnimals.map(a => a.animalId);
  const summaryMap = await getBatchDailySummaries(animalIds, 10);
  const registry = getAllRules();

  for (const animal of farmAnimals) {
    try {
      const summary = summaryMap.get(animal.animalId) ?? [];
      if (summary.length < 3) continue;

      const today = new Date().toISOString().slice(0, 10);
      for (const def of registry) {
        const alarm = def.rule(summary, animal);
        if (alarm) {
          const signature = `${animal.animalId}:${alarm.type}:${today}`;
          alarms.push({
            ...alarm,
            alarmId: `sov-${signature}`,
            alarmSignature: signature,
            animalId: animal.animalId,
            earTag: animal.earTag,
            animalName: animal.name,
            farmId: animal.farmId,
          });
        }
      }
    } catch (err) {
      logger.warn({ err, animalId: animal.animalId }, 'sovereign alarm rule error');
    }
  }

  // AX 학습: 학습된 임계값 multiplier + 레이블 정확도 기반 confidence 보정
  let calibratedAlarms = alarms;
  try {
    // Phase 2: threshold-learner가 생성한 글로벌+농장별 multiplier 로드
    const learnedMultipliers = await getConfidenceMultipliers(farmId);

    // Phase 1: 기존 레이블 기반 보정 (fallback)
    const accuracy = await getSovereignAlarmAccuracy(farmId);

    calibratedAlarms = alarms.map(alarm => {
      let newConf = alarm.confidence;

      // 1순위: 학습된 multiplier (sovereign_alarm_labels 90일 집계)
      const learned = learnedMultipliers.get(alarm.type);
      if (learned && learned !== 1.0) {
        newConf = Math.round(newConf * learned);
      } else {
        // 2순위: 기존 실시간 레이블 보정 (학습 데이터 부족 시)
        const typeStats = accuracy.byType[alarm.type];
        if (typeStats && typeStats.total >= 3) {
          const fpRate = typeStats.falsePositive / typeStats.total;
          if (fpRate > 0.5) {
            newConf = Math.round(newConf * 0.7);
          } else if (fpRate > 0.3) {
            newConf = Math.round(newConf * 0.85);
          }
          const confirmRate = typeStats.confirmed / typeStats.total;
          if (confirmRate > 0.9 && typeStats.total >= 5) {
            newConf = Math.min(100, Math.round(newConf * 1.1));
          }
        }
      }

      newConf = Math.max(1, Math.min(100, newConf));
      return newConf !== alarm.confidence ? { ...alarm, confidence: newConf } : alarm;
    });
  } catch (err) {
    logger.debug({ err, farmId }, '[Sovereign] label calibration skipped');
  }

  // severity 우선순위 정렬
  const ORDER: Record<string, number> = { critical: 0, warning: 1, caution: 2, info: 3 };
  const sorted = [...calibratedAlarms]
    .sort((a, b) => (ORDER[a.severity] ?? 3) - (ORDER[b.severity] ?? 3))
    .slice(0, limit);

  // predictions 테이블 저장 (비동기)
  saveSovereignAlarmsBatch(sorted).catch(err => {
    logger.debug({ err, count: sorted.length }, '[Sovereign] prediction bridge save failed');
  });

  // 기존 레이블 로드
  try {
    const signatures = sorted.map(a => a.alarmSignature);
    if (signatures.length > 0) {
      const labels = await db.select()
        .from(sovereignAlarmLabels)
        .where(sql`alarm_signature = ANY(${signatures})`);
      const labelMap = new Map(labels.map(l => [l.alarmSignature, l.verdict as 'confirmed' | 'false_positive' | 'modified']));
      return sorted.map(a => ({ ...a, verdict: labelMap.get(a.alarmSignature) }));
    }
  } catch (err) {
    logger.warn({ err }, 'failed to load sovereign alarm labels');
  }

  return sorted;
}
