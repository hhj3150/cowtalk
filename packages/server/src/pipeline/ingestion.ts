// 데이터 수집 (Ingestion) — 커넥터에서 데이터 수신, 수집 기록 저장

import { getDb } from '../config/database.js';
import { dataSources, ingestionRuns } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import type { BaseConnector, FetchResult } from './connectors/base.connector.js';

// ===========================
// 수집 실행 기록
// ===========================

async function findOrCreateSource(
  sourceType: string,
  connectorConfig: Record<string, unknown>,
): Promise<string> {
  const db = getDb();
  const existing = await db
    .select()
    .from(dataSources)
    .where(eq(dataSources.sourceType, sourceType));

  if (existing[0]) {
    return existing[0].sourceId;
  }

  const [row] = await db
    .insert(dataSources)
    .values({ sourceType, config: connectorConfig, status: 'active' })
    .returning();

  if (!row) throw new Error(`Failed to create data source: ${sourceType}`);
  return row.sourceId;
}

async function startIngestionRun(sourceId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(ingestionRuns)
    .values({ sourceId, startedAt: new Date(), status: 'running' })
    .returning();

  if (!row) throw new Error('Failed to start ingestion run');
  return row.runId;
}

async function completeIngestionRun(
  runId: string,
  recordsCount: number,
  status: 'success' | 'failed' | 'partial',
  errorMessage?: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(ingestionRuns)
    .set({
      completedAt: new Date(),
      recordsCount,
      status,
      errorMessage: errorMessage ?? null,
    })
    .where(eq(ingestionRuns.runId, runId));
}

// ===========================
// 수집 실행
// ===========================

export interface IngestionResult<T> {
  readonly runId: string;
  readonly sourceType: string;
  readonly data: FetchResult<T>;
  readonly status: 'success' | 'failed' | 'partial';
  readonly error: string | null;
}

/**
 * 단일 커넥터에서 데이터를 수집하고 ingestion_runs에 기록
 */
export async function ingest<T>(
  connector: BaseConnector<T>,
  since?: Date,
): Promise<IngestionResult<T>> {
  const sourceId = await findOrCreateSource(
    connector.config.id,
    { name: connector.config.name },
  );
  const runId = await startIngestionRun(sourceId);

  logger.info(
    { connectorId: connector.config.id, runId },
    `[Ingestion] Starting ${connector.config.name}`,
  );

  try {
    const data = await connector.fetch(since);

    await completeIngestionRun(runId, data.count, 'success');
    logger.info(
      { connectorId: connector.config.id, count: data.count },
      `[Ingestion] Completed ${connector.config.name} — ${String(data.count)} records`,
    );

    return { runId, sourceType: connector.config.id, data, status: 'success', error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeIngestionRun(runId, 0, 'failed', message);

    logger.error(
      { connectorId: connector.config.id, err: error },
      `[Ingestion] Failed ${connector.config.name}`,
    );

    return {
      runId,
      sourceType: connector.config.id,
      data: { data: [], count: 0, fetchedAt: new Date(), hasMore: false },
      status: 'failed',
      error: message,
    };
  }
}

/**
 * 여러 커넥터를 병렬로 수집 — 하나 실패해도 나머지 정상
 */
export async function ingestAll(
  connectors: readonly BaseConnector[],
  since?: Date,
): Promise<readonly IngestionResult<unknown>[]> {
  const results = await Promise.allSettled(
    connectors.map((c) => ingest(c, since)),
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return {
      runId: '',
      sourceType: connectors[i]!.config.id,
      data: { data: [], count: 0, fetchedAt: new Date(), hasMore: false },
      status: 'failed' as const,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });
}
