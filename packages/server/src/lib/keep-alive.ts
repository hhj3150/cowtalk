// Railway cold start 방지 — 외부 URL ping으로 슬립 방지
// Railway는 외부 HTTP 트래픽이 없을 때 슬립하므로 localhost ping은 효과 없음
// RAILWAY_PUBLIC_DOMAIN 환경변수로 외부 URL 구성하여 실제 외부 요청 발생

import { logger } from './logger.js';

const PING_INTERVAL_MS = 4 * 60 * 1000; // 4분
let intervalId: ReturnType<typeof setInterval> | null = null;

/** Railway 공개 URL 조합 (여러 env var 패턴 지원) */
function buildPingUrl(port: number): string {
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN
    ?? process.env.RAILWAY_STATIC_URL?.replace(/^https?:\/\//, '')
    ?? process.env.RAILWAY_SERVICE_URL?.replace(/^https?:\/\//, '');
  if (domain) {
    return `https://${domain}/api/health`;
  }
  // fallback: localhost (개발 환경)
  return `http://localhost:${port}/api/health`;
}

export function startKeepAlive(port: number): void {
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('[KeepAlive] Skipped — not production');
    return;
  }

  if (intervalId) {
    return;
  }

  const pingUrl = buildPingUrl(port);
  logger.info({ pingUrl, intervalMs: PING_INTERVAL_MS }, '[KeepAlive] Starting — external ping mode');

  intervalId = setInterval(async () => {
    try {
      const res = await fetch(pingUrl, {
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

  intervalId.unref(); // 프로세스 종료 차단하지 않음
}

export function stopKeepAlive(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[KeepAlive] Stopped');
  }
}
