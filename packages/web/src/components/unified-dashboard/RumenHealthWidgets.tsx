// 통합 대시보드 — 반추위 건강 위젯 2종 (pH 진폭 + 건강 개요)

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Legend,
} from 'recharts';
import type { PhAmplitudeBar, RumenHealthPoint } from '@cowtalk/shared';

interface Props {
  readonly phData: readonly PhAmplitudeBar[];
  readonly healthData: readonly RumenHealthPoint[];
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

function PhAmplitudeChart({
  data,
  height,
}: {
  readonly data: readonly PhAmplitudeBar[];
  readonly height: number;
}): React.JSX.Element {
  const firstItem = data[0];
  const referenceValue = firstItem !== undefined ? firstItem.reference : 0;

  return (
    <div>
      <h4
        className="mb-2 font-medium"
        style={{ fontSize: '12px', color: 'var(--ct-text-secondary)' }}
      >
        pH 진폭
      </h4>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data as unknown as Record<string, unknown>[]}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: 'var(--ct-text-secondary)' }}
            stroke="var(--ct-border)"
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--ct-text-secondary)' }}
            stroke="var(--ct-border)"
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number) => [`${value.toFixed(2)}`, '진폭']}
          />
          {referenceValue > 0 && (
            <ReferenceLine
              y={referenceValue}
              stroke="var(--ct-warning)"
              strokeDasharray="5 5"
              label={{
                value: '기준선',
                position: 'right',
                fontSize: 10,
                fill: 'var(--ct-text-secondary)',
              }}
            />
          )}
          <Bar
            dataKey="amplitude"
            fill="var(--ct-primary)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RumenHealthOverviewChart({
  data,
  height,
}: {
  readonly data: readonly RumenHealthPoint[];
  readonly height: number;
}): React.JSX.Element {
  const firstHealthItem = data[0];
  const thresholdValue = firstHealthItem !== undefined ? firstHealthItem.threshold : 0;

  return (
    <div>
      <h4
        className="mb-2 font-medium"
        style={{ fontSize: '12px', color: 'var(--ct-text-secondary)' }}
      >
        반추 건강 개요
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
            tick={{ fontSize: 10, fill: 'var(--ct-text-secondary)' }}
            stroke="var(--ct-border)"
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(val: string) => val}
            formatter={(value: number, name: string) => {
              const label = name === 'avgPh' ? '평균 pH' : name;
              return [value.toFixed(2), label];
            }}
          />
          <Legend
            verticalAlign="top"
            wrapperStyle={{ fontSize: '11px' }}
            formatter={(value: string) => (value === 'avgPh' ? '평균 pH' : value)}
          />
          {thresholdValue > 0 && (
            <ReferenceLine
              y={thresholdValue}
              stroke="var(--ct-danger)"
              strokeDasharray="5 5"
              label={{
                value: '임계값',
                position: 'right',
                fontSize: 10,
                fill: 'var(--ct-text-secondary)',
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="avgPh"
            name="avgPh"
            stroke="var(--ct-primary)"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RumenHealthWidgets({
  phData,
  healthData,
  chartHeight = 150,
}: Props): React.JSX.Element {
  return (
    <div className="ct-card flex flex-col gap-4 p-4" style={{ borderRadius: '12px' }}>
      <h3
        className="font-semibold"
        style={{ fontSize: '13px', color: 'var(--ct-text)' }}
      >
        반추위 건강
      </h3>
      <PhAmplitudeChart data={phData} height={chartHeight} />
      <RumenHealthOverviewChart data={healthData} height={chartHeight} />
    </div>
  );
}
