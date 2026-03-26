// 통합 대시보드 — smaXtec 센서 차트 모달
// recharts 기반 동적 차트 — 동기화 크로스헤어 + 개별 패널

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  Brush,
} from 'recharts';
// apiGet은 deprecated 컴포넌트에서 사용
export { apiGet } from '@web/api/client';
import { SensorChartInline } from '@web/components/sensor/SensorChartInline';

// ── 타입 ──

interface SensorPoint {
  readonly ts: number;
  readonly value: number;
}

interface EventMarker {
  readonly eventId: string;
  readonly eventType: string;
  readonly smaxtecType: string;
  readonly label: string;
  readonly detectedAt: string;
  readonly severity: string;
}

export interface SensorChartResponse {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmName: string;
  readonly period: { readonly from: string; readonly to: string; readonly days: number };
  readonly metrics: Record<string, readonly SensorPoint[]>;
  readonly eventMarkers: readonly EventMarker[];
}

interface Props {
  readonly animalId: string;
  readonly onClose: () => void;
  readonly onAskAi?: (animalId: string, context: string) => void;
}

// ── 상수 ──

const METRIC_CONFIG: Record<string, {
  readonly label: string;
  readonly color: string;
  readonly unit: string;
  readonly yMin: number;
  readonly yMax: number;
  readonly normalMin: number;
  readonly normalMax: number;
  readonly gradientId: string;
}> = {
  temp: { label: '체온', color: '#3b82f6', unit: '°C', yMin: 37, yMax: 42, normalMin: 38.0, normalMax: 39.3, gradientId: 'grad-temp' },
  act: { label: '활동', color: '#22c55e', unit: 'I/24h', yMin: 0, yMax: 600, normalMin: 0, normalMax: 300, gradientId: 'grad-act' },
  rum: { label: '반추', color: '#f97316', unit: '분', yMin: 0, yMax: 700, normalMin: 300, normalMax: 600, gradientId: 'grad-rum' },
  dr: { label: '음수', color: '#ec4899', unit: 'I/24h', yMin: 0, yMax: 200, normalMin: 40, normalMax: 120, gradientId: 'grad-dr' },
};

const SEVERITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#eab308',
};

const EVENT_LABELS: Record<string, string> = {
  heat: '발정',
  insemination: '수정',
  calving_detection: '분만감지',
  calving_confirmation: '분만확인',
  health_104: '음수감소',
  health_103: '반추감소',
  health_101: '체온이상',
  health_308: '체온이상',
  temperature_warning: '체온경고',
  health_warning: '건강경고',
};

// ── 커스텀 툴팁 ──

function CustomTooltip({
  active,
  payload,
  label,
  metricKey,
}: {
  readonly active?: boolean;
  readonly payload?: readonly { value: number; color: string }[];
  readonly label?: number;
  readonly metricKey: string;
}): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0 || !label) return null;

  const cfg = METRIC_CONFIG[metricKey];
  if (!cfg) return null;

  const first = payload[0];
  if (!first) return null;
  const value = first.value;
  const date = new Date(label);
  const isAbnormal = value < cfg.normalMin || value > cfg.normalMax;

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.95)',
        border: `1px solid ${isAbnormal ? '#ef4444' : cfg.color}`,
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
        {date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}{' '}
        {date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isAbnormal ? '#ef4444' : cfg.color,
            boxShadow: isAbnormal ? '0 0 6px #ef4444' : 'none',
          }}
        />
        <span style={{ fontSize: 14, fontWeight: 700, color: isAbnormal ? '#ef4444' : '#f8fafc' }}>
          {typeof value === 'number' ? value.toFixed(1) : value}
        </span>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{cfg.unit}</span>
      </div>
      {isAbnormal && (
        <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4, fontWeight: 600 }}>
          정상범위 벗어남 ({cfg.normalMin}~{cfg.normalMax} {cfg.unit})
        </div>
      )}
    </div>
  );
}

// ── 이벤트 마커 (세로선 + 라벨) ──

function EventMarkerLines({
  markers,
}: {
  readonly markers: readonly EventMarker[];
}): React.JSX.Element {
  return (
    <>
      {markers.map((m) => {
        const ts = new Date(m.detectedAt).getTime();
        const color = SEVERITY_COLORS[m.severity] ?? '#eab308';
        const label = EVENT_LABELS[m.smaxtecType] ?? EVENT_LABELS[m.eventType] ?? m.label;
        return (
          <ReferenceLine
            key={m.eventId}
            x={ts}
            stroke={color}
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{
              value: label,
              position: 'top',
              fill: color,
              fontSize: 10,
              fontWeight: 600,
            }}
          />
        );
      })}
    </>
  );
}

// ── 통합 차트: 체온 + 활동 + 반추를 하나의 차트에 ──

interface CombinedChartProps {
  readonly metrics: Record<string, readonly SensorPoint[]>;
  readonly eventMarkers: readonly EventMarker[];
  readonly timeRange: { from: number; to: number };
}

function CombinedTooltip({
  active,
  payload,
  label,
}: {
  readonly active?: boolean;
  readonly payload?: readonly { dataKey: string; value: number; color: string }[];
  readonly label?: number;
}): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0 || !label) return null;

  const date = new Date(label);

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid var(--ct-border)',
        borderRadius: 8,
        padding: '8px 12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
        {date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}{' '}
        {date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
      </div>
      {payload.map((entry) => {
        const key = entry.dataKey as string;
        const cfg = METRIC_CONFIG[key];
        if (!cfg) return null;
        const isAbnormal = entry.value < cfg.normalMin || entry.value > cfg.normalMax;
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color }} />
            <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 30 }}>{cfg.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: isAbnormal ? '#ef4444' : '#f8fafc' }}>
              {entry.value.toFixed(1)}
            </span>
            <span style={{ fontSize: 10, color: '#64748b' }}>{cfg.unit}</span>
            {isAbnormal && <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 600 }}>이상</span>}
          </div>
        );
      })}
    </div>
  );
}

// @deprecated SyncedPanels로 대체됨
export function CombinedChart({ metrics, eventMarkers, timeRange }: CombinedChartProps): React.JSX.Element {
  const metricsToShow = ['temp', 'act', 'rum'] as const;
  const available = metricsToShow.filter((k) => metrics[k] && metrics[k].length > 0);

  if (available.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--ct-text-secondary)', fontSize: 13 }}>
        센서 데이터 없음
      </div>
    );
  }

  // 모든 타임스탬프를 병합하여 통합 데이터셋 생성
  const tsMap = new Map<number, Record<string, number>>();
  for (const key of available) {
    const pts = metrics[key] ?? [];
    for (const p of pts) {
      const ts = p.ts * 1000;
      const existing = tsMap.get(ts) ?? {};
      tsMap.set(ts, { ...existing, [key]: p.value });
    }
  }

  const chartData = Array.from(tsMap.entries())
    .map(([ts, values]) => ({ ts, ...values }))
    .sort((a, b) => a.ts - b.ts);

  // 각 메트릭의 현재값/통계
  const stats = available.map((key) => {
    const points = metrics[key] ?? [];
    const values = points.map((p) => p.value);
    const cfg = METRIC_CONFIG[key];
    const latest = values[values.length - 1] ?? 0;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { key, cfg, latest, min, max, isAbnormal: cfg ? (latest < cfg.normalMin || latest > cfg.normalMax) : false };
  });

  // Y축 도메인 계산 — 각 메트릭별 독립 축
  const calcDomain = (key: string): [number, number] => {
    const cfg = METRIC_CONFIG[key];
    const points = metrics[key];
    if (!cfg || !points || points.length === 0) return [0, 100];
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const pad = Math.max(range * 0.2, cfg.unit === '°C' ? 0.5 : 1);
    return [
      Math.floor((min - pad) * 10) / 10,
      Math.ceil((max + pad) * 10) / 10,
    ];
  };

  const relevantMarkers = eventMarkers.filter((m) => {
    const t = new Date(m.detectedAt).getTime();
    return t >= timeRange.from && t <= timeRange.to;
  });

  return (
    <div
      style={{
        background: 'var(--ct-bg)',
        border: '1px solid var(--ct-border)',
        borderRadius: 10,
        padding: '12px 8px 4px 8px',
      }}
    >
      {/* 헤더: 현재값 카드 */}
      <div style={{ display: 'flex', gap: 12, padding: '0 8px 10px', flexWrap: 'wrap' }}>
        {stats.map(({ key, cfg, latest, min, max, isAbnormal }) => cfg && (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 140, padding: '6px 10px', borderRadius: 8, background: 'var(--ct-card)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color }} />
            <div>
              <div style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
                {cfg.label} ({min.toFixed(1)}~{max.toFixed(1)})
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: isAbnormal ? '#ef4444' : cfg.color }}>
                {latest.toFixed(1)}
                <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 2 }}>{cfg.unit}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 5, right: 60, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" strokeOpacity={0.4} vertical={false} />

          <XAxis
            dataKey="ts"
            type="number"
            domain={[timeRange.from, timeRange.to]}
            scale="time"
            tickFormatter={(ts: number) => {
              const d = new Date(ts);
              return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}시`;
            }}
            tick={{ fontSize: 10, fill: 'var(--ct-text-muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--ct-border)' }}
            tickCount={8}
          />

          {/* 체온 Y축 (좌측) */}
          {available.includes('temp') && (
            <YAxis
              yAxisId="temp"
              orientation="left"
              domain={calcDomain('temp')}
              tick={{ fontSize: 10, fill: '#3b82f6' }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickCount={6}
              tickFormatter={(v: number) => `${v.toFixed(1)}`}
            />
          )}

          {/* 활동 Y축 (우측 1) */}
          {available.includes('act') && (
            <YAxis
              yAxisId="act"
              orientation="right"
              domain={calcDomain('act')}
              tick={{ fontSize: 10, fill: '#22c55e' }}
              tickLine={false}
              axisLine={false}
              width={35}
              tickCount={6}
            />
          )}

          {/* 반추 Y축 (우측 2) — 활동 축 옆에 */}
          {available.includes('rum') && (
            <YAxis
              yAxisId="rum"
              orientation="right"
              domain={calcDomain('rum')}
              tick={{ fontSize: 10, fill: '#f97316' }}
              tickLine={false}
              axisLine={false}
              width={35}
              tickCount={6}
            />
          )}

          <Tooltip content={<CombinedTooltip />} cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 4' }} isAnimationActive={false} />

          {/* 정상범위 배경 (smaXtec 스타일 녹색 배경) */}
          {available.includes('temp') && (
            <ReferenceArea
              yAxisId="temp"
              y1={METRIC_CONFIG.temp?.normalMin ?? 38.0}
              y2={METRIC_CONFIG.temp?.normalMax ?? 39.3}
              fill="#22c55e"
              fillOpacity={0.08}
              stroke="none"
            />
          )}

          {/* 현재 시점 마커 (주황 세로선) */}
          <ReferenceLine
            x={Date.now()}
            stroke="#f97316"
            strokeWidth={2}
            strokeDasharray="none"
            label={{
              value: '현재',
              position: 'top',
              fill: '#f97316',
              fontSize: 10,
              fontWeight: 700,
            }}
          />

          {/* 이벤트 마커 */}
          <EventMarkerLines markers={relevantMarkers} />

          {/* 체온 라인 */}
          {available.includes('temp') && (
            <Line yAxisId="temp" type="monotone" dataKey="temp" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#3b82f6', strokeWidth: 2, fill: '#0f172a' }} animationDuration={600} />
          )}

          {/* 활동 라인 */}
          {available.includes('act') && (
            <Line yAxisId="act" type="monotone" dataKey="act" stroke="#22c55e" strokeWidth={1.5} dot={false} activeDot={{ r: 4, stroke: '#22c55e', strokeWidth: 2, fill: '#0f172a' }} animationDuration={600} strokeDasharray="none" />
          )}

          {/* 반추 라인 */}
          {available.includes('rum') && (
            <Line yAxisId="rum" type="monotone" dataKey="rum" stroke="#f97316" strokeWidth={1.5} dot={false} activeDot={{ r: 4, stroke: '#f97316', strokeWidth: 2, fill: '#0f172a' }} animationDuration={600} />
          )}

          {chartData.length > 50 && (
            <Brush dataKey="ts" height={20} stroke="#64748b" fill="var(--ct-bg)" tickFormatter={(ts: number) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; }} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 단일 메트릭 차트 (음수량 등 개별 표시용) ──

// @deprecated SyncedPanels로 대체됨
export function SingleMetricChart({
  data,
  metricKey,
  eventMarkers,
  timeRange,
}: {
  readonly data: readonly SensorPoint[];
  readonly metricKey: string;
  readonly eventMarkers: readonly EventMarker[];
  readonly timeRange: { from: number; to: number };
}): React.JSX.Element {
  const cfg = METRIC_CONFIG[metricKey];
  if (!cfg || data.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--ct-text-secondary)', fontSize: 13 }}>
        {cfg?.label ?? metricKey} 데이터 없음
      </div>
    );
  }

  const chartData = data.map((p) => ({ ts: p.ts * 1000, value: p.value }));
  const latestValue = chartData[chartData.length - 1]?.value;
  const maxValue = Math.max(...chartData.map((d) => d.value));
  const minValue = Math.min(...chartData.map((d) => d.value));
  const range = maxValue - minValue;
  const pad = Math.max(range * 0.2, 1);
  const yDomain: [number, number] = [Math.floor((minValue - pad) * 10) / 10, Math.ceil((maxValue + pad) * 10) / 10];

  const relevantMarkers = eventMarkers.filter((m) => {
    const t = new Date(m.detectedAt).getTime();
    return t >= timeRange.from && t <= timeRange.to;
  });

  return (
    <div style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)', borderRadius: 10, padding: '8px 8px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
          <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>({minValue.toFixed(1)}~{maxValue.toFixed(1)})</span>
        </div>
        {latestValue !== undefined && (
          <span style={{ fontSize: 14, fontWeight: 800, color: cfg.color }}>
            {latestValue.toFixed(1)}<span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2 }}>{cfg.unit}</span>
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={chartData} margin={{ top: 5, right: 16, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" strokeOpacity={0.4} vertical={false} />
          <XAxis dataKey="ts" type="number" domain={[timeRange.from, timeRange.to]} scale="time" tickFormatter={(ts: number) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; }} tick={{ fontSize: 9, fill: 'var(--ct-text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--ct-border)' }} tickCount={6} />
          <YAxis domain={yDomain} tick={{ fontSize: 9, fill: 'var(--ct-text-muted)' }} tickLine={false} axisLine={false} width={35} tickCount={5} />
          <Tooltip content={<CustomTooltip metricKey={metricKey} />} cursor={{ stroke: cfg.color, strokeWidth: 1, strokeDasharray: '4 4' }} isAnimationActive={false} />
          <EventMarkerLines markers={relevantMarkers} />
          <Line type="monotone" dataKey="value" stroke={cfg.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: cfg.color, strokeWidth: 2, fill: '#0f172a' }} animationDuration={600} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 이벤트 타임라인 ──

function EventTimeline({ markers }: { readonly markers: readonly EventMarker[] }): React.JSX.Element | null {
  if (markers.length === 0) return null;

  return (
    <div
      style={{
        background: 'var(--ct-bg)',
        border: '1px solid var(--ct-border)',
        borderRadius: 10,
        padding: 12,
      }}
    >
      <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--ct-text-secondary)', marginBottom: 8 }}>
        감지 이벤트 ({markers.length}건)
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
        {markers.map((m) => {
          const color = SEVERITY_COLORS[m.severity] ?? '#eab308';
          const label = EVENT_LABELS[m.smaxtecType] ?? EVENT_LABELS[m.eventType] ?? m.label;
          const time = new Date(m.detectedAt);
          return (
            <div
              key={m.eventId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 6px',
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ color: 'var(--ct-text)', fontWeight: 600, minWidth: 70 }}>{label}</span>
              <span style={{ color: 'var(--ct-text-muted)', flex: 1 }}>
                {time.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}{' '}
                {time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color,
                  padding: '1px 6px',
                  borderRadius: 3,
                  background: `${color}15`,
                }}
              >
                {m.severity}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 동기화 개별 패널 차트 (4패널 + 크로스헤어) ──

function findValueAtTs(data: readonly SensorPoint[], targetMs: number): number | null {
  if (data.length === 0) return null;
  let closest = data[0]!;
  let minDist = Math.abs(closest.ts * 1000 - targetMs);
  for (const p of data) {
    const dist = Math.abs(p.ts * 1000 - targetMs);
    if (dist < minDist) { closest = p; minDist = dist; }
  }
  if (minDist > 2 * 3600 * 1000) return null;
  return closest.value;
}

function SyncPanel({
  data, metricKey, eventMarkers, timeRange, syncTs, onHover,
}: {
  readonly data: readonly SensorPoint[];
  readonly metricKey: string;
  readonly eventMarkers: readonly EventMarker[];
  readonly timeRange: { from: number; to: number };
  readonly syncTs: number | null;
  readonly onHover: (ts: number | null) => void;
}): React.JSX.Element {
  const cfg = METRIC_CONFIG[metricKey];
  if (!cfg || data.length === 0) return <></>;

  const chartData = useMemo(() => data.map((p) => ({ ts: p.ts * 1000, value: p.value })), [data]);
  const values = useMemo(() => chartData.map((d) => d.value), [chartData]);
  const latest = values[values.length - 1] ?? 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = Math.max(range * 0.15, cfg.unit === '°C' ? 0.3 : 0.5);
  const yDomain: [number, number] = [
    Math.floor((min - pad) * 10) / 10,
    Math.ceil((max + pad) * 10) / 10,
  ];

  const syncValue = syncTs !== null ? findValueAtTs(data, syncTs) : null;
  const displayValue = syncValue ?? latest;
  const isAbnormal = displayValue < cfg.normalMin || displayValue > cfg.normalMax;

  const relevantMarkers = useMemo(() =>
    eventMarkers.filter((m) => {
      const t = new Date(m.detectedAt).getTime();
      return t >= timeRange.from && t <= timeRange.to;
    }), [eventMarkers, timeRange]);

  const handleMouseMove = useCallback((state: { activeLabel?: string | number }) => {
    if (state.activeLabel != null) onHover(Number(state.activeLabel));
  }, [onHover]);

  return (
    <div style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)', borderRadius: 10, padding: '8px 8px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
          <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>({cfg.normalMin}~{cfg.normalMax} {cfg.unit})</span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: isAbnormal ? '#ef4444' : cfg.color }}>
          {displayValue.toFixed(1)}
          <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2 }}>{cfg.unit}</span>
          {syncTs !== null && (
            <span style={{ fontSize: 9, color: 'var(--ct-text-muted)', marginLeft: 4 }}>
              {new Date(syncTs).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={chartData} margin={{ top: 2, right: 8, bottom: 2, left: 0 }} onMouseMove={handleMouseMove} onMouseLeave={() => onHover(null)}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" strokeOpacity={0.3} vertical={false} />
          <XAxis dataKey="ts" type="number" domain={[timeRange.from, timeRange.to]} scale="time"
            tickFormatter={(ts: number) => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}시`; }}
            tick={{ fontSize: 9, fill: 'var(--ct-text-muted)' }} tickLine={false} axisLine={{ stroke: 'var(--ct-border)' }} tickCount={8} />
          <YAxis domain={yDomain} tick={{ fontSize: 9, fill: 'var(--ct-text-muted)' }} tickLine={false} axisLine={false} width={38} tickCount={5} />
          <Tooltip content={() => null} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} isAnimationActive={false} />
          <ReferenceArea y1={cfg.normalMin} y2={cfg.normalMax} fill="#22c55e" fillOpacity={0.06} stroke="none" />
          {syncTs !== null && <ReferenceLine x={syncTs} stroke="#f8fafc" strokeWidth={1} strokeDasharray="2 2" />}
          {relevantMarkers.map((m, i) => (
            <ReferenceLine key={`${m.detectedAt}-${i}`} x={new Date(m.detectedAt).getTime()} stroke={SEVERITY_COLORS[m.severity] ?? '#eab308'} strokeDasharray="4 3" strokeWidth={1} />
          ))}
          <Line type="monotone" dataKey="value" stroke={cfg.color} strokeWidth={1.5} dot={false} activeDot={{ r: 3, stroke: cfg.color, strokeWidth: 2, fill: '#0f172a' }} animationDuration={400} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SyncedPanels({
  metrics, eventMarkers, timeRange, hasData,
}: {
  readonly metrics: Record<string, readonly SensorPoint[]>;
  readonly eventMarkers: readonly EventMarker[];
  readonly timeRange: { from: number; to: number };
  readonly hasData: boolean;
}): React.JSX.Element {
  const [syncTs, setSyncTs] = useState<number | null>(null);
  const metricsOrder = ['temp', 'act', 'rum', 'dr'] as const;
  const available = metricsOrder.filter((k) => metrics[k] && metrics[k].length > 0);

  const handleHover = useCallback((ts: number | null) => setSyncTs(ts), []);

  if (!hasData) {
    return <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ct-text-secondary)', fontSize: 13 }}>이 기간의 센서 데이터가 없습니다.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }} onMouseLeave={() => setSyncTs(null)}>
      {/* 동기화 오버레이 */}
      {syncTs !== null && (
        <div style={{
          position: 'absolute', top: 4, right: 8, background: 'rgba(15,23,42,0.92)',
          border: '1px solid var(--ct-border)', borderRadius: 8, padding: '8px 12px', zIndex: 10, minWidth: 150, pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>
            {new Date(syncTs).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} {new Date(syncTs).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </div>
          {available.map((key) => {
            const cfg = METRIC_CONFIG[key];
            const val = findValueAtTs(metrics[key] ?? [], syncTs);
            if (!cfg || val === null) return null;
            const abnormal = val < cfg.normalMin || val > cfg.normalMax;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color }} />
                <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 24 }}>{cfg.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: abnormal ? '#ef4444' : '#f8fafc' }}>{val.toFixed(1)}</span>
                <span style={{ fontSize: 9, color: '#64748b' }}>{cfg.unit}</span>
              </div>
            );
          })}
        </div>
      )}

      {available.map((key) => (
        <SyncPanel key={key} data={metrics[key] ?? []} metricKey={key} eventMarkers={eventMarkers} timeRange={timeRange} syncTs={syncTs} onHover={handleHover} />
      ))}

      <EventTimeline markers={eventMarkers} />
    </div>
  );
}

// ── 메인 모달 ──

export function SensorChartModal({ animalId, onClose, onAskAi }: Props): React.JSX.Element {
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--ct-card)',
          border: '1px solid var(--ct-border)',
          borderRadius: 14,
          width: '95%',
          maxWidth: 900,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* 헤더 — 닫기 버튼만 (기간 선택은 SensorChartInline 내장) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '10px 16px',
            borderBottom: '1px solid var(--ct-border)',
          }}
        >
            <button
              type="button"
              onClick={onClose}
              style={{
                marginLeft: 8,
                width: 28,
                height: 28,
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--ct-border)',
                color: 'var(--ct-text-muted)',
                cursor: 'pointer',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* 개체 대시보드와 100% 동일한 SensorChartInline 사용 */}
          <SensorChartInline animalId={animalId} />
        </div>

        {/* 하단 — 닫기 */}
        <div
          style={{
            padding: '10px 20px',
            borderTop: '1px solid var(--ct-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--ct-text-muted)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 16, height: 8, background: 'rgba(34,197,94,0.15)', borderRadius: 2 }} />
              정상범위
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 2, background: '#f97316' }} />
              현재
            </span>
            <span style={{ color: '#ef4444' }}>● 이상값</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {onAskAi && (
              <button
                type="button"
                onClick={() => onAskAi(animalId, `이 소의 센서 데이터를 분석해주세요.`)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                🤖 AI 분석
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 16px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                background: 'var(--ct-primary)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
