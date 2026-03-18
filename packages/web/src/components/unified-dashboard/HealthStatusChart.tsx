// 통합 대시보드 — 건강 상태 스택 바 차트 (14일)

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { HealthStatusBar } from '@cowtalk/shared';

interface Props {
  readonly data: readonly HealthStatusBar[];
  readonly height?: number;
}

const BAR_CONFIG = [
  { dataKey: 'temperatureWarning', label: '체온', color: '#ef4444' },
  { dataKey: 'healthWarning', label: '건강', color: '#f97316' },
  { dataKey: 'ruminationWarning', label: '반추', color: '#eab308' },
  { dataKey: 'activityWarning', label: '활동', color: '#3b82f6' },
  { dataKey: 'drinkingWarning', label: '음수', color: '#06b6d4' },
] as const;

function formatDate(val: string): string {
  const d = new Date(val);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function HealthStatusChart({ data, height = 220 }: Props): React.JSX.Element {
  return (
    <div className="ct-card p-4" style={{ borderRadius: '12px' }}>
      <h3
        className="mb-3 font-semibold"
        style={{ fontSize: '13px', color: 'var(--ct-text)' }}
      >
        건강 상태 현황
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data as unknown as Record<string, unknown>[]}>
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
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--ct-card)',
              border: '1px solid var(--ct-border)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(val: string) => val}
            formatter={(value: number, name: string) => {
              const cfg = BAR_CONFIG.find((c) => c.dataKey === name);
              return [`${value}건`, cfg?.label ?? name];
            }}
          />
          <Legend
            verticalAlign="top"
            wrapperStyle={{ fontSize: '11px' }}
            formatter={(value: string) => {
              const cfg = BAR_CONFIG.find((c) => c.dataKey === value);
              return cfg?.label ?? value;
            }}
          />
          {BAR_CONFIG.map((cfg) => (
            <Bar
              key={cfg.dataKey}
              dataKey={cfg.dataKey}
              name={cfg.dataKey}
              stackId="health"
              fill={cfg.color}
              radius={0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
