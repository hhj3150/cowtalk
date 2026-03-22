// 통합 대시보드 — 축군 구성 도넛 차트

import React, { useCallback } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';

// ── 타입 ──

interface HerdEntry {
  readonly name: string;
  readonly value: number;
}

interface Props {
  readonly data: readonly HerdEntry[];
  readonly height?: number;
}

// ── 상수 ──

const CATEGORY_COLORS: Record<string, string> = {
  착유: '#16a34a',
  건유: '#3b82f6',
  육성: '#f59e0b',
  질병: '#dc2626',
  번식: '#ec4899',
};

const FALLBACK_COLORS = ['#16a34a', '#3b82f6', '#f59e0b', '#dc2626', '#ec4899'] as const;

const TOOLTIP_STYLE = {
  background: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid var(--ct-border)',
  borderRadius: 8,
  padding: '8px 12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
} as const;

// ── 커스텀 툴팁 ──

function CustomTooltip({
  active,
  payload,
  total,
}: {
  readonly active?: boolean;
  readonly payload?: readonly { name: string; value: number; payload: { fill: string } }[];
  readonly total: number;
}): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload[0];
  if (!entry) return null;

  const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0';

  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.payload.fill }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>{entry.name}</span>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
        {entry.value}두 ({pct}%)
      </div>
    </div>
  );
}

// ── 중심 라벨 ──

function CenterLabel({ total, cx, cy }: { readonly total: number; readonly cx: number; readonly cy: number }): React.JSX.Element {
  return (
    <g>
      <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 22, fontWeight: 800, fill: 'var(--ct-text)' }}>
        {total}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--ct-text-secondary)' }}>
        총 두수
      </text>
    </g>
  );
}

// ── 메인 컴포넌트 ──

export function HerdCompositionChart({ data, height = 260 }: Props): React.JSX.Element {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  const getColor = useCallback((index: number, name: string): string => {
    return CATEGORY_COLORS[name] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] ?? '#16a34a';
  }, []);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data as unknown as Record<string, unknown>[]}
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            dataKey="value"
            nameKey="name"
            paddingAngle={3}
            animationBegin={200}
            animationDuration={1500}
            animationEasing="ease-in-out"
            stroke="none"
          >
            {data.map((entry, idx) => (
              <Cell key={entry.name} fill={getColor(idx, entry.name)} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip total={total} />} />
          {/* 중심 라벨 — recharts customized label */}
          <Pie
            data={[{ name: '', value: 1 }]}
            cx="50%"
            cy="50%"
            innerRadius={0}
            outerRadius={0}
            dataKey="value"
            isAnimationActive={false}
            label={({ cx, cy }) => <CenterLabel total={total} cx={cx} cy={cy} />}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* 범례 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 4 }}>
        {data.map((entry, idx) => (
          <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: getColor(idx, entry.name) }} />
            <span style={{ fontSize: 11, color: 'var(--ct-text-secondary)' }}>
              {entry.name} {entry.value}두
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
