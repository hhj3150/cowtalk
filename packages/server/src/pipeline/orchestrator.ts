// 파이프라인 오케스트레이터
// 실시간 경로: smaXtec 5분 주기 → ingest → validate → normalize → store → 캐시
// 배치 경로: 공공데이터 1일 1회 → ingest → validate → normalize → store
// 각 커넥터 독립 실행 (하나 실패해도 나머지 정상)

import { logger } from '../lib/logger.js';
import { getDb } from '../config/database.js';
import { animals, sensorMeasurements } from '../db/schema.js';
import { eq, and, isNotNull } from 'drizzle-orm';
import { SmaxtecConnector } from './connectors/smaxtec.connector.js';
import {
  TraceabilityConnector,
  DHIConnector,
  PedigreeConnector,
  QuarantineConnector,
  WeatherConnector,
} from './connectors/public-data/index.js';
import { ingest } from './ingestion.js';
import { syncSmaxtecData } from './sync.service.js';
import type { SmaxtecFetchData } from './connectors/smaxtec.connector.js';
import type { BaseConnector } from './connectors/base.connector.js';
import type { ConnectorHealth } from '@cowtalk/shared';

// ===========================
// 오케스트레이터 상태
// ===========================

interface PipelineState {
  isRunning: boolean;
  isCycleRunning: boolean;
  lastRealtimeRun: Date | null;
  lastBatchRun: Date | null;
  connectorHealth: ReadonlyMap<string, ConnectorHealth>;
}

export class PipelineOrchestrator {
  private state: PipelineState = {
    isRunning: false,
    isCycleRunning: false,
    lastRealtimeRun: null,
    lastBatchRun: null,
    connectorHealth: new Map(),
  };

  // 커넥터 인스턴스
  private readonly smaxtec = new SmaxtecConnector();
  private readonly traceability = new TraceabilityConnector();
  private readonly dhi = new DHIConnector();
  private readonly pedigree = new PedigreeConnector();
  private readonly quarantine = new QuarantineConnector();
  private readonly weather = new WeatherConnector();

  // 타이머 핸들
  private realtimeTimer: ReturnType<typeof setInterval> | null = null;
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private intelligenceTimer: ReturnType<typeof setInterval> | null = null;

  // ===========================
  // 시작/종료
  // ===========================

  async start(): Promise<void> {
    if (this.state.isRunning) {
      logger.warn('[Pipeline] Already running');
      return;
    }

    logger.info('[Pipeline] Starting...');
    this.state.isRunning = true;

    // 커넥터 초기화 (각각 독립, 하나 실패해도 나머지 정상)
    const connectors: readonly BaseConnector[] = [
      this.smaxtec,
      this.traceability,
      this.dhi,
      this.pedigree,
      this.quarantine,
      this.weather,
    ];

    const results = await Promise.allSettled(
      connectors.map((c) => c.connect()),
    );

    results.forEach((r, i) => {
      const name = connectors[i]!.config.name;
      if (r.status === 'rejected') {
        logger.error({ err: r.reason }, `[Pipeline] Failed to connect ${name}`);
      }
    });

    // 실시간 주기 설정 (smaXtec: 5분)
    this.realtimeTimer = setInterval(
      () => { void this.runRealtimeCycle(); },
      this.smaxtec.config.syncIntervalMs,
    );

    // 배치 주기 설정 (공공데이터: 1일 1회)
    this.batchTimer = setInterval(
      () => { void this.runBatchCycle(); },
      24 * 60 * 60 * 1000,
    );

    // Intelligence Loop: 매일 새벽 2시 배치 매칭
    this.intelligenceTimer = setInterval(
      () => { void this.runIntelligenceLoopBatch(); },
      24 * 60 * 60 * 1000, // 24시간
    );

    // 즉시 첫 실행
    void this.runRealtimeCycle();

    logger.info('[Pipeline] Started — realtime: 5min, batch: 24h, intelligence: 24h');
  }

  async stop(): Promise<void> {
    logger.info('[Pipeline] Stopping...');

    if (this.realtimeTimer) {
      clearInterval(this.realtimeTimer);
      this.realtimeTimer = null;
    }
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.intelligenceTimer) {
      clearInterval(this.intelligenceTimer);
      this.intelligenceTimer = null;
    }

    // 모든 커넥터 연결 종료
    await Promise.allSettled([
      this.smaxtec.disconnect(),
      this.traceability.disconnect(),
      this.dhi.disconnect(),
      this.pedigree.disconnect(),
      this.quarantine.disconnect(),
      this.weather.disconnect(),
    ]);

    this.state.isRunning = false;
    logger.info('[Pipeline] Stopped');
  }

  // ===========================
  // 실시간 경로 (smaXtec)
  // ===========================

  async runRealtimeCycle(): Promise<void> {
    // 중복 실행 방지
    if (this.state.isCycleRunning) {
      logger.warn('[Pipeline] Realtime cycle already running — skipping');
      return;
    }

    this.state = { ...this.state, isCycleRunning: true };
    const since = this.state.lastRealtimeRun;
    logger.info({ since }, '[Pipeline] Running realtime cycle');

    try {
      // 1. Ingest
      const result = await ingest(this.smaxtec, since ?? undefined);
      if (result.status === 'failed') {
        logger.error({ error: result.error }, '[Pipeline] smaXtec ingestion failed');
        return;
      }

      // 2. Sync to DB (farms, animals, events)
      const fetchData = result.data.data[0] as unknown as SmaxtecFetchData | undefined;
      if (fetchData) {
        const syncResult = await syncSmaxtecData(fetchData);
        logger.info(
          {
            farmsCreated: syncResult.farmsCreated,
            animalsCreated: syncResult.animalsCreated,
            eventsStored: syncResult.eventsStored,
          },
          '[Pipeline] DB sync complete',
        );
      }

      // 3. Sensor data batch (랜덤 30마리씩 수집)
      void this.collectSensorBatch().catch((err) => {
        logger.error({ err }, '[Pipeline] Sensor batch collection failed');
      });

      this.state = { ...this.state, lastRealtimeRun: new Date() };
    } catch (error) {
      logger.error({ err: error }, '[Pipeline] Realtime cycle error');
    } finally {
      this.state = { ...this.state, isCycleRunning: false };
    }
  }

  // ===========================
  // 센서 데이터 배치 수집
  // ===========================

  private sensorOffset = 0;

  private async collectSensorBatch(): Promise<void> {
    if (this.smaxtec.getStatus() !== 'connected') return;

    const db = getDb();
    const BATCH_SIZE = 30;

    // 활성 동물 중 센서 있는 것만 (offset으로 순환)
    const activeAnimals = await db
      .select({ animalId: animals.animalId, externalId: animals.externalId })
      .from(animals)
      .where(and(isNotNull(animals.externalId), eq(animals.status, 'active')))
      .limit(BATCH_SIZE)
      .offset(this.sensorOffset);

    if (activeAnimals.length === 0) {
      this.sensorOffset = 0; // 끝까지 갔으면 처음부터
      return;
    }
    this.sensorOffset += BATCH_SIZE;

    const now = new Date();
    const from = new Date(now.getTime() - 30 * 60 * 1000); // 최근 30분
    const fromStr = from.toISOString().split('T')[0]!;
    const toStr = now.toISOString().split('T')[0]!;

    let totalStored = 0;

    const metricTypeMap: Readonly<Record<string, string>> = {
      temp: 'temperature',
      act: 'activity',
    };

    for (const animal of activeAnimals) {
      if (!animal.externalId) continue;

      try {
        for (const metric of ['temp', 'act']) {
          const data = await this.smaxtec.fetchSensorData(
            animal.externalId, metric, fromStr, toStr,
          );
          if (!data?.metrics) continue;

          const metricData = data.metrics[metric];
          if (!metricData || metricData.length === 0) continue;

          // 최근 30분 데이터만 필터
          const recentData = metricData.filter((d) => d.ts * 1000 > from.getTime());
          if (recentData.length === 0) continue;

          const values = recentData.map((d) => ({
            animalId: animal.animalId,
            timestamp: new Date(d.ts * 1000),
            metricType: metricTypeMap[metric] ?? metric,
            value: d.value,
            qualityFlag: 'good' as const,
          }));

          await db.insert(sensorMeasurements).values(values);
          totalStored += values.length;
        }
      } catch {
        // 개별 동물 실패 무시
      }
    }

    if (totalStored > 0) {
      logger.info(
        { stored: totalStored, animals: activeAnimals.length, offset: this.sensorOffset },
        '[Pipeline] Sensor batch collected',
      );
    }
  }

  // ===========================
  // 배치 경로 (공공데이터)
  // ===========================

  async runBatchCycle(): Promise<void> {
    const since = this.state.lastBatchRun;
    logger.info({ since }, '[Pipeline] Running batch cycle');

    const batchConnectors: readonly BaseConnector[] = [
      this.traceability,
      this.dhi,
      this.pedigree,
      this.quarantine,
      this.weather,
    ];

    // 각 커넥터 독립 실행
    const results = await Promise.allSettled(
      batchConnectors.map((c) => ingest(c, since ?? undefined)),
    );

    results.forEach((r, i) => {
      const name = batchConnectors[i]!.config.name;
      if (r.status === 'rejected') {
        logger.error({ err: r.reason }, `[Pipeline] Batch failed: ${name}`);
      } else if (r.value.status === 'success') {
        logger.info({ count: r.value.data.count }, `[Pipeline] Batch completed: ${name}`);
      }
    });

    this.state = { ...this.state, lastBatchRun: new Date() };
  }

  // ===========================
  // Intelligence Loop 배치
  // ===========================

  async runIntelligenceLoopBatch(): Promise<void> {
    logger.info('[Pipeline] Running Intelligence Loop batch matching');
    try {
      const { runBatchMatching } = await import('../intelligence-loop/outcome-recorder.js');
      const result = await runBatchMatching();
      logger.info({ matched: result.matched, totalChecked: result.totalChecked }, '[Pipeline] Intelligence Loop batch matching completed');
    } catch (error) {
      logger.error({ err: error }, '[Pipeline] Intelligence Loop batch matching failed');
    }
  }

  // ===========================
  // 상태 조회
  // ===========================

  async getHealth(): Promise<{
    readonly isRunning: boolean;
    readonly lastRealtimeRun: Date | null;
    readonly lastBatchRun: Date | null;
    readonly connectors: readonly ConnectorHealth[];
  }> {
    const connectors: readonly BaseConnector[] = [
      this.smaxtec,
      this.traceability,
      this.dhi,
      this.pedigree,
      this.quarantine,
      this.weather,
    ];

    const health = await Promise.all(connectors.map((c) => c.healthCheck()));

    return {
      isRunning: this.state.isRunning,
      lastRealtimeRun: this.state.lastRealtimeRun,
      lastBatchRun: this.state.lastBatchRun,
      connectors: health,
    };
  }
}

// 싱글턴 인스턴스
let orchestratorInstance: PipelineOrchestrator | null = null;

export function getPipelineOrchestrator(): PipelineOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new PipelineOrchestrator();
  }
  return orchestratorInstance;
}
