// 백신 접종률 — 지역별 (quarantine/admin)

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as vaccineApi from '@web/api/vaccine.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly regionId: string;
}

export function VaccineCoverage({ regionId }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['vaccines', 'coverage', regionId],
    queryFn: () => vaccineApi.getRegionCoverage(regionId),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={4} />;
  if (!data?.length) return <p className="text-xs text-gray-400">접종률 데이터가 없습니다.</p>;

  return (
    <div className="space-y-3">
      {data.map((v) => {
        const gap = v.targetPercent - v.coveragePercent;
        const barColor = gap > 10 ? 'bg-red-500' : gap > 0 ? 'bg-yellow-500' : 'bg-green-500';
        return (
          <div key={v.vaccineName}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-gray-700">{v.vaccineName}</span>
              <span className="text-gray-500">{v.vaccinatedCount}/{v.totalAnimals} ({v.coveragePercent.toFixed(1)}%)</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-gray-100">
              <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${Math.min(v.coveragePercent, 100)}%` }} />
            </div>
            <div className="mt-0.5 flex justify-between text-[10px] text-gray-400">
              <span>0%</span>
              <span>목표 {v.targetPercent}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
