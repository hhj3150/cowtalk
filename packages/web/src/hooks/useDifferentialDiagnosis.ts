// 감별진단 React Query Hook — 수동 트리거 방식

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import type { DifferentialDiagnosisResult } from '@cowtalk/shared';

export function useDifferentialDiagnosis(
  animalId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['differential-diagnosis', animalId],
    queryFn: () =>
      apiGet<DifferentialDiagnosisResult>(`/diagnosis/${animalId}`),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
