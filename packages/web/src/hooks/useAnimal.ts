// 동물 훅

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@web/stores/auth.store';
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
  const role = useAuthStore((s) => s.user?.role);

  return useQuery({
    queryKey: ['animal', animalId, role],
    queryFn: () => animalApi.getAnimalDetail(animalId!, role),
    enabled: Boolean(animalId),
    staleTime: STALE_TIME,
  });
}
