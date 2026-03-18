// 자동 갱신 훅 — 5분 주기 + "최종 업데이트" 시각

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5분

export function useAutoRefresh() {
  const queryClient = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries();
    setLastUpdated(new Date());
  }, [queryClient]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      refresh();
    }, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refresh]);

  return {
    lastUpdated,
    refresh,
    formattedTime: formatTime(lastUpdated),
  };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
