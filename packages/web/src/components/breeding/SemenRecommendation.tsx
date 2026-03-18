// 정액 추천 패널

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as breedingApi from '@web/api/breeding.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { EmptyState } from '@web/components/common/EmptyState';

interface Props {
  readonly animalId: string;
}

export function SemenRecommendation({ animalId }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['breeding', 'recommend', animalId],
    queryFn: () => breedingApi.getMatingRecommendations(animalId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={3} />;
  if (!data?.length) return <EmptyState message="추천 정액이 없습니다." />;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-900">정액 추천</h4>
      {data.map((rec) => (
        <div key={rec.semenId} className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-blue-600">#{rec.rank}</span>
              <span className="ml-2 text-sm font-medium">{rec.sireName}</span>
              <span className="ml-2 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-700">
                {rec.a2Status}
              </span>
            </div>
            <span className="text-xs text-gray-500">
              근교 {(rec.inbreedingCoefficient * 100).toFixed(1)}%
            </span>
          </div>
          {rec.milkYieldGain !== null && (
            <p className="mt-1 text-xs text-gray-500">예상 유량 {rec.milkYieldGain > 0 ? '+' : ''}{rec.milkYieldGain}kg</p>
          )}
          <p className="mt-1 text-xs text-gray-400">{rec.reasoning}</p>
        </div>
      ))}
    </div>
  );
}
