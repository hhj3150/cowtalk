// 데이터 저장 (Storage)
// TimescaleDB sensor_measurements 저장 (시계열)
// PostgreSQL 이벤트/공공데이터 저장 (관계형)
// Redis 최신 상태 캐시 업데이트

import { getDb } from '../config/database.js';
import { sensorMeasurements, smaxtecEvents } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import type { NormalizedSmaxtecEvent } from './normalization.js';
import type { SensorMeasurementInput } from './validation.js';

// ===========================
// 센서 측정값 저장 (TimescaleDB)
// ===========================

export async function storeSensorMeasurements(
  measurements: readonly SensorMeasurementInput[],
): Promise<number> {
  if (measurements.length === 0) return 0;

  const db = getDb();
  const values = measurements.map((m) => ({
    animalId: m.animalId,
    timestamp: m.timestamp,
    metricType: m.metricType,
    value: m.value,
    qualityFlag: 'good' as const,
  }));

  try {
    const rows = await db
      .insert(sensorMeasurements)
      .values(values)
      .returning();

    logger.info(
      { count: rows.length },
      `[Storage] Stored ${String(rows.length)} sensor measurements`,
    );
    return rows.length;
  } catch (error) {
    logger.error({ err: error }, '[Storage] Failed to store sensor measurements');
    throw error;
  }
}

// ===========================
// smaXtec 이벤트 저장 (신뢰 — 재판단 안 함)
// ===========================

export interface SmaxtecEventStoreInput {
  readonly event: NormalizedSmaxtecEvent;
  readonly animalId: string;  // CowTalk animal_id (UUID)
  readonly farmId: string;    // CowTalk farm_id (UUID)
}

export async function storeSmaxtecEvents(
  events: readonly SmaxtecEventStoreInput[],
): Promise<number> {
  if (events.length === 0) return 0;

  const db = getDb();
  const values = events.map((e) => ({
    externalEventId: e.event.externalEventId,
    animalId: e.animalId,
    farmId: e.farmId,
    eventType: e.event.eventType,
    confidence: e.event.confidence,
    severity: e.event.severity,
    stage: e.event.stage,
    detectedAt: e.event.detectedAt,
    details: e.event.details,
    rawData: e.event.rawData,
  }));

  try {
    const rows = await db
      .insert(smaxtecEvents)
      .values(values)
      .returning();

    logger.info(
      { count: rows.length },
      `[Storage] Stored ${String(rows.length)} smaXtec events (trusted)`,
    );

    // 발정 이벤트 감지 → 수정 추천 알림 자동 생성
    const heatEvents = rows.filter((r) => r.eventType === 'estrus' || r.eventType === 'heat');
    if (heatEvents.length > 0) {
      triggerBreedingAdvice(heatEvents).catch((err) => {
        logger.error({ err }, '[Storage] Breeding advice trigger failed (non-blocking)');
      });
    }

    return rows.length;
  } catch (error) {
    logger.error({ err: error }, '[Storage] Failed to store smaXtec events');
    throw error;
  }
}

// ===========================
// 수집 통계
// ===========================

// ===========================
// 발정 → 수정 추천 자동 트리거
// ===========================

async function triggerBreedingAdvice(
  heatEvents: readonly { animalId: string; farmId: string; eventType: string; detectedAt: Date | null }[],
): Promise<void> {
  const { getBreedingAdvice } = await import('../services/breeding/breeding-advisor.service.js');

  for (const heat of heatEvents) {
    try {
      const advice = await getBreedingAdvice(heat.animalId, heat.detectedAt ?? undefined);
      if (!advice) continue;

      logger.info({
        animalId: heat.animalId,
        earTag: advice.earTag,
        farmName: advice.farmName,
        optimalTime: advice.optimalInseminationTime,
        topSemen: advice.recommendations[0]?.bullName ?? 'N/A',
        warnings: advice.warnings.length,
      }, `[BreedingAdvice] 🐄 발정감지 → 수정추천: ${advice.earTag} (${advice.farmName}) — ${advice.optimalTimeLabel}`);

      // TODO: WebSocket push + 모바일 알림 발송
      // io.to(advice.farmId).emit('breeding-advice', advice);
    } catch (err) {
      logger.error({ err, animalId: heat.animalId }, '[BreedingAdvice] Failed to generate advice');
    }
  }
}

export interface StorageStats {
  readonly sensorMeasurements: number;
  readonly smaxtecEvents: number;
  readonly storedAt: Date;
}
