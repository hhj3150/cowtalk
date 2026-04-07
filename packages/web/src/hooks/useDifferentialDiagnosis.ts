// 감별진단 React Query Hook — 수동 트리거 방식

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import type { DifferentialDiagnosisResult } from '@cowtalk/shared';

export function useDifferentialDiagnosis(
  animalId: string,
  enabled: boolean,
  symptoms: readonly string[] = [],
) {
  const symptomsKey = [...symptoms].sort().join(',');
  const query = symptomsKey
    ? `/diagnosis/${animalId}?symptoms=${encodeURIComponent(symptomsKey)}`
    : `/diagnosis/${animalId}`;

  return useQuery({
    queryKey: ['differential-diagnosis', animalId, symptomsKey],
    queryFn: () => apiGet<DifferentialDiagnosisResult>(query),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
