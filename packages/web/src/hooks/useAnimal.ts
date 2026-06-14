// 동물 훅

import { useQuery } from '@tanstack/react-query';
import { useEffectiveRole } from '@web/hooks/useEffectiveRole';
import * as animalApi from '@web/api/animal.api';

const STALE_TIME = 5 * 60 * 1000;

export function useAnimalList(params?: {
  farmId?: string;
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ['animals', params],
    queryFn: () => animalApi.listAnimals(params),
    staleTime: STALE_TIME,
  });
}

export function useAnimalDetail(animalId: string | null) {
  const role = useEffectiveRole();

  return useQuery({
    queryKey: ['animal', animalId, role],
    queryFn: () => animalApi.getAnimalDetail(animalId!, role),
    enabled: Boolean(animalId),
    staleTime: STALE_TIME,
  });
}

// AI 해석 — status='computing' 이면 3초 간격으로 폴링, 'ready' 가 되면 폴링 중단.
export function useAnimalInterpretation(animalId: string | null) {
  const role = useEffectiveRole();

  return useQuery({
    queryKey: ['animal-interpretation', animalId, role],
    queryFn: () => animalApi.getAnimalInterpretation(animalId!, role),
    enabled: Boolean(animalId),
    refetchInterval: (query) =>
      query.state.data?.status === 'computing' ? 3000 : false,
  });
}
