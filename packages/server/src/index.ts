// 서버 엔트리포인트 — HTTP + Socket.IO + Graceful Shutdown

import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config, getDatabaseUrl } from './config/index.js';
import { logger } from './lib/logger.js';
import { closeDb } from './config/database.js';
import { getPipelineOrchestrator } from './pipeline/orchestrator.js';
import { startKeepAlive, stopKeepAlive } from './lib/keep-alive.js';
import { startReportCleanup, stopReportCleanup } from './services/report/cleanup.js';
import { seedSemenCatalog } from './services/breeding/semen-seed.service.js';
import { createSocketServer } from './realtime/socket-server.js';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

// 서버 시작 전 마이그레이션 자동 실행 (postgres 드라이버 직접 사용)
const __dirname = dirname(fileURLToPath(import.meta.url));
async function ensureMigrations(): Promise<void> {
  const pgSql = postgres(getDatabaseUrl());
  const migrationsDir = resolve(__dirname, 'db', 'migrations');
  try {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const migration = readFileSync(resolve(migrationsDir, file), 'utf-8')
        .replace(/CREATE EXTENSION IF NOT EXISTS "timescaledb";/g, '-- skip')
        .replace(/SELECT create_hypertable\([^)]+\);/g, '-- skip');
      await pgSql.unsafe(migration);
    }
    logger.info({ count: files.length }, '[Migrations] Auto-migration complete');
  } catch (err) {
    logger.warn({ err }, '[Migrations] Auto-migration warning — some tables may already exist');
  } finally {
    await pgSql.end();
  }
}

await ensureMigrations();

const app = createApp();
const httpServer = createServer(app);

// Socket.IO 서버 초기화
createSocketServer(httpServer);

const server = httpServer.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, `CowTalk v5.0 server listening (HTTP + WebSocket)`);

  // Railway cold start 방지 — self-ping
  startKeepAlive(config.PORT);

  // 만료 보고서 자동 정리 (매 시간)
  startReportCleanup();

  // 씨수소 카탈로그 시딩 (DB 비어있을 때만 자동 실행)
  seedSemenCatalog().catch((err) => {
    logger.error({ err }, '[SemenSeed] 카탈로그 시딩 실패');
  });

  // 파이프라인 자동 시작 (smaXtec 크레덴셜이 있을 때만)
  if (config.SMAXTEC_EMAIL && config.SMAXTEC_PASSWORD) {
    const pipeline = getPipelineOrchestrator();
    pipeline.start().catch((err) => {
      logger.error({ err }, '[Pipeline] Failed to start on server boot');
    });
  } else {
    logger.warn('[Pipeline] smaXtec credentials not configured — pipeline disabled');
  }
});

// --- Graceful Shutdown ---

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutdown signal received');

  server.close(async () => {
    logger.info('HTTP server closed');
    try {
      stopKeepAlive();
      stopReportCleanup();
      // 파이프라인 정지
      const pipeline = getPipelineOrchestrator();
      await pipeline.stop();
      await closeDb();
      logger.info('Database connection closed');
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
    }
    process.exit(0);
  });

  // 10초 후 강제 종료
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception — shutting down');
  process.exit(1);
});
