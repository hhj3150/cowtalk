// AI 인사이트 훅 — 대시보드 인사이트 비동기 로드

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';

export interface AiInsight {
  readonly title: string;
  readonly description: string;
  readonly source: 'claude' | 'v4_fallback' | 'cache';
  readonly risks: readonly string[];
  readonly recommendations: readonly string[];
  readonly dataReferences: readonly string[];
  readonly generatedAt: string;
}

function fetchAiInsight(): Promise<AiInsight> {
  return apiGet<AiInsight>('/dashboard/insights');
}

export function useAiInsight() {
  return useQuery({
    queryKey: ['dashboard', 'ai-insight'],
    queryFn: fetchAiInsight,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
