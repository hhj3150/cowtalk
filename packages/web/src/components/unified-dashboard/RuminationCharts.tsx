// 통합 대시보드 — 반추 차트 2종 (일일 편차 + 주간 시간)

import React from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type { RuminationDataPoint } from '@cowtalk/shared';

interface Props {
  readonly dailyData: readonly RuminationDataPoint[];
  readonly weeklyData: readonly RuminationDataPoint[];
  readonly chartHeight?: number;
}

function formatDate(val: string): string {
  const d = new Date(val);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const TOOLTIP_STYLE = {
  background: 'var(--ct-card)',
  border: '1px solid var(--ct-border)',
  borderRadius: '8px',
  fontSize: '12px',
} as const;

function DailyDeviationChart({
  data,
  height,
}: {
  readonly data: readonly RuminationDataPoint[];
  readonly height: number;
}): React.JSX.Element {
  return (
    <div>
      <h4
        className="mb-2 font-medium"
        style={{ fontSize: '12px', color: 'var(--ct-text-secondary)' }}
      >
        일일 반추 편차
      </h4>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data as unknown as Record<string, unknown>[]}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: 'var(--ct-text-secondary)' }}
            tickFormatter={formatDate}
            stroke="var(--ct-border)"
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'var(--ct-text-secondary)' }}
            stroke="var(--ct-border)"
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(val: string) => val}
            formatter={(value: number) => [`${value}분`, '편차']}
          />
          <ReferenceLine y={0} stroke="var(--ct-text-secondary)" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function WeeklyRuminationChart({
  data,
  height,
}: {
  readonly data: readonly RuminationDataPoint[];
  readonly height: number;
}): React.JSX.Element {
  const firstItem = data[0];
  const referenceValue = firstItem !== undefined ? (firstItem.baseline ?? 0) : 0;

  return (
    <div>
      <h4
        className="mb-2 font-medium"
        style={{ fontSize: '12px', color: 'var(--ct-text-secondary)' }}
      >
        주간 반추 시간
      </h4>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data as unknown as Record<string, unknown>[]}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: 'var(--ct-text-secondary)' }}
            tickFormatter={formatDate}
            stroke="var(--ct-border)"
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'var(--ct-text-secondary)' }}
            stroke="var(--ct-border)"
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(val: string) => val}
            formatter={(value: number) => [`${value}분`, '반추 시간']}
          />
          {referenceValue > 0 && (
            <ReferenceLine
              y={referenceValue}
              stroke="var(--ct-warning)"
              strokeDasharray="5 5"
              label={{
                value: 'Standard Ration',
                position: 'right',
                fontSize: 10,
                fill: 'var(--ct-text-secondary)',
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.15}
            strokeWidth={2}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RuminationCharts({
  dailyData,
  weeklyData,
  chartHeight = 150,
}: Props): React.JSX.Element {
  return (
    <div className="ct-card flex flex-col gap-4 p-4" style={{ borderRadius: '12px' }}>
      <h3
        className="font-semibold"
        style={{ fontSize: '13px', color: 'var(--ct-text)' }}
      >
        반추 분석
      </h3>
      <DailyDeviationChart data={dailyData} height={chartHeight} />
      <WeeklyRuminationChart data={weeklyData} height={chartHeight} />
    </div>
  );
}
