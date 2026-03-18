// 통합 대시보드 — 두수 발전 추이 (착유/건유/비육)

import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { HerdDevelopmentPoint } from '@cowtalk/shared';

interface Props {
  readonly data: readonly HerdDevelopmentPoint[];
  readonly height?: number;
}

const LINE_CONFIG = [
  { dataKey: 'milking', label: '착유중', color: '#22c55e' },
  { dataKey: 'dry', label: '건유우', color: '#eab308' },
  { dataKey: 'beef', label: '비육용', color: '#9ca3af' },
] as const;

function formatMonth(val: string): string {
  const parts = val.split('-');
  if (parts.length < 2) return val;
  return `${parts[1]}월`;
}

export function HerdDevelopmentChart({ data, height = 250 }: Props): React.JSX.Element {
  return (
    <div className="ct-card p-4" style={{ borderRadius: '12px' }}>
      <h3
        className="mb-3 font-semibold"
        style={{ fontSize: '13px', color: 'var(--ct-text)' }}
      >
        두수 발전 추이
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data as unknown as Record<string, unknown>[]}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: 'var(--ct-text-secondary)' }}
            tickFormatter={formatMonth}
            stroke="var(--ct-border)"
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--ct-text-secondary)' }}
            stroke="var(--ct-border)"
          />
          <Tooltip
            contentStyle={{
              background: 'var(--ct-card)',
              border: '1px solid var(--ct-border)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(val: string) => `${val}`}
            formatter={(value: number, name: string) => {
              const cfg = LINE_CONFIG.find((c) => c.dataKey === name);
              return [value.toLocaleString('ko-KR'), cfg?.label ?? name];
            }}
          />
          <Legend
            align="right"
            verticalAlign="top"
            wrapperStyle={{ fontSize: '11px' }}
            formatter={(value: string) => {
              const cfg = LINE_CONFIG.find((c) => c.dataKey === value);
              return cfg?.label ?? value;
            }}
          />
          {LINE_CONFIG.map((cfg) => (
            <Line
              key={cfg.dataKey}
              type="monotone"
              dataKey={cfg.dataKey}
              name={cfg.dataKey}
              stroke={cfg.color}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
