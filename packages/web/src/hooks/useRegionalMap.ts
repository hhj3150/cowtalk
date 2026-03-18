// 지역 지도 훅

import { useQuery } from '@tanstack/react-query';
import * as regionalApi from '@web/api/regional.api';

const STALE_TIME = 5 * 60 * 1000;

export function useRegionalMap(mode?: 'status' | 'estrus' | 'health' | 'sensor') {
  return useQuery({
    queryKey: ['regional', 'map', mode],
    queryFn: () => regionalApi.getRegionalMapData({ mode }),
    staleTime: STALE_TIME,
    refetchInterval: STALE_TIME,
  });
}

export function useRegionalSummary() {
  return useQuery({
    queryKey: ['regional', 'summary'],
    queryFn: () => regionalApi.getRegionalSummary(),
    staleTime: STALE_TIME,
  });
}
