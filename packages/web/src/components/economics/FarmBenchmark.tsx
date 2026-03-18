// 농장 간 벤치마크 비교

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as economicsApi from '@web/api/economics.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly tenantId: string;
  readonly currentFarmId?: string;
}

export function FarmBenchmark({ tenantId, currentFarmId }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['economics', 'benchmark', tenantId],
    queryFn: () => economicsApi.getBenchmark(tenantId),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={5} />;
  if (!data?.length) return <p className="text-xs text-gray-400">벤치마크 데이터가 없습니다.</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">동일 그룹 내 농장 비교 ({data.length}개 농장)</p>
      <div className="space-y-2">
        {data.map((farm) => {
          const isCurrent = farm.farmId === currentFarmId;
          return (
            <div key={farm.farmId} className={`rounded-lg border p-3 ${isCurrent ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isCurrent ? 'text-blue-700' : 'text-gray-800'}`}>
                  {farm.farmName} {isCurrent && '(내 농장)'}
                </span>
                <span className="text-xs text-gray-400">#{farm.rank}/{farm.totalFarms}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(farm.metrics).map(([key, m]) => (
                  <div key={key} className="rounded bg-gray-50 px-2 py-1 text-center text-[10px]">
                    <p className="text-gray-400">{key}</p>
                    <p className="font-bold text-gray-700">{m.value}</p>
                    <div className="mt-0.5 h-1 w-12 rounded-full bg-gray-200">
                      <div className="h-1 rounded-full bg-blue-500" style={{ width: `${m.percentile}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
