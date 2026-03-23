// 오프라인 상태 배너 — 네트워크 끊김 시 상단에 표시

import React, { useState, useEffect } from 'react';

export function OfflineBanner(): React.JSX.Element | null {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setLastSync(new Date());
    };
    const handleOffline = () => {
      setIsOffline(true);
      setLastSync(new Date());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  const syncAgo = lastSync
    ? `${Math.round((Date.now() - lastSync.getTime()) / 60000)}분 전`
    : '알 수 없음';

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
      오프라인 모드 — 마지막 동기화: {syncAgo}
      <span style={{ fontSize: 10, opacity: 0.8 }}>
        (캐시된 데이터가 표시됩니다)
      </span>
    </div>
  );
}
