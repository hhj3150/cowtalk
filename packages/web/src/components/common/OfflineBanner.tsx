// 오프라인 상태 배너 — 실제 서버 연결 확인 후 표시
// navigator.onLine만으로는 부정확 → /api/health 핑으로 검증
// 대기 중인 기록 수 + 온라인 복귀 시 자동 동기화

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiPost } from '@web/api/client';
import { countPending, flushQueue } from '@web/lib/offline-queue';

const HEALTH_URL = `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/health`;
const PING_INTERVAL_MS = 30_000; // 30초마다 재확인

async function checkServerReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(HEALTH_URL, { method: 'GET', signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export function OfflineBanner(): React.JSX.Element | null {
  const [isOffline, setIsOffline] = useState(false); // 초기값: 온라인 가정 (서버 핑으로 검증)
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const n = await countPending();
      setPending(n);
    } catch {
      // IndexedDB 접근 실패 — 무시
    }
  }, []);

  // 서버 연결 확인 + 온라인 복귀 시 동기화
  const verifyConnection = useCallback(async () => {
    const reachable = await checkServerReachable();

    if (reachable) {
      const wasOffline = isOffline;
      setIsOffline(false);

      if (wasOffline) {
        setLastSync(new Date());
      }

      // 대기 기록 있으면 동기화
      const count = await countPending();
      if (count > 0) {
        setSyncing(true);
        try {
          const flushed = await flushQueue(async (payload) => {
            await apiPost('/events', payload);
          });
          if (flushed > 0) {
            setLastSync(new Date());
          }
        } finally {
          setSyncing(false);
          await refreshCount();
        }
      } else {
        setPending(0);
      }
    } else {
      setIsOffline(true);
    }
  }, [isOffline, refreshCount]);

  // 초기 로드 + 주기적 연결 확인
  useEffect(() => {
    // 브라우저가 오프라인이면 즉시 표시
    if (!navigator.onLine) {
      setIsOffline(true);
    } else {
      // 온라인이지만 서버 실제 도달 가능한지 확인 (비차단)
      void verifyConnection();
    }

    void refreshCount();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // navigator.onLine 이벤트 + 주기적 핑
  useEffect(() => {
    const handleOnline = () => void verifyConnection();
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-queue-updated', refreshCount as EventListener);

    // 오프라인 상태일 때만 주기적 핑 (복귀 감지)
    if (isOffline) {
      pingRef.current = setInterval(() => void verifyConnection(), PING_INTERVAL_MS);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-queue-updated', refreshCount as EventListener);
      if (pingRef.current) clearInterval(pingRef.current);
    };
  }, [isOffline, verifyConnection, refreshCount]);

  // 온라인이고 대기 기록도 없으면 배너 숨김
  if (!isOffline && pending === 0) return null;

  const syncAgo = lastSync
    ? `${Math.max(0, Math.round((Date.now() - lastSync.getTime()) / 60000))}분 전`
    : null;

  // 온라인이지만 동기화 중 or 대기 기록 있을 때
  if (!isOffline && pending > 0) {
    return (
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '6px 16px',
          background: '#f97316',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span>{syncing ? '⏳' : '📤'}</span>
        {syncing ? '동기화 중...' : `기록 ${String(pending)}건 동기화 대기 중`}
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '6px 16px',
        background: 'linear-gradient(90deg, #f97316, #ef4444)',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <span style={{ fontSize: 14 }}>📡</span>
      서버 연결 끊김
      {pending > 0
        ? ` — 기록 ${String(pending)}건 동기화 대기 중`
        : syncAgo ? ` — 마지막 연결: ${syncAgo}` : ''}
      <button
        type="button"
        onClick={() => void verifyConnection()}
        style={{
          marginLeft: 8,
          padding: '2px 10px',
          borderRadius: 4,
          border: '1px solid rgba(255,255,255,0.5)',
          background: 'rgba(255,255,255,0.15)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        재연결
      </button>
    </div>
  );
}
