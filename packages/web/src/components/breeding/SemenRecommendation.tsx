// 정액 추천 패널 — 학습 근거(목장 내 과거 수태율) + 근교 위험 표시

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as breedingApi from '@web/api/breeding.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { EmptyState } from '@web/components/common/EmptyState';

interface Props {
  readonly animalId: string;
}

const RISK_LABEL: Record<'low' | 'medium' | 'high', { label: string; cls: string }> = {
  low: { label: '근교 낮음', cls: 'bg-emerald-50 text-emerald-700' },
  medium: { label: '근교 주의', cls: 'bg-amber-50 text-amber-700' },
  high: { label: '근교 경고', cls: 'bg-rose-50 text-rose-700' },
};

export function SemenRecommendation({ animalId }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['breeding', 'advice', animalId],
    queryFn: () => breedingApi.getBreedingAdvice(animalId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={3} />;
  const recs = data?.recommendations ?? [];
  if (!recs.length) return <EmptyState message="추천 정액이 없습니다." />;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-900">정액 추천</h4>
      {recs.map((rec) => {
        const risk = RISK_LABEL[rec.inbreedingRisk];
        return (
          <div key={rec.semenId} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-600">#{rec.rank}</span>
                  <span className="truncate text-sm font-medium">{rec.bullName}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-gray-500">
                  {rec.bullRegistration ?? '등록번호 없음'} · 점수 {rec.score}
                </div>
              </div>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${risk.cls}`}>
                {risk.label} {(rec.estimatedInbreeding * 100).toFixed(1)}%
              </span>
            </div>

            {rec.milkYieldGain !== null && rec.milkYieldGain > 0 && (
              <p className="mt-1 text-xs text-gray-500">
                예상 유량 +{rec.milkYieldGain}kg
              </p>
            )}

            {rec.pastSampleSize >= 2 && rec.pastConceptionRate !== null && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                  학습
                </span>
                <span className="text-[11px] text-gray-600">
                  본 목장 {rec.pastSampleSize}회 · 수태율 {rec.pastConceptionRate}%
                  {rec.learningBonus !== 0 && (
                    <span className={rec.learningBonus > 0 ? 'ml-1 text-emerald-600' : 'ml-1 text-rose-600'}>
                      ({rec.learningBonus > 0 ? '+' : ''}{rec.learningBonus}pt)
                    </span>
                  )}
                </span>
              </div>
            )}

            <p className="mt-1 text-xs text-gray-400">{rec.reasoning}</p>
          </div>
        );
      })}
    </div>
  );
}
