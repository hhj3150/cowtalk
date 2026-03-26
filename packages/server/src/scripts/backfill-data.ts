// 데이터 백필 스크립트
// 1. smaXtec API → sensor_measurements (최근 7일)
// 2. smaxtec_events → breeding_events (발정/수정 이벤트)
// 3. smaxtec_events → health_events (건강 이벤트)

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, inArray, isNotNull, sql as dsql } from 'drizzle-orm';
import { getDatabaseUrl } from '../config/index.js';
import * as schema from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { config } from '../config/index.js';

const sqlClient = postgres(getDatabaseUrl());
const db = drizzle(sqlClient, { schema });

// ===========================
// smaXtec API 클라이언트 (경량)
// ===========================

class SmaxtecClient {
  private readonly integrationBase = 'https://api.smaxtec.com/integration/v2';
  private readonly apiBase = 'https://api.smaxtec.com/api/v2';
  private token: string | null = null;

  async authenticate(): Promise<void> {
    const email = config.SMAXTEC_EMAIL;
    const password = config.SMAXTEC_PASSWORD;
    if (!email || !password) throw new Error('smaXtec credentials not configured');

    const res = await fetch(`${this.integrationBase}/users/session_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: email, password }),
    });

    if (!res.ok) throw new Error(`smaXtec auth failed: ${String(res.status)}`);
    const data = (await res.json()) as { token: string };
    this.token = data.token;
    logger.info('[Backfill] smaXtec authenticated');
  }

  async getSensorData(
    animalId: string,
    metrics: string,
    fromDate: string,
    toDate: string,
  ): Promise<ReadonlyArray<{ metric: string; data: ReadonlyArray<readonly [string, number]> }>> {
    if (!this.token) throw new Error('Not authenticated');

    const params = new URLSearchParams();
    for (const m of metrics.split(',')) params.append('metrics', m.trim());
    params.append('from_date', fromDate);
    params.append('to_date', toDate);

    const url = `${this.apiBase}/data/animals/${animalId}.json?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`Sensor data fetch failed: ${String(res.status)}`);
    }

    return (await res.json()) as ReadonlyArray<{ metric: string; data: ReadonlyArray<readonly [string, number]> }>;
  }
}

// ===========================
// 1. 센서 데이터 백필
// ===========================

async function backfillSensorData(): Promise<number> {
  logger.info('[Backfill] === Starting sensor data backfill ===');

  const client = new SmaxtecClient();
  await client.authenticate();

  // 센서 있는 동물 조회 (externalId + currentDeviceId 있는 것만)
  const animalsWithSensor = await db
    .select({
      animalId: schema.animals.animalId,
      externalId: schema.animals.externalId,
      name: schema.animals.name,
      earTag: schema.animals.earTag,
    })
    .from(schema.animals)
    .where(
      and(
        isNotNull(schema.animals.externalId),
        eq(schema.animals.status, 'active'),
      ),
    );

  // CLI 인자로 최대 동물 수 제한 가능 (기본: 100)
  const maxAnimals = parseInt(process.argv[2] ?? '100', 10);
  const targetAnimals = animalsWithSensor.slice(0, maxAnimals);
  logger.info(
    { total: animalsWithSensor.length, processing: targetAnimals.length },
    '[Backfill] Animals with sensors found (limited)',
  );

  // 날짜 범위: 최근 7일
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().split('T')[0]!;
  const toStr = now.toISOString().split('T')[0]!;

  let totalStored = 0;
  const CONCURRENCY = 3;
  // smaXtec API: temp, act만 지원 (rum/intake/cycle은 400 에러)
  // 각 메트릭을 개별 호출해야 안정적
  const availableMetrics = ['temp', 'act'];

  // 배치 처리
  for (let i = 0; i < targetAnimals.length; i += CONCURRENCY) {
    const batch = targetAnimals.slice(i, i + CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (animal) => {
        if (!animal.externalId) return 0;

        try {
          // 각 메트릭을 개별 호출 (복수 메트릭 호출 시 하나라도 미지원이면 전체 실패)
          const allRawData: Array<{ metric: string; data: ReadonlyArray<readonly [string, number]> }> = [];
          for (const metric of availableMetrics) {
            try {
              const result = await client.getSensorData(animal.externalId, metric, fromStr, toStr);
              allRawData.push(...result);
            } catch {
              // 해당 메트릭 미지원 — 무시
            }
          }
          const rawData = allRawData;

          if (rawData.length === 0) return 0;

          // 메트릭별 변환
          const metricTypeMap: Readonly<Record<string, string>> = {
            temp: 'temperature',
            act: 'activity',
            rum: 'rumination',
          };

          const measurements: Array<{
            animalId: string;
            timestamp: Date;
            metricType: string;
            value: number;
            qualityFlag: string;
          }> = [];

          for (const item of rawData) {
            const metricType = metricTypeMap[item.metric] ?? item.metric;
            for (const [tsStr, value] of item.data) {
              if (typeof value !== 'number' || isNaN(value)) continue;
              measurements.push({
                animalId: animal.animalId,
                timestamp: new Date(tsStr),
                metricType,
                value,
                qualityFlag: 'good',
              });
            }
          }

          if (measurements.length === 0) return 0;

          // 배치 INSERT (500개씩)
          const INSERT_BATCH = 500;
          let stored = 0;
          for (let j = 0; j < measurements.length; j += INSERT_BATCH) {
            const insertBatch = measurements.slice(j, j + INSERT_BATCH);
            try {
              await db.insert(schema.sensorMeasurements).values(insertBatch);
              stored += insertBatch.length;
            } catch (err) {
              logger.error({ err, animalId: animal.animalId }, '[Backfill] Insert batch failed');
            }
          }

          return stored;
        } catch (err) {
          logger.warn({ err, animalId: animal.externalId }, '[Backfill] Sensor fetch failed for animal');
          return 0;
        }
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled') totalStored += r.value;
    }

    if (i % 30 === 0) {
      logger.info({ processed: i, total: targetAnimals.length, stored: totalStored }, '[Backfill] Progress');
    }

    // Rate limit 보호
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  logger.info({ totalStored }, '[Backfill] Sensor data backfill complete');
  return totalStored;
}

// ===========================
// 2. 발정 이벤트 → breeding_events
// ===========================

async function generateBreedingEvents(): Promise<number> {
  logger.info('[Backfill] === Generating breeding events from smaxtec_events ===');

  // 발정 관련 이벤트 조회
  const estrusEvents = await db
    .select({
      eventId: schema.smaxtecEvents.eventId,
      animalId: schema.smaxtecEvents.animalId,
      eventType: schema.smaxtecEvents.eventType,
      detectedAt: schema.smaxtecEvents.detectedAt,
      confidence: schema.smaxtecEvents.confidence,
      details: schema.smaxtecEvents.details,
    })
    .from(schema.smaxtecEvents)
    .where(
      inArray(schema.smaxtecEvents.eventType, [
        'estrus',
        'estrus_start',
        'estrus_peak',
        'insemination_window',
        'cycle_regular',
      ]),
    );

  logger.info({ count: estrusEvents.length }, '[Backfill] Estrus events found');

  // 기존 breeding_events 확인 (중복 방지)
  const existingCount = await db
    .select({ count: dsql<number>`count(*)::int` })
    .from(schema.breedingEvents);

  if ((existingCount[0]?.count ?? 0) > 0) {
    logger.info('[Backfill] breeding_events already has data, skipping');
    return 0;
  }

  const values = estrusEvents.map((e) => ({
    animalId: e.animalId,
    eventDate: e.detectedAt,
    type: e.eventType === 'insemination_window' ? 'insemination' : 'estrus_detected',
    semenInfo: e.eventType === 'insemination_window' ? 'AI 추천 수정 타이밍' : null,
    notes: `smaXtec 감지 (confidence: ${String(e.confidence ?? 0)})`,
  }));

  if (values.length === 0) return 0;

  // 배치 INSERT
  let stored = 0;
  const BATCH = 500;
  for (let i = 0; i < values.length; i += BATCH) {
    const batch = values.slice(i, i + BATCH);
    try {
      await db.insert(schema.breedingEvents).values(batch);
      stored += batch.length;
    } catch (err) {
      logger.error({ err }, '[Backfill] Breeding events insert failed');
    }
  }

  logger.info({ stored }, '[Backfill] Breeding events generated');
  return stored;
}

// ===========================
// 3. 건강 이벤트 → health_events
// ===========================

async function generateHealthEvents(): Promise<number> {
  logger.info('[Backfill] === Generating health events from smaxtec_events ===');

  const healthEventTypes = [
    'temperature_high',
    'temperature_low',
    'rumination_decrease',
    'activity_decrease',
    'ph_low',
    'health_warning',
    'health_alert',
    'drinking_decrease',
  ];

  const healthEvents = await db
    .select({
      eventId: schema.smaxtecEvents.eventId,
      animalId: schema.smaxtecEvents.animalId,
      eventType: schema.smaxtecEvents.eventType,
      detectedAt: schema.smaxtecEvents.detectedAt,
      severity: schema.smaxtecEvents.severity,
      confidence: schema.smaxtecEvents.confidence,
      details: schema.smaxtecEvents.details,
    })
    .from(schema.smaxtecEvents)
    .where(inArray(schema.smaxtecEvents.eventType, healthEventTypes));

  logger.info({ count: healthEvents.length }, '[Backfill] Health events found');

  // 기존 health_events 확인
  const existingCount = await db
    .select({ count: dsql<number>`count(*)::int` })
    .from(schema.healthEvents);

  if ((existingCount[0]?.count ?? 0) > 0) {
    logger.info('[Backfill] health_events already has data, skipping');
    return 0;
  }

  const diagnosisMap: Readonly<Record<string, string>> = {
    temperature_high: '고체온',
    temperature_low: '저체온',
    rumination_decrease: '반추 저하',
    activity_decrease: '활동량 저하',
    ph_low: '산성증 (pH 저하)',
    health_warning: '건강 주의',
    health_alert: '건강 경고',
    drinking_decrease: '음수 저하',
  };

  const values = healthEvents.map((e) => ({
    animalId: e.animalId,
    eventDate: e.detectedAt,
    diagnosis: diagnosisMap[e.eventType] ?? e.eventType,
    severity: e.severity ?? 'medium',
    notes: `smaXtec 자동 감지 (confidence: ${String(e.confidence ?? 0)})`,
  }));

  if (values.length === 0) return 0;

  let stored = 0;
  const BATCH = 500;
  for (let i = 0; i < values.length; i += BATCH) {
    const batch = values.slice(i, i + BATCH);
    try {
      await db.insert(schema.healthEvents).values(batch);
      stored += batch.length;
    } catch (err) {
      logger.error({ err }, '[Backfill] Health events insert failed');
    }
  }

  logger.info({ stored }, '[Backfill] Health events generated');
  return stored;
}

// ===========================
// 메인 실행
// ===========================

async function main(): Promise<void> {
  logger.info('[Backfill] ========================================');
  logger.info('[Backfill] Starting data backfill');
  logger.info('[Backfill] ========================================');

  try {
    // 1. 번식/건강 이벤트 먼저 (빠름)
    const breedingCount = await generateBreedingEvents();
    const healthCount = await generateHealthEvents();

    // 2. 센서 데이터 (느림 — API 호출)
    const sensorCount = await backfillSensorData();

    logger.info('[Backfill] ========================================');
    logger.info(
      { breedingCount, healthCount, sensorCount },
      '[Backfill] Backfill complete',
    );
    logger.info('[Backfill] ========================================');
  } catch (err) {
    logger.error({ err }, '[Backfill] Fatal error');
  } finally {
    await sqlClient.end();
    process.exit(0);
  }
}

void main();
