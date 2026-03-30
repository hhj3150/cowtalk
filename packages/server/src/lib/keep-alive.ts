// Railway cold start 방지 — 서버 자체 ping으로 슬립 방지
// 5분 간격으로 자신의 health 엔드포인트를 호출하여 Railway가 서버를 잠들게 하지 않음

import { logger } from './logger.js';

const PING_INTERVAL_MS = 4 * 60 * 1000; // 4분
let intervalId: ReturnType<typeof setInterval> | null = null;

export function startKeepAlive(port: number): void {
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('[KeepAlive] Skipped — not production');
    return;
  }

  if (intervalId) {
    return;
  }

  intervalId = setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        logger.debug('[KeepAlive] Ping OK');
      } else {
        logger.warn({ status: res.status }, '[KeepAlive] Ping returned non-OK');
      }
    } catch (err) {
      logger.warn({ err }, '[KeepAlive] Ping failed');
    }
  }, PING_INTERVAL_MS);

  // 프로세스 종료 시 정리
  intervalId.unref();

  logger.info({ intervalMs: PING_INTERVAL_MS }, '[KeepAlive] Self-ping started');
}

export function stopKeepAlive(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[KeepAlive] Stopped');
  }
}
