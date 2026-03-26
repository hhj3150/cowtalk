// 건강 모니터링 차트 — 7개 시계열, 3축, 커스텀 툴팁
// Recharts ComposedChart 기반, 더미/실데이터 겸용
// 낮밤 배경 밴드 + 현재 시간 수직선 + 마우스 휠 줌

import React, { useMemo, useCallback, useRef } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
  ResponsiveContainer,
  Customized,
} from 'recharts';
import type { HealthChartDataPoint, ViewMode } from '@web/types/health-chart';
import { CHART_LINES } from '@web/types/health-chart';

interface Props {
  readonly data: readonly HealthChartDataPoint[];
  readonly viewMode: ViewMode;
  readonly brushIndex?: { startIndex: number; endIndex: number };
  readonly onBrushChange?: (start: number, end: number) => void;
  readonly onWheelZoom?: (direction: 'in' | 'out') => void;
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

// ── 낮밤 배경 밴드 + 현재 시간 수직선 (커스텀 SVG 오버레이) ──

interface OverlayProps {
  readonly formattedGraphicalItems?: readonly {
    readonly props?: { readonly data?: readonly { readonly timestamp?: string }[] };
    readonly item?: { readonly props?: { readonly points?: readonly { readonly x?: number; readonly y?: number }[] } };
  }[];
  readonly xAxisMap?: Readonly<Record<string, { readonly x?: number; readonly width?: number; readonly scale?: (val: string) => number }>>;
  readonly yAxisMap?: Readonly<Record<string, { readonly y?: number; readonly height?: number }>>;
  readonly offset?: { readonly top?: number; readonly bottom?: number; readonly left?: number; readonly right?: number };
  readonly data: readonly HealthChartDataPoint[];
  readonly brushStart?: number;
  readonly brushEnd?: number;
}

function DayNightOverlay(props: OverlayProps): React.JSX.Element | null {
  const { data, offset, brushStart, brushEnd } = props;

  if (!offset || data.length === 0) return null;

  const chartTop = offset.top ?? 0;

  // Brush 적용 시 보이는 데이터 범위
  const startIdx = brushStart ?? 0;
  const endIdx = brushEnd ?? data.length - 1;
  const visibleData = data.slice(startIdx, endIdx + 1);

  if (visibleData.length === 0) return null;

  // 차트 영역 너비에서 각 데이터 포인트 x 좌표 계산
  // ResponsiveContainer의 실제 width는 props에서 직접 얻기 어려우므로
  // xAxisMap에서 가져옴
  const xAxis = props.xAxisMap ? Object.values(props.xAxisMap)[0] : undefined;
  const yAxis = props.yAxisMap ? Object.values(props.yAxisMap)[0] : undefined;

  if (!xAxis?.scale || !yAxis) return null;

  const plotTop = chartTop;
  const plotHeight = (yAxis.height ?? 0);

  // 야간 시간대 (18:00 ~ 06:00) 밴드 생성
  const nightBands: { x1: number; x2: number }[] = [];
  let nightStart: number | null = null;

  for (let i = 0; i < visibleData.length; i++) {
    const ts = visibleData[i]!.timestamp;
    const hour = new Date(ts).getHours();
    const isNight = hour >= 18 || hour < 6;

    const x = xAxis.scale(ts);
    if (typeof x !== 'number' || isNaN(x)) continue;

    if (isNight && nightStart === null) {
      nightStart = x;
    } else if (!isNight && nightStart !== null) {
      nightBands.push({ x1: nightStart, x2: x });
      nightStart = null;
    }
  }
  // 마지막 야간 구간
  if (nightStart !== null) {
    const lastTs = visibleData[visibleData.length - 1]!.timestamp;
    const lastX = xAxis.scale(lastTs);
    if (typeof lastX === 'number' && !isNaN(lastX)) {
      nightBands.push({ x1: nightStart, x2: lastX });
    }
  }

  // 현재 시간 수직선
  const nowIso = new Date().toISOString();
  const firstTs = new Date(visibleData[0]!.timestamp).getTime();
  const lastTs = new Date(visibleData[visibleData.length - 1]!.timestamp).getTime();
  const nowMs = Date.now();
  const showNowLine = nowMs >= firstTs && nowMs <= lastTs;

  let nowX: number | null = null;
  if (showNowLine) {
    // 가장 가까운 데이터 포인트의 x 좌표를 사용
    const x = xAxis.scale(nowIso);
    if (typeof x === 'number' && !isNaN(x)) {
      nowX = x;
    } else {
      // 비례 보간
      const ratio = (nowMs - firstTs) / (lastTs - firstTs);
      const x1 = xAxis.scale(visibleData[0]!.timestamp);
      const x2 = xAxis.scale(visibleData[visibleData.length - 1]!.timestamp);
      if (typeof x1 === 'number' && typeof x2 === 'number') {
        nowX = x1 + ratio * (x2 - x1);
      }
    }
  }

  return (
    <g>
      {/* 야간 밴드 */}
      {nightBands.map((band, idx) => (
        <rect
          key={idx}
          x={band.x1}
          y={plotTop}
          width={Math.max(0, band.x2 - band.x1)}
          height={plotHeight}
          fill="rgba(30,30,80,0.25)"
          pointerEvents="none"
        />
      ))}
      {/* 현재 시간 수직선 */}
      {nowX !== null && (
        <>
          <line
            x1={nowX}
            y1={plotTop}
            x2={nowX}
            y2={plotTop + plotHeight}
            stroke="#ef4444"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            pointerEvents="none"
          />
          <text
            x={nowX}
            y={plotTop - 4}
            textAnchor="middle"
            fill="#ef4444"
            fontSize={9}
            fontWeight={600}
          >
            지금
          </text>
        </>
      )}
    </g>
  );
}

// ── 메인 차트 ──

export function HealthMonitorChart({
  data,
  viewMode,
  brushIndex,
  onBrushChange,
  onWheelZoom,
}: Props): React.JSX.Element {
  const visibleLines = useMemo(
    () => viewMode === 'all'
      ? CHART_LINES
      : CHART_LINES.filter((l) => l.showInRuminationMode),
    [viewMode],
  );

  const handleBrush = useCallback((brush: { startIndex?: number; endIndex?: number }) => {
    if (brush.startIndex !== undefined && brush.endIndex !== undefined) {
      onBrushChange?.(brush.startIndex, brush.endIndex);
    }
  }, [onBrushChange]);

  // X축 틱 간격
  const tickInterval = useMemo(() => {
    const visibleCount = brushIndex
      ? brushIndex.endIndex - brushIndex.startIndex
      : data.length;
    if (visibleCount <= 144) return 12;
    if (visibleCount <= 1008) return 72;
    return 144;
  }, [data.length, brushIndex]);

  // 마우스 휠 줌 핸들러
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!onWheelZoom) return;
    e.preventDefault();
    onWheelZoom(e.deltaY < 0 ? 'in' : 'out');
  }, [onWheelZoom]);

  if (data.length === 0) {
    return (
      <div style={{ background: '#1E1E2E', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888' }}>
        데이터가 없습니다
      </div>
    );
  }

  return (
    <div
      ref={chartWrapperRef}
      onWheel={handleWheel}
      style={{ background: '#1E1E2E', borderRadius: 12, padding: '16px 8px 8px' }}
    >
      <ResponsiveContainer width="100%" height={480}>
        <ComposedChart
          data={data as HealthChartDataPoint[]}
          margin={{ top: 16, right: 20, bottom: 10, left: 20 }}
        >
          {/* 낮밤 배경 밴드 + 현재 시간선 (가장 먼저 렌더링 → 뒤에 깔림) */}
          <Customized
            component={(customProps: Record<string, unknown>) => (
              <DayNightOverlay
                {...(customProps as unknown as OverlayProps)}
                data={data}
                brushStart={brushIndex?.startIndex}
                brushEnd={brushIndex?.endIndex}
              />
            )}
          />

          <CartesianGrid
            stroke="rgba(255,255,255,0.07)"
            strokeDasharray="3 3"
            vertical={false}
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
            tick={{ fill: '#81D4FA', fontSize: 10 }}
            axisLine={{ stroke: '#81D4FA' }}
            label={{ value: '°C', angle: -90, position: 'insideLeft', fill: '#81D4FA', fontSize: 11 }}
            width={35}
          />

          {/* Y축 3: 반추 (오른쪽) */}
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

          {/* 활동/발정/분만 (숨김 축) */}
          <YAxis yAxisId="activity" hide domain={[0, 120]} />

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
