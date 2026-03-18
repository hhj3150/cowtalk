// 비유곡선 예측 차트 — 젖소 전용

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import * as lactationApi from '@web/api/lactation.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly animalId: string;
}

export function LactationCurveChart({ animalId }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['lactation', animalId],
    queryFn: () => lactationApi.getLactationCurve(animalId),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={6} />;
  if (!data) return <p className="text-xs text-gray-400">비유 데이터가 없습니다.</p>;

  const chartData = data.data.map((d) => ({
    dim: d.dim,
    actual: d.actualYield,
    predicted: d.predictedYield,
  }));

  return (
    <div className="space-y-4">
      {/* 주요 지표 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <InfoCell label="현재 비유일수" value={`${data.currentDim}일`} />
        <InfoCell label="최대유량 시점" value={`DIM ${data.peakYieldDim}`} />
        <InfoCell label="최대유량" value={`${data.peakYieldKg}kg`} />
        <InfoCell label="건유 권장" value={`DIM ${data.recommendedDryOffDim}`} />
        <InfoCell label="수정 적기" value={`DIM ${data.optimalBreedingDim}`} />
      </div>

      {/* 비유곡선 차트 */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="dim" tick={{ fontSize: 11 }} label={{ value: 'DIM (일)', position: 'insideBottom', offset: -5, fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} label={{ value: '유량 (kg)', angle: -90, position: 'insideLeft', fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="actual" name="실측" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            <Line type="monotone" dataKey="predicted" name="예측" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
            <ReferenceLine x={data.currentDim} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '현재', fontSize: 10, fill: '#ef4444' }} />
            <ReferenceLine x={data.optimalBreedingDim} stroke="#ec4899" strokeDasharray="3 3" label={{ value: '수정적기', fontSize: 10, fill: '#ec4899' }} />
            <ReferenceLine x={data.recommendedDryOffDim} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: '건유', fontSize: 10, fill: '#f59e0b' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 경제성 */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-3">
        <h4 className="text-xs font-semibold text-green-800">경제성 예측</h4>
        <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-green-600">예상 총산유량</p>
            <p className="font-bold text-green-800">{data.totalExpectedYield.toLocaleString()}kg</p>
          </div>
          <div>
            <p className="text-green-600">유가 (kg당)</p>
            <p className="font-bold text-green-800">{data.economicEstimate.milkPricePerKg.toLocaleString()}원</p>
          </div>
          <div>
            <p className="text-green-600">예상 수입</p>
            <p className="font-bold text-green-800">{data.economicEstimate.totalExpectedRevenue.toLocaleString()}원</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded bg-gray-50 p-2 text-center">
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className="text-sm font-bold text-gray-800">{value}</p>
    </div>
  );
}
