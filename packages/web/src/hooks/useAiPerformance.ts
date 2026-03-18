// AI 성능 분석 훅

import { useQuery } from '@tanstack/react-query';
import * as aiApi from '@web/api/ai-performance.api';

export function usePerformanceOverview(params?: {
  from?: string;
  to?: string;
  farmId?: string;
}) {
  return useQuery({
    queryKey: ['ai', 'performance', params],
    queryFn: () => aiApi.getPerformanceOverview(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAccuracyTrend(engineType: string, months?: number) {
  return useQuery({
    queryKey: ['ai', 'trend', engineType, months],
    queryFn: () => aiApi.getAccuracyTrend(engineType, months),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(engineType),
  });
}

export function useRoleFeedbackStats(params?: {
  from?: string;
  to?: string;
}) {
  return useQuery({
    queryKey: ['ai', 'roles', params],
    queryFn: () => aiApi.getRoleFeedbackStats(params),
    staleTime: 5 * 60 * 1000,
  });
}
