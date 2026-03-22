// 통합 대시보드 — 위내센서 체온 시계열 차트
// smaXtec 위내센서 패턴: 평균체온 유지 → 음수 시 급격 하강(V자) → 회복
// 체온상승/하강 알람 시점을 붉은/파란 마커로 강조

import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts';

// ── 타입 ──

interface TimelinePoint {
  readonly time: string;
  readonly temp: number;
  readonly avg: number;
  readonly upperThreshold: number;
  readonly lowerThreshold: number;
  readonly event?: string;
  readonly eventDetail?: string;
}

interface AlarmPoint {
  readonly time: string;
  readonly earTag: string;
  readonly farmName: string;
  readonly temp: number;
  readonly type: 'high' | 'low';
  readonly severity: string;
}

interface TempTimelineData {
  readonly timeline: readonly TimelinePoint[];
  readonly alarms: readonly AlarmPoint[];
  readonly summary: {
    readonly meanTemp: number;
    readonly highAlarms: number;
    readonly lowAlarms: number;
    readonly totalAlarms: number;
    readonly drinkingEvents: number;
  };
}

interface Props {
  readonly data: TempTimelineData;
  readonly height?: number;
}

// ── 시간 포맷 ──

function formatHour(isoStr: string): string {
  const d = new Date(isoStr);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// ── 커스텀 툴팁 ──

function TimelineTooltip({
  active,
  payload,
}: {
  readonly active?: boolean;
  readonly payload?: readonly { readonly payload: TimelinePoint }[];
}): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  const pt = payload[0]?.payload;
  if (!pt) return null;

  const tempColor = pt.temp >= pt.upperThreshold
    ? '#ef4444'
    : pt.temp <= pt.lowerThreshold
      ? '#3b82f6'
      : '#22c55e';

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)',
      border: `1px solid ${tempColor}`,
      borderRadius: 8,
      padding: '8px 12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      maxWidth: 240,
    }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
        {formatHour(pt.time)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: tempColor }} />
        <span style={{ fontSize: 15, fontWeight: 800, color: tempColor }}>
          {pt.temp.toFixed(1)}°C
        </span>
      </div>
      {pt.event && (
        <div style={{
          marginTop: 4,
          fontSize: 11,
          fontWeight: 700,
          color: pt.event === '체온상승' ? '#ef4444' : '#3b82f6',
          padding: '2px 6px',
          borderRadius: 4,
          background: pt.event === '체온상승' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
          display: 'inline-block',
        }}>
          ⚠️ {pt.event}
        </div>
      )}
      {pt.eventDetail && (
        <div style={{ marginTop: 2, fontSize: 10, color: '#94a3b8' }}>
          {pt.eventDetail}
        </div>
      )}
      {!pt.event && pt.temp < pt.avg - 0.5 && (
        <div style={{ marginTop: 4, fontSize: 10, color: '#60a5fa' }}>
          💧 음수로 인한 체온 하강
        </div>
      )}
    </div>
  );
}

// ── 알람 포인트 커스텀 도트 ──

function AlarmDot(props: {
  readonly cx?: number;
  readonly cy?: number;
  readonly payload?: TimelinePoint;
}): React.JSX.Element | null {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload || !payload.event) return null;

  const isHigh = payload.event === '체온상승';
  const color = isHigh ? '#ef4444' : '#3b82f6';

  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={color} fillOpacity={0.3} />
      <circle cx={cx} cy={cy} r={3} fill={color} stroke="#fff" strokeWidth={1} />
    </g>
  );
}

// ── 메인 컴포넌트 ──

export function TemperatureScatter({ data, height = 280 }: Props): React.JSX.Element {
  // 안전 가드: 데이터가 없거나 잘못된 형식이면 빈 상태 표시
  if (!data || !data.timeline || data.timeline.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ct-text-muted)', fontSize: 12 }}>
        체온 시계열 데이터를 불러오는 중...
      </div>
    );
  }

  const { timeline, summary } = data;

  // Y축 범위 계산
  const temps = timeline.map((p) => p.temp);
  const minT = Math.min(...temps, 36.0);
  const maxT = Math.max(...temps, 40.0);
  const yDomain: [number, number] = [
    Math.floor(minT * 2) / 2,
    Math.ceil(maxT * 2) / 2,
  ];

  // X축에 표시할 시간 틱 (3시간 간격)
  const tickIndices: number[] = [];
  for (let i = 0; i < timeline.length; i += 18) { // 18 * 10분 = 3시간
    tickIndices.push(i);
  }

  return (
    <div>
      {/* 요약 헤더 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, paddingLeft: 4 }}>
        <SummaryBadge
          label="평균 위내온도"
          value={`${summary.meanTemp.toFixed(1)}°C`}
          color="#22c55e"
        />
        <SummaryBadge
          label="체온상승"
          value={`${summary.highAlarms}건`}
          color="#ef4444"
        />
        <SummaryBadge
          label="체온하강"
          value={`${summary.lowAlarms}건`}
          color="#3b82f6"
        />
        <SummaryBadge
          label="음수 감지"
          value={`${summary.drinkingEvents}회`}
          color="#8b5cf6"
        />
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={[...timeline]} margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" strokeOpacity={0.3} />

          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: 'var(--ct-text-secondary)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--ct-border)' }}
            tickFormatter={formatHour}
            ticks={tickIndices.map((i) => timeline[i]?.time).filter((t): t is string => t !== undefined)}
          />

          <YAxis
            domain={yDomain}
            tick={{ fontSize: 10, fill: 'var(--ct-text-secondary)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v.toFixed(1)}°`}
          />

          <Tooltip content={<TimelineTooltip />} />

          {/* 정상 체온 영역 (37.5~39.0°C) */}
          <ReferenceArea
            y1={37.5}
            y2={39.0}
            fill="#22c55e"
            fillOpacity={0.05}
            strokeOpacity={0}
          />

          {/* 기준선 */}
          <ReferenceLine
            y={summary.meanTemp}
            stroke="#22c55e"
            strokeDasharray="8 4"
            strokeWidth={1}
            label={{ value: `평균 ${summary.meanTemp}°C`, position: 'right', fontSize: 9, fill: '#22c55e' }}
          />
          <ReferenceLine
            y={39.0}
            stroke="#ef4444"
            strokeDasharray="4 3"
            strokeWidth={1}
            label={{ value: '상승 알람', position: 'right', fontSize: 9, fill: '#ef4444' }}
          />
          <ReferenceLine
            y={37.0}
            stroke="#3b82f6"
            strokeDasharray="4 3"
            strokeWidth={1}
            label={{ value: '하강 알람', position: 'right', fontSize: 9, fill: '#3b82f6' }}
          />

          {/* 체온 곡선 */}
          <Line
            type="monotone"
            dataKey="temp"
            stroke="#10b981"
            strokeWidth={1.5}
            dot={<AlarmDot />}
            activeDot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 1 }}
            animationDuration={2000}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* 범례 */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4 }}>
        <LegendItem color="#10b981" label="위내 체온" />
        <LegendItem color="#22c55e" dashed label="평균 38.3°C" />
        <LegendItem color="#ef4444" icon="●" label="체온상승 알람" />
        <LegendItem color="#3b82f6" icon="●" label="체온하강 알람" />
        <LegendItem color="#8b5cf6" icon="▽" label="음수 하강" />
      </div>
    </div>
  );
}

// ── 요약 뱃지 ──

function SummaryBadge({
  label,
  value,
  color,
}: {
  readonly label: string;
  readonly value: string;
  readonly color: string;
}): React.JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 6,
      background: `${color}10`,
      border: `1px solid ${color}30`,
    }}>
      <span style={{ fontSize: 10, color: 'var(--ct-text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

// ── 범례 아이템 ──

function LegendItem({
  color,
  label,
  dashed,
  icon,
}: {
  readonly color: string;
  readonly label: string;
  readonly dashed?: boolean;
  readonly icon?: string;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {icon ? (
        <span style={{ fontSize: 8, color }}>{icon}</span>
      ) : dashed ? (
        <span style={{ width: 12, height: 0, borderTop: `2px dashed ${color}`, display: 'inline-block' }} />
      ) : (
        <span style={{ width: 12, height: 2, background: color, borderRadius: 1, display: 'inline-block' }} />
      )}
      <span style={{ fontSize: 10, color: 'var(--ct-text-secondary)' }}>{label}</span>
    </div>
  );
}
