// 서버 엔트리포인트 — Graceful Shutdown 포함

import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { closeDb } from './config/database.js';
import { getPipelineOrchestrator } from './pipeline/orchestrator.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, `CowTalk v5.0 server listening`);

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
