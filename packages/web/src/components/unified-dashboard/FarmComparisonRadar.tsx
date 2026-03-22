// 통합 대시보드 — 농장 비교 레이더 차트

import React from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from 'recharts';

// ── 타입 ──

interface FarmMetrics {
  readonly farmName: string;
  readonly metrics: Readonly<Record<string, number>>;
}

interface Props {
  readonly farms: readonly FarmMetrics[];
  readonly height?: number;
}

// ── 상수 ──

const AXES = ['건강점수', '번식성적', '반추활동', '체온안정', '사료효율', '센서가동률'] as const;

const FARM_COLORS = ['#16a34a', '#3b82f6', '#f97316'] as const;

const TOOLTIP_STYLE = {
  background: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid var(--ct-border)',
  borderRadius: 8,
  padding: '8px 12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  fontSize: '12px',
} as const;

// ── 데이터 변환 ──

function buildChartData(farms: readonly FarmMetrics[]): Record<string, unknown>[] {
  return AXES.map((axis) => {
    const row: Record<string, unknown> = { axis };
    for (const farm of farms) {
      row[farm.farmName] = farm.metrics[axis] ?? 0;
    }
    return row;
  });
}

// ── 메인 컴포넌트 ──

export function FarmComparisonRadar({ farms, height = 320 }: Props): React.JSX.Element {
  const chartData = buildChartData(farms);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid stroke="var(--ct-border)" strokeOpacity={0.5} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 11, fill: 'var(--ct-text-secondary)' }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fontSize: 9, fill: 'var(--ct-text-secondary)' }}
            tickCount={5}
            axisLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: number, name: string) => [`${value}점`, name]}
            labelStyle={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}
          />
          <Legend
            verticalAlign="bottom"
            wrapperStyle={{ fontSize: '11px', color: 'var(--ct-text-secondary)' }}
          />
          {farms.map((farm, idx) => {
            const color = FARM_COLORS[idx % FARM_COLORS.length] ?? '#16a34a';
            return (
              <Radar
                key={farm.farmName}
                name={farm.farmName}
                dataKey={farm.farmName}
                stroke={color}
                fill={color}
                fillOpacity={0.15}
                strokeWidth={2}
                animationBegin={idx * 300}
                animationDuration={1500}
                animationEasing="ease-in-out"
                dot={{ r: 3, fill: color, stroke: color }}
              />
            );
          })}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
