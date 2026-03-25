// 지역 지도 훅 — retry + 60초 실시간 갱신

import { useQuery } from '@tanstack/react-query';
import * as regionalApi from '@web/api/regional.api';

const STALE_TIME = 60 * 1000; // 1분
const REFETCH_INTERVAL = 60 * 1000; // 60초 자동 갱신

export function useRegionalMap(mode?: 'status' | 'estrus' | 'health' | 'sensor') {
  return useQuery({
    queryKey: ['regional', 'map', mode],
    queryFn: () => regionalApi.getRegionalMapData({ mode }),
    staleTime: STALE_TIME,
    refetchInterval: REFETCH_INTERVAL,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}

export function useRegionalSummary() {
  return useQuery({
    queryKey: ['regional', 'summary'],
    queryFn: () => regionalApi.getRegionalSummary(),
    staleTime: STALE_TIME,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}
