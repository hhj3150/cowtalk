// 서버 엔트리포인트 — HTTP + Socket.IO + Graceful Shutdown

import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { closeDb } from './config/database.js';
import { getPipelineOrchestrator } from './pipeline/orchestrator.js';
import { startKeepAlive, stopKeepAlive } from './lib/keep-alive.js';
import { startEventLoopMonitor } from './lib/event-loop-monitor.js';
import { startReportCleanup, stopReportCleanup } from './services/report/cleanup.js';
import { seedSemenCatalog, seedFarmSemenInventory } from './services/breeding/semen-seed.service.js';
import { createSocketServer } from './realtime/socket-server.js';
import { runAutoMigrations } from './db/auto-migrate.js';

// 서버 시작 전 마이그레이션 자동 실행 — 파일별 격리(한 파일 실패가 이후를 막지 않음).
await runAutoMigrations();

const app = createApp();
const httpServer = createServer(app);

// Socket.IO 서버 초기화
createSocketServer(httpServer);

// Event loop lag 측정 시작 — 서버 가동 직후부터 누적 (서버 부팅 전에 시작해야 초기 히스토그램 포함)
startEventLoopMonitor();

const server = httpServer.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, `CowTalk v5.0 server listening (HTTP + WebSocket)`);

  // Railway cold start 방지 — self-ping
  startKeepAlive(config.PORT);

  // 만료 보고서 자동 정리 (매 시간)
  startReportCleanup();

  // 씨수소 카탈로그 시딩 → 농장 보유 정액 시딩 (추천이 실제로 뜨도록)
  seedSemenCatalog()
    .then(() => seedFarmSemenInventory())
    .catch((err) => {
      logger.error({ err }, '[SemenSeed] 카탈로그/인벤토리 시딩 실패');
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
