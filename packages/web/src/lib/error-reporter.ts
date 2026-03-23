// 전역 에러 수집 — window.onerror + unhandledrejection → /api/errors/log
// Sentry 연동 전 최소 인터페이스

import { apiPost } from '@web/api/client';

interface ErrorPayload {
  readonly message: string;
  readonly stack?: string;
  readonly source?: string;
  readonly lineno?: number;
  readonly colno?: number;
  readonly url?: string;
  readonly type: 'error' | 'unhandledrejection' | 'react' | 'api';
  readonly componentStack?: string;
  readonly timestamp: string;
}

// 중복 방지: 같은 메시지 5초 내 재전송 안 함
const recentErrors = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000;

function isDuplicate(message: string): boolean {
  const now = Date.now();
  const last = recentErrors.get(message);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentErrors.set(message, now);
  // 오래된 항목 정리
  if (recentErrors.size > 100) {
    for (const [key, ts] of recentErrors) {
      if (now - ts > DEDUP_WINDOW_MS) recentErrors.delete(key);
    }
  }
  return false;
}

function sendError(payload: ErrorPayload): void {
  if (isDuplicate(payload.message)) return;

  apiPost('/errors/log', payload).catch(() => {
    // 에러 로깅 실패는 무시 (무한 루프 방지)
  });
}

/** window.onerror 핸들러 */
function handleWindowError(
  message: string | Event,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error,
): void {
  sendError({
    message: typeof message === 'string' ? message : 'Unknown error',
    stack: error?.stack,
    source,
    lineno,
    colno,
    url: window.location.href,
    type: 'error',
    timestamp: new Date().toISOString(),
  });
}

/** unhandledrejection 핸들러 */
function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  sendError({
    message: reason?.message ?? String(reason ?? 'Unhandled rejection'),
    stack: reason?.stack,
    url: window.location.href,
    type: 'unhandledrejection',
    timestamp: new Date().toISOString(),
  });
}

/** React ErrorBoundary에서 호출 */
export function reportReactError(error: Error, componentStack?: string): void {
  sendError({
    message: error.message,
    stack: error.stack,
    componentStack,
    url: window.location.href,
    type: 'react',
    timestamp: new Date().toISOString(),
  });
}

/** API 에러 보고 */
export function reportApiError(url: string, status: number, message: string): void {
  sendError({
    message: `API Error: ${String(status)} ${message}`,
    source: url,
    url: window.location.href,
    type: 'api',
    timestamp: new Date().toISOString(),
  });
}

/** 전역 에러 핸들러 등록 — main.tsx에서 1회 호출 */
export function initErrorReporter(): void {
  window.onerror = handleWindowError;
  window.onunhandledrejection = handleUnhandledRejection;
}
