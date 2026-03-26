// 개체 대시보드 임베디드 센서 차트 — SensorChartModal과 동일한 품질
// 체온/활동/반추/음수 개별 패널 + 이벤트 마커 + 기간 선택

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceArea,
} from 'recharts';
import { apiGet } from '@web/api/client';

// ── 타입 ──

interface SensorPoint {
  readonly ts: number;
  readonly value: number;
}

interface EventMarker {
  readonly eventType: string;
  readonly smaxtecType: string;
  readonly label: string;
  readonly detectedAt: string;
  readonly severity: string;
}

interface SensorChartResponse {
  readonly animalId: string;
  readonly earTag: string;
  readonly period: { readonly from: string; readonly to: string; readonly days: number };
  readonly metrics: Record<string, readonly SensorPoint[]>;
  readonly eventMarkers: readonly EventMarker[];
}

interface Props {
  readonly animalId: string;
}

// ── 설정 ──

const METRIC_CONFIG: Record<string, {
  readonly label: string;
  readonly color: string;
  readonly unit: string;
  readonly normalMin: number;
  readonly normalMax: number;
}> = {
  temp: { label: '체온', color: '#3b82f6', unit: '°C', normalMin: 38.0, normalMax: 39.3 },
  act: { label: '활동', color: '#22c55e', unit: 'I/24h', normalMin: 0, normalMax: 300 },
  rum: { label: '반추', color: '#f97316', unit: '분', normalMin: 300, normalMax: 600 },
  dr: { label: '음수', color: '#ec4899', unit: 'L', normalMin: 40, normalMax: 120 },
};

const SEVERITY_COLORS: Record<string, string> = {
  high: '#ef4444', medium: '#f97316', low: '#eab308',
};

const PERIOD_OPTIONS = [
  { label: '24h', days: 1 },
  { label: '3일', days: 3 },
  { label: '7일', days: 7 },
  { label: '14일', days: 14 },
] as const;

// ── 단일 메트릭 차트 패널 ──

function MetricPanel({
  data, metricKey, eventMarkers, timeRange,
}: {
  readonly data: readonly SensorPoint[];
  readonly metricKey: string;
  readonly eventMarkers: readonly EventMarker[];
  readonly timeRange: { from: number; to: number };
}): React.JSX.Element {
  const cfg = METRIC_CONFIG[metricKey];
  if (!cfg || data.length === 0) return <></>;

  const chartData = data.map((p) => ({ ts: p.ts * 1000, value: p.value }));
  const values = chartData.map((d) => d.value);
  const latest = values[values.length - 1] ?? 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = Math.max(range * 0.2, cfg.unit === '°C' ? 0.5 : 1);
  const yDomain: [number, number] = [
    Math.floor((min - pad) * 10) / 10,
    Math.ceil((max + pad) * 10) / 10,
  ];

  const isAbnormal = latest < cfg.normalMin || latest > cfg.normalMax;

  const relevantMarkers = eventMarkers.filter((m) => {
    const t = new Date(m.detectedAt).getTime();
    return t >= timeRange.from && t <= timeRange.to;
  });

  return (
    <div style={{
      background: 'var(--ct-bg)',
      border: '1px solid var(--ct-border)',
      borderRadius: 10,
      padding: '8px 8px 2px',
    }}>
      {/* 헤더: 메트릭명 + 범위 + 현재값 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
          <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>({cfg.normalMin}~{cfg.normalMax} {cfg.unit})</span>
        </div>
        <span style={{ fontSize: 16, fontWeight: 800, color: isAbnormal ? '#ef4444' : cfg.color }}>
          {latest.toFixed(1)}
          <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2 }}>{cfg.unit}</span>
        </span>
      </div>

      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={chartData} margin={{ top: 2, right: 8, bottom: 2, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" strokeOpacity={0.3} vertical={false} />
          <XAxis
            dataKey="ts" type="number"
            domain={[timeRange.from, timeRange.to]}
            scale="time"
            tickFormatter={(ts: number) => {
              const d = new Date(ts);
              return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}시`;
            }}
            tick={{ fontSize: 9, fill: 'var(--ct-text-muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--ct-border)' }}
            tickCount={6}
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 9, fill: 'var(--ct-text-muted)' }}
            tickLine={false} axisLine={false} width={35} tickCount={4}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.[0] || !label) return null;
              const v = payload[0].value as number;
              const d = new Date(label as number);
              const abnormal = v < cfg.normalMin || v > cfg.normalMax;
              return (
                <div style={{
                  background: 'rgba(15,23,42,0.95)',
                  border: `1px solid ${abnormal ? '#ef4444' : cfg.color}`,
                  borderRadius: 6, padding: '6px 10px',
                }}>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>
                    {d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} {d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: abnormal ? '#ef4444' : '#f8fafc' }}>
                    {v.toFixed(1)} {cfg.unit}
                  </div>
                </div>
              );
            }}
            cursor={{ stroke: cfg.color, strokeWidth: 1, strokeDasharray: '4 4' }}
            isAnimationActive={false}
          />

          {/* 정상범위 배경 */}
          <ReferenceArea
            y1={cfg.normalMin} y2={cfg.normalMax}
            fill="#22c55e" fillOpacity={0.06} stroke="none"
          />

          {/* 이벤트 마커 */}
          {relevantMarkers.map((m, i) => (
            <ReferenceLine
              key={`${m.detectedAt}-${i}`}
              x={new Date(m.detectedAt).getTime()}
              stroke={SEVERITY_COLORS[m.severity] ?? '#eab308'}
              strokeDasharray="4 3" strokeWidth={1}
            />
          ))}

          <Line
            type="monotone" dataKey="value"
            stroke={cfg.color} strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, stroke: cfg.color, strokeWidth: 2, fill: '#0f172a' }}
            animationDuration={400}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 메인 컴포넌트 ──

export function SensorChartInline({ animalId }: Props): React.JSX.Element {
  const [days, setDays] = useState(7);

  const { data, isLoading, error } = useQuery({
    queryKey: ['sensor-chart-inline', animalId, days],
    queryFn: () => apiGet<SensorChartResponse>(
      `/unified-dashboard/animal/${animalId}/sensor-chart`,
      { days },
    ),
    staleTime: 2 * 60 * 1000,
    enabled: !!animalId,
  });

  const timeRange = useMemo(() => {
    if (data?.period) {
      return { from: new Date(data.period.from).getTime(), to: new Date(data.period.to).getTime() };
    }
    return { from: Date.now() - days * 86400000, to: Date.now() };
  }, [data, days]);

  const metricsOrder = ['temp', 'act', 'rum', 'dr'] as const;
  const hasData = data && metricsOrder.some((k) => data.metrics[k] && data.metrics[k].length > 0);

  return (
    <div style={{
      background: 'var(--ct-card)',
      border: '1px solid var(--ct-border)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--ct-border)',
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--ct-text)' }}>
          📊 센서 데이터
          {data?.earTag && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ct-text-muted)', marginLeft: 8 }}>{data.earTag}</span>}
        </h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => setDays(opt.days)}
              style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid',
                borderColor: days === opt.days ? 'var(--ct-primary, #10b981)' : 'var(--ct-border)',
                background: days === opt.days ? 'rgba(16,185,129,0.15)' : 'transparent',
                color: days === opt.days ? 'var(--ct-primary, #10b981)' : 'var(--ct-text-muted)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 차트 본문 */}
      <div style={{ padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {isLoading && (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--ct-text-muted)', fontSize: 13 }}>
            센서 데이터 로딩 중...
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: 20, color: '#ef4444', fontSize: 13 }}>
            센서 데이터를 불러올 수 없습니다
          </div>
        )}

        {!isLoading && !error && !hasData && (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--ct-text-muted)', fontSize: 13 }}>
            선택 기간에 센서 데이터가 없습니다
          </div>
        )}

        {!isLoading && !error && hasData && data && metricsOrder.map((key) => {
          const points = data.metrics[key];
          if (!points || points.length === 0) return null;
          return (
            <MetricPanel
              key={key}
              data={points}
              metricKey={key}
              eventMarkers={data.eventMarkers}
              timeRange={timeRange}
            />
          );
        })}

        {/* 이벤트 마커 범례 */}
        {data && data.eventMarkers.length > 0 && (
          <div style={{
            padding: '8px 8px 4px',
            fontSize: 11,
            color: 'var(--ct-text-muted)',
          }}>
            <span style={{ fontWeight: 600 }}>차트 이벤트 마커</span>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
              {data.eventMarkers.slice(0, 8).map((m, i) => {
                const color = SEVERITY_COLORS[m.severity] ?? '#eab308';
                const d = new Date(m.detectedAt);
                return (
                  <span key={`${m.detectedAt}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                    <span style={{ color }}>{m.label}</span>
                    <span>{d.getMonth() + 1}/{d.getDate()} {String(d.getHours()).padStart(2, '0')}:{String(d.getMinutes()).padStart(2, '0')}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
