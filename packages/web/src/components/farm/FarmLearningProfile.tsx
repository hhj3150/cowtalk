// 농장 학습 이력 — 계절별 질병 패턴 + 선제 알림

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as farmApi from '@web/api/farm.api';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly farmId: string;
}

export function FarmLearningProfile({ farmId }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['farm', 'learning', farmId],
    queryFn: () => farmApi.getFarmLearning(farmId),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={4} />;
  if (!data) return <p className="text-xs text-gray-400">학습 데이터가 아직 없습니다.</p>;

  return (
    <div className="space-y-4">
      {/* 선제 알림 */}
      {data.preemptiveAlerts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h4 className="text-xs font-semibold text-amber-800">선제 알림</h4>
          <ul className="mt-1 space-y-1">
            {data.preemptiveAlerts.map((alert, i) => (
              <li key={i} className="text-xs text-amber-700">• {alert}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 계절별 패턴 */}
      {data.patterns.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-gray-800">학습된 패턴</h4>
          <div className="space-y-2">
            {data.patterns.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded bg-gray-50 px-3 py-2 text-xs">
                <div>
                  <Badge label={p.season} variant="info" />
                  <span className="ml-2 text-gray-700">{p.pattern}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <span>{p.frequency}회</span>
                  <span>마지막: {p.lastOccurred}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
