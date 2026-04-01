// 만료된 보고서 파일 자동 정리

import fs from 'fs';
import path from 'path';
import { REPORT_CONFIG } from './config.js';
import { logger } from '../../lib/logger.js';

export function cleanupExpiredReports(): void {
  const dir = REPORT_CONFIG.OUTPUT_DIR;
  if (!fs.existsSync(dir)) return;

  const maxAge = REPORT_CONFIG.FILE_RETENTION_HOURS * 3_600_000;
  let cleaned = 0;

  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      if (Date.now() - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }
  } catch (err) {
    logger.warn({ err }, '[Cleanup] Failed to clean reports directory');
  }

  if (cleaned > 0) {
    logger.info(`[Cleanup] Deleted ${String(cleaned)} expired report(s)`);
  }
}

// 매 시간 실행
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startReportCleanup(): void {
  cleanupExpiredReports();
  cleanupInterval = setInterval(cleanupExpiredReports, 3_600_000);
}

export function stopReportCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
