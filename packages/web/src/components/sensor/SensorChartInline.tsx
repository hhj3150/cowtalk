// 개체 대시보드 임베디드 센서 차트 — smaXtec 스타일
// 체온/활동/반추/음수 개별 패널 + 동기화 크로스헤어 + 이벤트 마커

import React, { useState, useMemo, useCallback, useRef } from 'react';
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

// ── 동기화 크로스헤어: 호버 시 모든 패널에 동일 시점 표시 ──

/** 타임스탬프에서 가장 가까운 데이터 포인트의 값을 찾음 */
function findValueAtTs(data: readonly SensorPoint[], targetMs: number): number | null {
  if (data.length === 0) return null;
  let closest = data[0]!;
  let minDist = Math.abs(closest.ts * 1000 - targetMs);
  for (const p of data) {
    const dist = Math.abs(p.ts * 1000 - targetMs);
    if (dist < minDist) {
      closest = p;
      minDist = dist;
    }
  }
  // 2시간 이상 차이나면 해당 없음
  if (minDist > 2 * 3600 * 1000) return null;
  return closest.value;
}

// ── 단일 메트릭 차트 패널 ──

function MetricPanel({
  data, metricKey, eventMarkers, timeRange, syncTs, onHover,
}: {
  readonly data: readonly SensorPoint[];
  readonly metricKey: string;
  readonly eventMarkers: readonly EventMarker[];
  readonly timeRange: { from: number; to: number };
  readonly syncTs: number | null; // 동기화된 타임스탬프 (ms)
  readonly onHover: (ts: number | null) => void;
}): React.JSX.Element {
  const cfg = METRIC_CONFIG[metricKey];
  if (!cfg || data.length === 0) return <></>;

  const chartData = useMemo(() =>
    data.map((p) => ({ ts: p.ts * 1000, value: p.value })),
    [data],
  );
  const values = useMemo(() => chartData.map((d) => d.value), [chartData]);
  const latest = values[values.length - 1] ?? 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = Math.max(range * 0.2, cfg.unit === '°C' ? 0.5 : 1);
  const yDomain: [number, number] = [
    Math.floor((min - pad) * 10) / 10,
    Math.ceil((max + pad) * 10) / 10,
  ];

  // 동기화 시점의 값
  const syncValue = syncTs !== null ? findValueAtTs(data, syncTs) : null;
  const displayValue = syncValue ?? latest;
  const isAbnormal = displayValue < cfg.normalMin || displayValue > cfg.normalMax;

  const relevantMarkers = useMemo(() =>
    eventMarkers.filter((m) => {
      const t = new Date(m.detectedAt).getTime();
      return t >= timeRange.from && t <= timeRange.to;
    }),
    [eventMarkers, timeRange],
  );

  // 마우스 이동 핸들러
  const handleMouseMove = useCallback((state: { activeLabel?: string | number }) => {
    if (state.activeLabel != null) {
      onHover(Number(state.activeLabel));
    }
  }, [onHover]);

  const handleMouseLeave = useCallback(() => {
    onHover(null);
  }, [onHover]);

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
        <span style={{ fontSize: 16, fontWeight: 800, color: isAbnormal ? '#ef4444' : cfg.color, transition: 'color 0.15s' }}>
          {displayValue.toFixed(1)}
          <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 2 }}>{cfg.unit}</span>
          {syncTs !== null && (
            <span style={{ fontSize: 9, color: 'var(--ct-text-muted)', marginLeft: 4 }}>
              {new Date(syncTs).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={100}>
        <LineChart
          data={chartData}
          margin={{ top: 2, right: 8, bottom: 2, left: 0 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
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
            content={() => null}
            cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
            isAnimationActive={false}
          />

          {/* 정상범위 배경 */}
          <ReferenceArea
            y1={cfg.normalMin} y2={cfg.normalMax}
            fill="#22c55e" fillOpacity={0.06} stroke="none"
          />

          {/* 동기화 크로스헤어 (다른 패널에서 호버 시) */}
          {syncTs !== null && (
            <ReferenceLine
              x={syncTs}
              stroke="#f8fafc"
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          )}

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

// ── 동기화 툴팁 (호버 시 4개 메트릭 동시 표시) ──

function SyncTooltipOverlay({
  syncTs, metrics, allData,
}: {
  readonly syncTs: number | null;
  readonly metrics: readonly string[];
  readonly allData: Record<string, readonly SensorPoint[]>;
}): React.JSX.Element | null {
  if (syncTs === null) return null;

  const d = new Date(syncTs);
  const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  return (
    <div style={{
      position: 'absolute',
      top: 8,
      right: 16,
      background: 'rgba(15,23,42,0.92)',
      border: '1px solid var(--ct-border)',
      borderRadius: 8,
      padding: '8px 12px',
      zIndex: 10,
      minWidth: 150,
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>
        {timeStr}
      </div>
      {metrics.map((key) => {
        const cfg = METRIC_CONFIG[key];
        const points = allData[key];
        if (!cfg || !points || points.length === 0) return null;
        const val = findValueAtTs(points, syncTs);
        if (val === null) return null;
        const abnormal = val < cfg.normalMin || val > cfg.normalMax;
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color }} />
            <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 24 }}>{cfg.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: abnormal ? '#ef4444' : '#f8fafc' }}>
              {val.toFixed(1)}
            </span>
            <span style={{ fontSize: 9, color: '#64748b' }}>{cfg.unit}</span>
            {abnormal && <span style={{ fontSize: 8, color: '#ef4444', fontWeight: 700 }}>!</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── 메인 컴포넌트 ──

export function SensorChartInline({ animalId }: Props): React.JSX.Element {
  const [days, setDays] = useState(7);
  const [syncTs, setSyncTs] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<{ from: number; to: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['sensor-chart-inline', animalId, days],
    queryFn: () => apiGet<SensorChartResponse>(
      `/unified-dashboard/animal/${animalId}/sensor-chart`,
      { days },
    ),
    staleTime: 2 * 60 * 1000,
    enabled: !!animalId,
  });

  const fullRange = useMemo(() => {
    if (data?.period) {
      return { from: new Date(data.period.from).getTime(), to: new Date(data.period.to).getTime() };
    }
    return { from: Date.now() - days * 86400000, to: Date.now() };
  }, [data, days]);

  // 줌 리셋 on days change
  const handleDaysChange = useCallback((d: number) => {
    setDays(d);
    setZoomRange(null);
  }, []);

  const timeRange = zoomRange ?? fullRange;

  // 마우스 휠 줌: 호버 시점 중심으로 확대/축소
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const current = zoomRange ?? fullRange;
    const span = current.to - current.from;
    const minSpan = 2 * 3600 * 1000;   // 최소 2시간
    const maxSpan = fullRange.to - fullRange.from; // 최대 전체 기간

    // 줌인: 휠 위, 줌아웃: 휠 아래
    const factor = e.deltaY < 0 ? 0.7 : 1.4;
    const newSpan = Math.max(minSpan, Math.min(maxSpan, span * factor));

    // 마우스 위치를 중심으로 줌 (syncTs 활용)
    const center = syncTs ?? (current.from + current.to) / 2;
    const ratio = (center - current.from) / span;
    const newFrom = Math.max(fullRange.from, center - newSpan * ratio);
    const newTo = Math.min(fullRange.to, newFrom + newSpan);

    if (Math.abs(newSpan - maxSpan) < 1000) {
      setZoomRange(null); // 전체 범위면 줌 해제
    } else {
      setZoomRange({ from: newFrom, to: newTo });
    }
  }, [zoomRange, fullRange, syncTs]);

  const metricsOrder = ['temp', 'act', 'rum', 'dr'] as const;
  const availableMetrics = useMemo(() =>
    metricsOrder.filter((k) => data?.metrics[k] && data.metrics[k].length > 0),
    [data],
  );
  const hasData = availableMetrics.length > 0;

  const handleHover = useCallback((ts: number | null) => {
    setSyncTs(ts);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        background: 'var(--ct-card)',
        border: '1px solid var(--ct-border)',
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
      }}
      onMouseLeave={() => setSyncTs(null)}
      onWheel={handleWheel}
    >
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid var(--ct-border)',
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: 'var(--ct-text)' }}>
          📊 센서 데이터
          {data?.earTag && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ct-text-muted)', marginLeft: 8 }}>{data.earTag}</span>}
          {zoomRange && (
            <button
              type="button"
              onClick={() => setZoomRange(null)}
              style={{ marginLeft: 8, fontSize: 10, color: '#f59e0b', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}
            >
              줌 리셋
            </button>
          )}
        </h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              type="button"
              onClick={() => handleDaysChange(opt.days)}
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

      {/* 동기화 툴팁 오버레이 */}
      {data && (
        <SyncTooltipOverlay syncTs={syncTs} metrics={availableMetrics} allData={data.metrics} />
      )}

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

        {!isLoading && !error && hasData && data && availableMetrics.map((key) => {
          const points = data.metrics[key];
          if (!points || points.length === 0) return null;
          return (
            <MetricPanel
              key={key}
              data={points}
              metricKey={key}
              eventMarkers={data.eventMarkers}
              timeRange={timeRange}
              syncTs={syncTs}
              onHover={handleHover}
            />
          );
        })}

        {/* 이벤트 마커 범례 */}
        {data && data.eventMarkers.length > 0 && (
          <div style={{ padding: '8px 8px 4px', fontSize: 11, color: 'var(--ct-text-muted)' }}>
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
