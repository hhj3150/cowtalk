// 건강 모니터링 차트 — 7개 시계열, 3축, 낮밤 배경, 커스텀 툴팁

import React, { useMemo, useCallback } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  Brush,
  ResponsiveContainer,
} from 'recharts';
import type { HealthChartDataPoint, ViewMode, DateRange } from '@web/types/health-chart';
import { CHART_LINES } from '@web/types/health-chart';

interface Props {
  readonly data: readonly HealthChartDataPoint[];
  readonly viewMode: ViewMode;
  readonly dateRange: DateRange;
  readonly brushIndex?: { startIndex: number; endIndex: number };
  readonly onBrushChange?: (start: number, end: number) => void;
}

// ── 포맷 함수 ──

function formatValue(val: number): string {
  if (Number.isInteger(val)) return String(val);
  return val.toFixed(2);
}

function formatTooltipDate(ts: string): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 || 12;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}. ${ampm} ${String(h12)}:${String(m).padStart(2, '0')}`;
}

// ── 낮밤 밴드 계산 ──

interface DayNightBand {
  readonly x1: string;
  readonly x2: string;
  readonly isDay: boolean;
}

function computeDayNightBands(data: readonly HealthChartDataPoint[]): readonly DayNightBand[] {
  if (data.length === 0) return [];

  const bands: DayNightBand[] = [];
  const first = new Date(data[0]!.timestamp);
  const last = new Date(data[data.length - 1]!.timestamp);

  // 시작일 00:00부터 종료일+1 00:00까지 6시간 단위 순회
  const cursor = new Date(first);
  cursor.setHours(0, 0, 0, 0);

  while (cursor < last) {
    const hour = cursor.getHours();
    const isDay = hour >= 6 && hour < 18;
    const bandStart = cursor.toISOString();
    const bandEnd = new Date(cursor);

    if (hour < 6) {
      bandEnd.setHours(6, 0, 0, 0);
    } else if (hour < 18) {
      bandEnd.setHours(18, 0, 0, 0);
    } else {
      bandEnd.setDate(bandEnd.getDate() + 1);
      bandEnd.setHours(6, 0, 0, 0);
    }

    bands.push({ x1: bandStart, x2: bandEnd.toISOString(), isDay });
    cursor.setTime(bandEnd.getTime());
  }

  return bands;
}

// ── 커스텀 툴팁 ──

interface TooltipProps {
  readonly active?: boolean;
  readonly payload?: readonly { dataKey: string; value: number; color: string }[];
  readonly label?: string;
  readonly viewMode: ViewMode;
}

function CustomTooltip({ active, payload, label, viewMode }: TooltipProps): React.JSX.Element | null {
  if (!active || !payload || !label) return null;

  const visibleLines = viewMode === 'all'
    ? CHART_LINES
    : CHART_LINES.filter((l) => l.showInRuminationMode);

  return (
    <div
      style={{
        background: 'rgba(30,30,46,0.95)',
        borderRadius: 8,
        padding: '12px 16px',
        border: '1px solid rgba(255,255,255,0.1)',
        minWidth: 220,
      }}
    >
      <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        {formatTooltipDate(label)}
      </p>
      {visibleLines.map((line) => {
        const entry = payload.find((p) => p.dataKey === line.key);
        const value = entry?.value ?? 0;
        return (
          <div key={line.key} style={{ display: 'flex', alignItems: 'center', gap: 8, lineHeight: '24px' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: line.color,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ color: '#E0E0E0', fontSize: 12 }}>
              {line.label}: <strong>{formatValue(value)}</strong>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── 메인 차트 ──

export function HealthMonitorChart({
  data,
  viewMode,
  brushIndex,
  onBrushChange,
}: Props): React.JSX.Element {
  const dayNightBands = useMemo(() => computeDayNightBands(data), [data]);

  const visibleLines = useMemo(
    () => viewMode === 'all'
      ? CHART_LINES
      : CHART_LINES.filter((l) => l.showInRuminationMode),
    [viewMode],
  );

  const nowIso = useMemo(() => new Date().toISOString(), []);

  const handleBrush = useCallback((brush: { startIndex?: number; endIndex?: number }) => {
    if (brush.startIndex !== undefined && brush.endIndex !== undefined) {
      onBrushChange?.(brush.startIndex, brush.endIndex);
    }
  }, [onBrushChange]);

  // X축 틱 간격 (데이터 밀도에 따라)
  const tickInterval = useMemo(() => {
    const visibleCount = brushIndex
      ? brushIndex.endIndex - brushIndex.startIndex
      : data.length;
    if (visibleCount <= 144) return 12; // 1일: 2시간 간격
    if (visibleCount <= 1008) return 72; // 7일: 12시간 간격
    return 144; // 10일+: 1일 간격
  }, [data.length, brushIndex]);

  return (
    <div style={{ background: '#1E1E2E', borderRadius: 12, padding: '16px 8px 8px' }}>
      <ResponsiveContainer width="100%" height={480}>
        <ComposedChart
          data={data as HealthChartDataPoint[]}
          margin={{ top: 10, right: 20, bottom: 10, left: 20 }}
        >
          <CartesianGrid
            stroke="rgba(255,255,255,0.07)"
            strokeDasharray="3 3"
            vertical={false}
          />

          {/* 낮밤 배경 밴드 */}
          {dayNightBands.map((band, i) =>
            band.isDay ? (
              <ReferenceArea
                key={`band-${i}`}
                x1={band.x1}
                x2={band.x2}
                fill="rgba(255,255,255,0.03)"
                fillOpacity={1}
                ifOverflow="extendDomain"
              />
            ) : null,
          )}

          {/* 현재 시간 수직선 */}
          <ReferenceLine
            x={nowIso}
            stroke="#FF9800"
            strokeWidth={2}
            strokeDasharray="4 2"
          />

          {/* X축 */}
          <XAxis
            dataKey="timestamp"
            tick={{ fill: '#fff', fontSize: 10 }}
            tickFormatter={(ts: string) => {
              const d = new Date(ts);
              const h = d.getHours();
              const ampm = h < 12 ? '오전' : '오후';
              const h12 = h % 12 || 12;
              return `${ampm} ${String(h12)}:00`;
            }}
            interval={tickInterval}
            axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.2)' }}
          />

          {/* Y축 1: 음수량 (왼쪽) */}
          <YAxis
            yAxisId="water"
            orientation="left"
            domain={[0, 600]}
            ticks={[0, 100, 200, 300, 400, 500, 600]}
            tick={{ fill: '#4FC3F7', fontSize: 10 }}
            axisLine={{ stroke: '#4FC3F7' }}
            label={{ value: 'l/24h', angle: -90, position: 'insideLeft', fill: '#4FC3F7', fontSize: 11 }}
            width={45}
          />

          {/* Y축 2: 온도 (왼쪽) */}
          <YAxis
            yAxisId="temp"
            orientation="left"
            domain={[20, 60]}
            ticks={[20, 30, 40, 50, 60]}
            tick={{ fill: '#5C6BC0', fontSize: 10 }}
            axisLine={{ stroke: '#5C6BC0' }}
            label={{ value: '°C', angle: -90, position: 'insideLeft', fill: '#5C6BC0', fontSize: 11 }}
            width={35}
          />

          {/* Y축 3: 반추/활동 (오른쪽) */}
          <YAxis
            yAxisId="rumination"
            orientation="right"
            domain={[0, 700]}
            ticks={[0, 100, 200, 300, 400, 500, 600, 700]}
            tick={{ fill: '#8BC34A', fontSize: 10 }}
            axisLine={{ stroke: '#8BC34A' }}
            label={{ value: '분', angle: 90, position: 'insideRight', fill: '#8BC34A', fontSize: 11 }}
            width={40}
          />

          {/* 활동/발정/분만 (숨김 축, rumination 축에 매핑) */}
          <YAxis yAxisId="activity" hide domain={[0, 30]} />

          {/* 툴팁 */}
          <Tooltip
            content={<CustomTooltip viewMode={viewMode} />}
            cursor={{ stroke: 'rgba(255,255,255,0.5)', strokeWidth: 1 }}
          />

          {/* 데이터 라인들 */}
          {visibleLines.map((line) => (
            <Line
              key={line.key}
              type={line.type ?? 'monotone'}
              dataKey={line.key}
              yAxisId={line.yAxisId}
              stroke={line.color}
              strokeWidth={line.strokeWidth}
              strokeOpacity={line.opacity ?? 1}
              dot={false}
              activeDot={{
                r: 4,
                fill: line.color,
                stroke: '#fff',
                strokeWidth: 1,
              }}
              isAnimationActive={false}
            />
          ))}

          {/* Brush — 줌/패닝 */}
          <Brush
            dataKey="timestamp"
            height={30}
            stroke="#8BC34A"
            fill="#1a1a2e"
            tickFormatter={(ts: string) => {
              const d = new Date(ts);
              return `${String(d.getMonth() + 1)}/${String(d.getDate())}`;
            }}
            startIndex={brushIndex?.startIndex}
            endIndex={brushIndex?.endIndex}
            onChange={handleBrush}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
