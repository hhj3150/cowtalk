// 액션 훅

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';

const STALE_TIME = 5 * 60 * 1000;

export interface ActionPlan {
  readonly actionId: string;
  readonly priority: number;
  readonly action: string;
  readonly target: string;
  readonly urgency: string;
  readonly status: string;
  readonly animalId: string | null;
  readonly farmId: string;
  readonly createdAt: string;
}

export function useActions(params?: { farmId?: string; status?: string }) {
  return useQuery({
    queryKey: ['actions', params],
    queryFn: () => apiGet<readonly ActionPlan[]>('/actions', params),
    staleTime: STALE_TIME,
  });
}
