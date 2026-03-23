// 오프라인 상태 배너 — 네트워크 끊김 시 상단에 표시
// 대기 중인 기록 수 + 온라인 복귀 시 자동 동기화

import React, { useState, useEffect, useCallback } from 'react';
import { apiPost } from '@web/api/client';
import { countPending, flushQueue } from '@web/lib/offline-queue';

export function OfflineBanner(): React.JSX.Element | null {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(async () => {
    const n = await countPending();
    setPending(n);
  }, []);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOffline(false);
      setLastSync(new Date());

      // 온라인 복귀 시 대기 기록 자동 동기화
      const count = await countPending();
      if (count === 0) return;

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
    };

    const handleOffline = () => {
      setIsOffline(true);
      setLastSync(new Date());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 오프라인 큐 변경 감지 (CustomEvent)
    window.addEventListener('offline-queue-updated', refreshCount as EventListener);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-queue-updated', refreshCount as EventListener);
    };
  }, [refreshCount]);

  // 온라인이고 대기 기록도 없으면 배너 숨김
  if (!isOffline && pending === 0) return null;

  const syncAgo = lastSync
    ? `${Math.round((Date.now() - lastSync.getTime()) / 60000)}분 전`
    : '알 수 없음';

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
        {syncing ? `동기화 중...` : `기록 ${String(pending)}건 동기화 대기 중`}
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
      오프라인
      {pending > 0
        ? ` — 기록 ${String(pending)}건 동기화 대기 중`
        : ` — 마지막 동기화: ${syncAgo}`}
      {pending === 0 && (
        <span style={{ fontSize: 10, opacity: 0.8 }}>
          (캐시된 데이터가 표시됩니다)
        </span>
      )}
    </div>
  );
}
