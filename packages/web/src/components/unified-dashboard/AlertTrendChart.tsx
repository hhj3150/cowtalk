// 통합 대시보드 — 알림 트렌드 차트 (14일 스택 바 + 이동평균 라인)

import React from 'react';
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Brush,
} from 'recharts';

// ── 타입 ──

interface AlertTrendEntry {
  readonly date: string;
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  readonly movingAvg: number;
}

interface Props {
  readonly data: readonly AlertTrendEntry[];
  readonly height?: number;
}

// ── 상수 ──

const SEVERITY_CONFIG = [
  { dataKey: 'critical', label: '심각', color: '#dc2626' },
  { dataKey: 'high', label: '높음', color: '#f97316' },
  { dataKey: 'medium', label: '보통', color: '#f59e0b' },
  { dataKey: 'low', label: '낮음', color: '#3b82f6' },
] as const;

const GRADIENT_ID = 'alert-trend-avg-gradient';

// ── 커스텀 툴팁 ──

function CustomTooltip({
  active,
  payload,
  label,
}: {
  readonly active?: boolean;
  readonly payload?: readonly { dataKey: string; value: number; color: string }[];
  readonly label?: string;
}): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  const barEntries = payload.filter((p) =>
    SEVERITY_CONFIG.some((c) => c.dataKey === p.dataKey),
  );
  const avgEntry = payload.find((p) => p.dataKey === 'movingAvg');
  const totalAlerts = barEntries.reduce((sum, e) => sum + e.value, 0);

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid var(--ct-border)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{label}</div>
      {barEntries.map((entry) => {
        const cfg = SEVERITY_CONFIG.find((c) => c.dataKey === entry.dataKey);
        return (
          <div key={entry.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: cfg?.color ?? entry.color }} />
            <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 28 }}>{cfg?.label ?? entry.dataKey}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>{entry.value}건</span>
          </div>
        );
      })}
      <div style={{ borderTop: '1px solid #334155', marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>합계</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>{totalAlerts}건</span>
      </div>
      {avgEntry && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>7일 평균</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>{avgEntry.value.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}

// ── 날짜 포맷 ──

function formatDate(val: string): string {
  const d = new Date(val);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── 메인 컴포넌트 ──

export function AlertTrendChart({ data, height = 280 }: Props): React.JSX.Element {
  const showBrush = data.length > 14;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data as unknown as Record<string, unknown>[]}>
          <defs>
            <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" strokeOpacity={0.4} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'var(--ct-text-secondary)' }}
            tickFormatter={formatDate}
            stroke="var(--ct-border)"
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--ct-text-secondary)' }}
            stroke="var(--ct-border)"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            wrapperStyle={{ fontSize: '11px' }}
            formatter={(value: string) => {
              if (value === 'movingAvg') return '7일 평균';
              const cfg = SEVERITY_CONFIG.find((c) => c.dataKey === value);
              return cfg?.label ?? value;
            }}
          />

          {SEVERITY_CONFIG.map((cfg) => (
            <Bar
              key={cfg.dataKey}
              dataKey={cfg.dataKey}
              stackId="alerts"
              fill={cfg.color}
              radius={0}
              animationDuration={1500}
              animationEasing="ease-in-out"
            />
          ))}

          <Area
            type="monotone"
            dataKey="movingAvg"
            fill={`url(#${GRADIENT_ID})`}
            stroke="transparent"
            animationDuration={1500}
            animationEasing="ease-in-out"
          />
          <Line
            type="monotone"
            dataKey="movingAvg"
            stroke="#22c55e"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, stroke: '#22c55e', strokeWidth: 2, fill: '#0f172a' }}
            animationDuration={1500}
            animationEasing="ease-in-out"
          />

          {showBrush && (
            <Brush
              dataKey="date"
              height={20}
              stroke="#64748b"
              fill="var(--ct-bg)"
              tickFormatter={formatDate}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
