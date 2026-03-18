// 유사 농장 추천 — 벤치마킹

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as farmApi from '@web/api/farm.api';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly farmId: string;
}

const RANK_LABELS: Record<string, { label: string; variant: 'success' | 'info' | 'medium' | 'high' | 'critical' }> = {
  top10: { label: '상위 10%', variant: 'success' },
  top30: { label: '상위 30%', variant: 'info' },
  average: { label: '평균', variant: 'medium' },
  bottom30: { label: '하위 30%', variant: 'high' },
  bottom10: { label: '하위 10%', variant: 'critical' },
};

export function SimilarFarmRecommendation({ farmId }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['farm', 'similar', farmId],
    queryFn: () => farmApi.getSimilarFarms(farmId),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={5} />;
  if (!data?.length) return <p className="text-xs text-gray-400">유사 농장 데이터가 없습니다.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">규모·품종·환경이 유사한 농장과의 비교 (농장명 익명화)</p>
      <div className="space-y-2">
        {data.map((farm, i) => {
          const rank = RANK_LABELS[farm.rank] ?? { label: farm.rank, variant: 'info' as const };
          return (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{farm.anonymizedName}</span>
                <Badge label={rank.label} variant={rank.variant} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded bg-gray-50 p-1.5 text-center">
                  <p className="text-gray-400">수태율</p>
                  <p className="font-bold text-gray-700">{farm.conceptionRate}%</p>
                </div>
                <div className="rounded bg-gray-50 p-1.5 text-center">
                  <p className="text-gray-400">공태일</p>
                  <p className="font-bold text-gray-700">{farm.openDaysAvg}일</p>
                </div>
                <div className="rounded bg-gray-50 p-1.5 text-center">
                  <p className="text-gray-400">폐사율</p>
                  <p className="font-bold text-gray-700">{farm.mortalityRate}%</p>
                </div>
                <div className="rounded bg-gray-50 p-1.5 text-center">
                  <p className="text-gray-400">{farm.milkYieldAvg ? '유량' : '증체'}</p>
                  <p className="font-bold text-gray-700">{farm.milkYieldAvg ? `${farm.milkYieldAvg}kg` : farm.dailyGainAvg ? `${farm.dailyGainAvg}g` : '-'}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
