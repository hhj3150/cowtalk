// 농장별 KPI 비교 차트 — 수평 바 차트로 상위 농장 비교

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Cell,
} from 'recharts';
import { getFarmComparisonData } from '@web/api/breeding.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import type { FarmKpiComparison } from '@cowtalk/shared';

interface MetricOption {
  readonly key: keyof Pick<FarmKpiComparison, 'conceptionRate' | 'estrusDetectionRate'>;
  readonly label: string;
  readonly unit: string;
  readonly national: number;
  readonly color: string;
}

const METRICS: readonly MetricOption[] = [
  { key: 'conceptionRate', label: '수태율', unit: '%', national: 55, color: '#16a34a' },
  { key: 'estrusDetectionRate', label: '발정탐지율', unit: '%', national: 65, color: '#2563eb' },
];

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'rgba(0,0,0,0.85)',
  border: 'none',
  borderRadius: 8,
  fontSize: 12,
  color: '#fff',
};

export default function FarmComparisonChart(): React.JSX.Element {
  const [metricIdx, setMetricIdx] = useState(0);
  const metric = METRICS[metricIdx] ?? METRICS[0]!;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['breeding-farm-comparison'],
    queryFn: () => getFarmComparisonData(15),
    staleTime: 10 * 60_000,
  });

  if (isLoading) return <LoadingSkeleton lines={5} />;

  if (isError || !data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>농장 비교 데이터가 없습니다</p>
      </div>
    );
  }

  const chartData = data.map((f) => ({
    name: f.farmName.length > 8 ? `${f.farmName.slice(0, 8)}..` : f.farmName,
    fullName: f.farmName,
    value: f[metric.key],
    count: f.animalCount,
  }));

  const barHeight = Math.max(300, chartData.length * 36);

  return (
    <div className="space-y-4">
      {/* 메트릭 선택 */}
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>지표:</span>
        {METRICS.map((m, idx) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetricIdx(idx)}
            className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
            style={{
              background: metricIdx === idx ? `${m.color}15` : 'transparent',
              color: metricIdx === idx ? m.color : 'var(--ct-text-secondary)',
              border: `1px solid ${metricIdx === idx ? m.color : 'var(--ct-border)'}`,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 차트 */}
      <div
        className="rounded-xl p-4"
        style={{ background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
      >
        <p className="text-xs mb-3" style={{ color: 'var(--ct-text-secondary)' }}>
          상위 {chartData.length}개 농장 {metric.label} 비교 (점선: 전국 평균 {metric.national}{metric.unit})
        </p>
        <ResponsiveContainer width="100%" height={barHeight}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: 'var(--ct-text-secondary)' }}
              tickFormatter={(v: number) => `${v}${metric.unit}`}
              domain={[0, 100]}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fontSize: 11, fill: 'var(--ct-text)' }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number) => [`${v}${metric.unit}`, metric.label]}
            />
            <ReferenceLine x={metric.national} stroke="#9ca3af" strokeDasharray="5 5" />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.value >= metric.national ? metric.color : '#d97706'}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ background: metric.color }} />
          <span className="text-[11px]" style={{ color: 'var(--ct-text-secondary)' }}>전국 평균 이상</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded" style={{ background: '#d97706' }} />
          <span className="text-[11px]" style={{ color: 'var(--ct-text-secondary)' }}>전국 평균 미만</span>
        </div>
      </div>
    </div>
  );
}
