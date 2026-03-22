// 통합 대시보드 — 24시간 이벤트 타임라인 차트

import React from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ZAxis,
} from 'recharts';

// ── 타입 ──

interface TimelineEvent {
  readonly time: string;
  readonly category: string;
  readonly severity: string;
  readonly farmName: string;
  readonly details: string;
}

interface Props {
  readonly events: readonly TimelineEvent[];
  readonly height?: number;
}

// ── 상수 ──

const CATEGORY_INDEX: Record<string, number> = {
  발정: 5,
  건강: 4,
  체온: 3,
  반추: 2,
  활동: 1,
  estrus: 5,
  health: 4,
  temperature: 3,
  rumination: 2,
  activity: 1,
};

const CATEGORY_LABELS: Record<number, string> = {
  5: '발정',
  4: '건강',
  3: '체온',
  2: '반추',
  1: '활동',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#3b82f6',
  info: '#64748b',
};

const SEVERITY_SIZES: Record<string, number> = {
  critical: 120,
  high: 90,
  medium: 60,
  low: 40,
  info: 30,
};

// ── 데이터 변환 ──

interface ChartPoint {
  readonly hour: number;
  readonly categoryIdx: number;
  readonly color: string;
  readonly size: number;
  readonly event: TimelineEvent;
}

function buildChartData(events: readonly TimelineEvent[]): ChartPoint[] {
  return events.map((evt) => {
    const d = new Date(evt.time);
    const hour = d.getHours() + d.getMinutes() / 60;
    const categoryIdx = CATEGORY_INDEX[evt.category] ?? 3;
    const color = SEVERITY_COLORS[evt.severity] ?? '#64748b';
    const size = SEVERITY_SIZES[evt.severity] ?? 40;

    return { hour, categoryIdx, color, size, event: evt };
  });
}

// ── 커스텀 툴팁 ──

function CustomTooltip({
  active,
  payload,
}: {
  readonly active?: boolean;
  readonly payload?: readonly { payload: ChartPoint }[];
}): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  const evt = point.event;
  const time = new Date(evt.time);
  const timeStr = time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.95)',
        border: `1px solid ${point.color}`,
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        maxWidth: 220,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>{timeStr}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: point.color,
            padding: '1px 6px',
            borderRadius: 3,
            background: `${point.color}20`,
          }}
        >
          {evt.severity}
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
        {evt.farmName} · {CATEGORY_LABELS[point.categoryIdx] ?? evt.category}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ct-text)', lineHeight: 1.4 }}>
        {evt.details}
      </div>
    </div>
  );
}

// ── 커스텀 도트 ──

function CustomDot(props: {
  readonly cx?: number;
  readonly cy?: number;
  readonly payload?: ChartPoint;
}): React.JSX.Element | null {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload) return null;

  const r = payload.event.severity === 'critical' ? 7
    : payload.event.severity === 'high' ? 6
    : payload.event.severity === 'medium' ? 5 : 4;

  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={payload.color}
      fillOpacity={0.85}
      stroke={payload.color}
      strokeWidth={1.5}
      strokeOpacity={0.4}
      style={{
        filter: payload.event.severity === 'critical'
          ? `drop-shadow(0 0 6px ${payload.color})`
          : undefined,
      }}
    />
  );
}

// ── 메인 컴포넌트 ──

export function EventTimelineChart({ events, height = 260 }: Props): React.JSX.Element {
  const chartData = buildChartData(events);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" strokeOpacity={0.3} />
          <XAxis
            type="number"
            dataKey="hour"
            domain={[0, 24]}
            ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]}
            tickFormatter={(v: number) => `${String(v).padStart(2, '0')}:00`}
            tick={{ fontSize: 10, fill: 'var(--ct-text-secondary)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--ct-border)' }}
          />
          <YAxis
            type="number"
            dataKey="categoryIdx"
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
            tickFormatter={(v: number) => CATEGORY_LABELS[v] ?? ''}
            tick={{ fontSize: 11, fill: 'var(--ct-text-secondary)' }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <ZAxis dataKey="size" range={[30, 120]} />
          <Tooltip content={<CustomTooltip />} cursor={false} />
          <Scatter
            data={chartData as unknown as Record<string, unknown>[]}
            shape={<CustomDot />}
            animationDuration={1500}
            animationEasing="ease-in-out"
          />
        </ScatterChart>
      </ResponsiveContainer>

      {/* 심각도 범례 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 4 }}>
        {(['critical', 'high', 'medium', 'low'] as const).map((sev) => {
          const color = SEVERITY_COLORS[sev] ?? '#64748b';
          const labels: Record<string, string> = { critical: '심각', high: '높음', medium: '보통', low: '낮음' };
          const count = events.filter((e) => e.severity === sev).length;
          return (
            <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: 11, color: 'var(--ct-text-secondary)' }}>
                {labels[sev]} {count}건
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
