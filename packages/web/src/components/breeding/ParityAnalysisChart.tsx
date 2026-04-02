// 산차별 KPI 분석 차트 — 산차 그룹별 수태율·발정탐지율 비교

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend,
} from 'recharts';
import { getParityAnalysisData } from '@web/api/breeding.api';
import { useFarmStore } from '@web/stores/farm.store';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'rgba(0,0,0,0.85)',
  border: 'none',
  borderRadius: 8,
  fontSize: 12,
  color: '#fff',
};

const COLORS = {
  conceptionRate: '#16a34a',
  estrusDetectionRate: '#2563eb',
} as const;

export default function ParityAnalysisChart(): React.JSX.Element {
  const { selectedFarmId } = useFarmStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['breeding-parity', selectedFarmId],
    queryFn: () => getParityAnalysisData(selectedFarmId ?? undefined),
    staleTime: 10 * 60_000,
  });

  if (isLoading) return <LoadingSkeleton lines={4} />;

  if (isError || !data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>산차별 데이터가 없습니다</p>
      </div>
    );
  }

  // 0두 그룹 제외
  const filtered = data.filter((g) => g.animalCount > 0);

  const chartData = filtered.map((g) => ({
    name: g.parityLabel,
    count: g.animalCount,
    conceptionRate: g.conceptionRate,
    estrusDetectionRate: g.estrusDetectionRate,
  }));

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
        산차별 번식 성적 비교 — 초산우(1산)와 경산우(2산+) 관리 전략 차별화
      </p>

      {/* 차트 */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: 'var(--ct-text)' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--ct-text-secondary)' }}
              tickFormatter={(v: number) => `${v}%`}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number, name: string) => [
                `${v}%`,
                name === 'conceptionRate' ? '수태율' : '발정탐지율',
              ]}
              labelFormatter={(label: string) => `${label}`}
            />
            <Legend
              formatter={(value: string) =>
                value === 'conceptionRate' ? '수태율' : '발정탐지율'
              }
              wrapperStyle={{ fontSize: 12 }}
            />
            <Bar
              dataKey="conceptionRate"
              fill={COLORS.conceptionRate}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
            <Bar
              dataKey="estrusDetectionRate"
              fill={COLORS.estrusDetectionRate}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 그룹별 두수 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {filtered.map((g) => (
          <div
            key={g.parityLabel}
            className="rounded-lg p-3 text-center"
            style={{ background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
          >
            <p className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>{g.parityLabel}</p>
            <p className="text-lg font-bold mt-1" style={{ color: 'var(--ct-primary)' }}>
              {g.animalCount}두
            </p>
            <div className="mt-1 space-y-0.5">
              <p className="text-[10px]" style={{ color: COLORS.conceptionRate }}>
                수태 {g.conceptionRate}%
              </p>
              <p className="text-[10px]" style={{ color: COLORS.estrusDetectionRate }}>
                탐지 {g.estrusDetectionRate}%
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 인사이트 힌트 */}
      <div
        className="rounded-lg p-3"
        style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.15)' }}
      >
        <p className="text-xs" style={{ color: '#2563eb' }}>
          <strong>TIP:</strong> 초산우(1산)는 경산우 대비 수태율이 낮은 경향.
          체중·영양상태 관리와 적절한 수정 시기(자발적 VWP 60일+) 준수가 핵심입니다.
        </p>
      </div>
    </div>
  );
}
