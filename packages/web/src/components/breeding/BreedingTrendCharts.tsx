// 월별 KPI 추이 차트 — 최근 6개월 수태율·발정탐지율 라인차트

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine,
} from 'recharts';
import { getBreedingTrends } from '@web/api/breeding.api';
import { useFarmStore } from '@web/stores/farm.store';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import type { MonthlyKpiTrend } from '@cowtalk/shared';

const NATIONAL = {
  conceptionRate: 55,
  estrusDetectionRate: 65,
} as const;

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'rgba(0,0,0,0.85)',
  border: 'none',
  borderRadius: 8,
  fontSize: 12,
  color: '#fff',
};

interface ChartCardProps {
  readonly title: string;
  readonly dataKey: keyof MonthlyKpiTrend;
  readonly data: readonly MonthlyKpiTrend[];
  readonly color: string;
  readonly unit: string;
  readonly nationalAvg?: number;
}

function ChartCard({ title, dataKey, data, color, unit, nationalAvg }: ChartCardProps): React.JSX.Element {
  const chartData = data.map((d) => ({
    month: d.month.slice(5), // "01", "02"...
    value: d[dataKey] as number,
    sampleSize: d.sampleSize,
  }));

  return (
    <div
      className="rounded-xl p-4 space-y-2"
      style={{ background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
    >
      <p className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>{title}</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: 'var(--ct-text-secondary)' }}
            tickFormatter={(v: string) => `${parseInt(v, 10)}월`}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--ct-text-secondary)' }}
            tickFormatter={(v: number) => `${v}${unit}`}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number) => [`${v}${unit}`, title]}
            labelFormatter={(l: string) => `${parseInt(l, 10)}월`}
          />
          {nationalAvg !== undefined && (
            <ReferenceLine
              y={nationalAvg}
              stroke="#9ca3af"
              strokeDasharray="5 5"
              label={{ value: `전국 ${nationalAvg}${unit}`, position: 'insideTopRight', fontSize: 10, fill: '#9ca3af' }}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            dot={{ r: 4, fill: color }}
            connectNulls
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function BreedingTrendCharts(): React.JSX.Element {
  const { selectedFarmId } = useFarmStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['breeding-trends', selectedFarmId],
    queryFn: () => getBreedingTrends(selectedFarmId ?? undefined, 6),
    staleTime: 10 * 60_000,
  });

  if (isLoading) return <LoadingSkeleton lines={4} />;

  if (isError || !data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>추이 데이터가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
        최근 6개월 월별 번식 지표 추이 (점선: 전국 평균)
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <ChartCard
          title="수태율"
          dataKey="conceptionRate"
          data={data}
          color="#16a34a"
          unit="%"
          nationalAvg={NATIONAL.conceptionRate}
        />
        <ChartCard
          title="발정탐지율"
          dataKey="estrusDetectionRate"
          data={data}
          color="#2563eb"
          unit="%"
          nationalAvg={NATIONAL.estrusDetectionRate}
        />
      </div>

      {/* 데이터 신뢰도 표시 */}
      <div className="flex flex-wrap gap-3">
        {data.map((d) => (
          <div key={d.month} className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: 'var(--ct-text-secondary)' }}>
              {parseInt(d.month.slice(5), 10)}월
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                background: d.sampleSize >= 10 ? 'rgba(22,163,74,0.1)' : 'rgba(217,119,6,0.1)',
                color: d.sampleSize >= 10 ? '#16a34a' : '#d97706',
              }}
            >
              {d.sampleSize}건
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
