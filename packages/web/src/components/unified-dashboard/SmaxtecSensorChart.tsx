// smaXtec 완전 복제 센서 차트
// - 7개 시리즈 통합 (체온·평균체온·반추·활동·음수·발정지수·분만지수)
// - 3축: 좌 0-700 l/24h + °C 오버레이, 우 0-600 분 (반추)
// - 시각 레이아웃 (smaXtec 골드 스탠다드 일치):
//     반추 GREEN → 73% (상단)
//     체온 BLUE → 67% (중단, W딥 가시화)
//     활동 DARKRED → 0-43% (하단, raw×3 스케일)
// - 주야간 배경 밴드, 이벤트 마커(주황 수직선), 마우스무브 크로스헤어 툴팁
// - 뷰 모드: 전체보기 / 반추+음수 토글
// - 시리즈별 ON/OFF 설정 드롭다운

import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  ComposedChart, Line, YAxis, XAxis, CartesianGrid,
  ReferenceArea, ReferenceLine, ResponsiveContainer,
  Tooltip, Customized,
} from 'recharts';
import type {
  AnimalSensorChartData,
  SensorChartPoint,
  SensorEventMarker,
} from '@web/api/unified-dashboard.api';

// ── 색상 상수 ──

const C = {
  temp:     '#4A90D9',  // 파란색 — 체온
  tempNorm: '#B0B0B0',  // 회색   — 평균체온 (기준선)
  rum:      '#7CB342',  // 연두색 — 반추 (main)
  act:      '#C2185B',  // 진홍   — 활동량
  estrus:   '#FF69B4',  // 핑크   — 발정지수
  calving:  '#FFA000',  // 주황   — 분만지수
  dr:       '#81D4FA',  // 하늘색 — 음수량 (step)
  event:    '#FFA500',  // 이벤트 수직선
  day:      'rgba(58,74,42,0.40)',
  night:    'rgba(26,26,26,0.70)',
  grid:     '#444',
  tooltip:  'rgba(33,33,33,0.93)',
  text:     '#EFEFEF',
  muted:    '#888',
} as const;

// ── 데이터 변환 ──

/**
 * 체온 °C → 좌측 축 스케일 (가독성 최우선)
 * 공식: (t - 20) × 25
 *   20°C →   0  (바닥)
 *   30°C → 250  (음수 최저점 — 드링킹 딥 가시화)
 *   38°C → 450  (정상체온)
 *   42°C → 550  (고열 영역)
 * left domain [0,700]: 38.8°C → 470/700 = 67% (반추 440/600=73% 아래 배치)
 * → 1°C 변화 = 25/700 ≈ 3.6% 차트 높이, 8°C 음수딥 = 28.6% 낙차
 */
const tempToScale = (t: number) => (t - 20) * 25;

interface ChartRow {
  ts: number;
  temp?: number;        // scaled via tempToScale
  tempRaw?: number;     // actual °C
  tempNorm?: number;    // scaled
  tempNormRaw?: number; // actual °C
  rum?: number;
  act?: number;         // raw × 3 (scaled for visibility)
  actRaw?: number;      // original raw value for tooltip
  estrus?: number;
  calving?: number;
  dr?: number;
}

/**
 * 24h 롤링 평균 체온 계산 — 음수 피크 제외
 * 소가 물을 마실 때 위내 온도가 30°C 대로 급강하하므로
 * 37.5°C 미만 포인트를 제외하고 평균 산출 (smaXtec 흰 직선과 동일 기법)
 */
function computeNormalTemp(pts: readonly SensorChartPoint[]): Map<number, number> {
  const WIN = 24 * 3600;
  const map = new Map<number, number>();
  for (let i = 0; i < pts.length; i++) {
    const t = pts[i]!.ts;
    let sum = 0, cnt = 0;
    for (let j = i; j >= 0 && pts[j]!.ts >= t - WIN; j--) {
      if (pts[j]!.value >= 37.5) { sum += pts[j]!.value; cnt++; }
    }
    if (cnt > 0) map.set(t, sum / cnt);
    else if (i > 0) {
      // 전 구간이 모두 음수 피크인 경우 이전 베이스라인 유지
      const prev = map.get(pts[i - 1]!.ts);
      if (prev !== undefined) map.set(t, prev);
    }
  }
  return map;
}

/** 전체 metrics → 통합 시계열 배열 */
function mergeMetrics(data: AnimalSensorChartData): ChartRow[] {
  const map = new Map<number, ChartRow>();
  const ensure = (ts: number) => { if (!map.has(ts)) map.set(ts, { ts }); return map.get(ts)!; };

  const tempPts = data.metrics['temp'] ?? [];
  const normMap = computeNormalTemp(tempPts);

  for (const p of tempPts) {
    const r = ensure(p.ts);
    r.tempRaw = p.value;
    r.temp = tempToScale(p.value);
    const n = normMap.get(p.ts);
    if (n !== undefined) { r.tempNormRaw = n; r.tempNorm = tempToScale(n); }
  }
  for (const p of data.metrics['act']    ?? []) { const r = ensure(p.ts); r.actRaw = p.value; r.act = p.value * 3; }
  for (const p of data.metrics['rum']    ?? []) { const r = ensure(p.ts); r.rum    = p.value; }
  for (const p of data.metrics['estrus'] ?? []) { const r = ensure(p.ts); r.estrus = p.value; }
  for (const p of data.metrics['calving']?? []) { const r = ensure(p.ts); r.calving= p.value; }

  // 음수 — 하루 단위 step, 24시간 딜레이
  // smaXtec에서 오늘 음수량 데이터는 내일 올라오므로:
  //   - dr 데이터가 존재하는 마지막 시점까지만 표시
  //   - 그 이후(오늘) 구간은 undefined → 라인 끊김 (오늘 추정값은 KPI drinkingCount로 별도 표시)
  const drPts = [...(data.metrics['dr'] ?? [])].sort((a, b) => a.ts - b.ts);
  if (drPts.length > 0) {
    const lastDrTs = drPts[drPts.length - 1]!.ts;
    let drIdx = 0;
    const sorted = Array.from(map.values()).sort((a, b) => a.ts - b.ts);
    for (const row of sorted) {
      if (row.ts > lastDrTs) break; // 마지막 dr 데이터 이후(오늘)는 표시 안 함
      while (drIdx + 1 < drPts.length && drPts[drIdx + 1]!.ts <= row.ts) drIdx++;
      row.dr = drPts[drIdx]?.value;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.ts - b.ts);
}

/** 주야간 밴드 생성 (한국시간 UTC+9) */
function buildDayNightBands(tsMin: number, tsMax: number) {
  const OFFSET = 9 * 3600;
  const bands: Array<{ x1: number; x2: number; day: boolean }> = [];
  const dayFloor = Math.floor((tsMin + OFFSET) / 86400) * 86400 - OFFSET - 86400;
  for (let d = dayFloor; d < tsMax + 86400; d += 86400) {
    const night1S = d;                  const night1E = d + 6 * 3600;
    const dayS    = d + 6 * 3600;       const dayE    = d + 18 * 3600;
    const night2S = d + 18 * 3600;      const night2E = d + 24 * 3600;
    const clamp = (s: number, e: number, day: boolean) => {
      const cs = Math.max(s, tsMin), ce = Math.min(e, tsMax);
      if (cs < ce) bands.push({ x1: cs, x2: ce, day });
    };
    clamp(night1S, night1E, false);
    clamp(dayS, dayE, true);
    clamp(night2S, night2E, false);
  }
  return bands;
}

// ── 포맷 유틸 ──

function fmtTs(ts: number): string {
  const d = new Date(ts * 1000);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = m.toString().padStart(2, '0');
  return `${ampm} ${hh}:${mm}`;
}

function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}.`;
}

// ── 커스텀 체온(°C) 축 오버레이 ──

interface TempAxisProps {
  readonly top?: number;
  readonly left?: number;
  readonly height?: number;
  readonly margin?: { left?: number };
}

function TempAxisOverlay(props: TempAxisProps): React.JSX.Element {
  const { top = 0, left = 0, height = 300 } = props;
  // 음수 이벤트 가시화를 위해 20°C 기점 포함, 주요 임상 기준점 강조
  const ticks = [20, 24, 28, 32, 36, 40, 44];
  const domainMin = 0, domainMax = 700;
  return (
    <g>
      {ticks.map((tc) => {
        const pct = (tempToScale(tc) - domainMin) / (domainMax - domainMin);
        const y = top + height * (1 - pct);
        const isKey = tc === 36 || tc === 40; // 정상체온 범위 경계 강조
        return (
          <text key={tc} x={left + 2} y={y + 4}
            textAnchor="start"
            fill={isKey ? '#81D4FA' : C.temp}
            fontSize={isKey ? 9.5 : 8.5}
            fontWeight={isKey ? 700 : 400}>
            {tc}°C
          </text>
        );
      })}
    </g>
  );
}

// ── 커스텀 툴팁 ──

interface TTPayload { name: string; value: number | undefined; color: string; unit: string; precision: number }

function buildTooltipRows(payload: readonly { dataKey: string; value: unknown }[], point: ChartRow): TTPayload[] {
  void payload; // Recharts payload가 scaled이므로 raw 값 직접 사용
  const rows: TTPayload[] = [];
  if (point.tempRaw !== undefined)     rows.push({ name: '온도',        value: point.tempRaw,     color: C.temp,     unit: '°C',      precision: 2 });
  if (point.tempNormRaw !== undefined) rows.push({ name: '정상 체온',   value: point.tempNormRaw, color: C.tempNorm, unit: '°C',      precision: 2 });
  if (point.actRaw !== undefined)      rows.push({ name: '활동량',      value: point.actRaw,      color: C.act,      unit: '',        precision: 1 });
  if (point.estrus !== undefined)      rows.push({ name: '발정지수',    value: point.estrus,      color: C.estrus,   unit: '',        precision: 2 });
  if (point.rum !== undefined)         rows.push({ name: '반추 (min)',  value: point.rum,         color: C.rum,      unit: '/24h',    precision: 2 });
  if (point.calving !== undefined)     rows.push({ name: '분만지수',    value: point.calving,     color: C.calving,  unit: '',        precision: 0 });
  if (point.dr !== undefined)          rows.push({ name: '음수량',      value: point.dr,          color: C.dr,       unit: ' l/24h',  precision: 0 });
  return rows;
}

function CustomTooltip({ active, payload, label, chartData }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: unknown }>;
  label?: number;
  chartData: ChartRow[];
}): React.JSX.Element | null {
  if (!active || !payload?.length || label === undefined) return null;
  const point = chartData.find((r) => r.ts === label);
  if (!point) return null;
  const rows = buildTooltipRows(payload, point);

  return (
    <div style={{
      background: C.tooltip,
      border: '1px solid #555',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 11,
      color: C.text,
      minWidth: 180,
      pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, borderBottom: '1px solid #444', paddingBottom: 4, fontSize: 10, color: '#aaa' }}>
        {fmtDate(label)} {fmtTs(label)}
      </div>
      {rows.map((r) => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
          <span style={{ color: '#bbb', flex: 1 }}>{r.name}</span>
          <span style={{ fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
            {r.value !== undefined ? r.value.toFixed(r.precision) : '-'}{r.unit}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── 이벤트 마커 라벨 ──

function EventMarkerLabel({ viewBox, label }: { viewBox?: { x?: number; y?: number }; label: string }): React.JSX.Element | null {
  if (!viewBox?.x || !viewBox?.y) return null;
  return (
    <g>
      <text x={viewBox.x} y={(viewBox.y ?? 20) - 2} textAnchor="middle" fontSize={14} fill={C.event}>🐄</text>
      <text x={viewBox.x + 2} y={(viewBox.y ?? 20) + 14} textAnchor="start" fontSize={8} fill={C.event}>{label}</text>
    </g>
  );
}

// ── 뷰 모드 ──

type ViewMode = 'full' | 'rum_water';

const VIEW_LABELS: Record<ViewMode, string> = {
  full:      '전체 보기',
  rum_water: '반추 및 음수량',
};

// 시리즈 가시성 기본값
const DEFAULT_VISIBLE: Record<string, boolean> = {
  temp: true, tempNorm: true, rum: true, act: true,
  estrus: false, calving: false, dr: true,
};

// ── 메인 컴포넌트 ──

export interface SmaxtecSensorChartProps {
  readonly data: AnimalSensorChartData;
  readonly selectedEventId?: string | null;
  readonly height?: number;
}

export function SmaxtecSensorChart({ data, selectedEventId, height = 380 }: SmaxtecSensorChartProps): React.JSX.Element {
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  const [showSettings, setShowSettings] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>(DEFAULT_VISIBLE);
  const settingsRef = useRef<HTMLDivElement>(null);

  // 통합 데이터
  const chartData = useMemo(() => mergeMetrics(data), [data]);

  // 시간 범위
  const { tsMin, tsMax } = useMemo(() => {
    if (chartData.length === 0) return { tsMin: Date.now() / 1000 - 7 * 86400, tsMax: Date.now() / 1000 };
    return { tsMin: chartData[0]!.ts, tsMax: chartData[chartData.length - 1]!.ts };
  }, [chartData]);

  // 주야간 밴드
  const bands = useMemo(() => buildDayNightBands(tsMin, tsMax), [tsMin, tsMax]);

  // 뷰 모드에 따른 가시성
  const effectiveVisible = useMemo<Record<string, boolean>>(() => {
    if (viewMode === 'rum_water') {
      return { ...visible, act: false, estrus: false };
    }
    return visible;
  }, [viewMode, visible]);

  // X축 틱 — 날짜 경계 + 중간 12h
  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const OFFSET = 9 * 3600;
    const dayFloor = Math.floor((tsMin + OFFSET) / 86400) * 86400 - OFFSET;
    for (let d = dayFloor; d <= tsMax + 86400; d += 12 * 3600) {
      if (d >= tsMin && d <= tsMax) ticks.push(d);
    }
    return ticks;
  }, [tsMin, tsMax]);

  const toggleSeries = useCallback((key: string) => {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // 이벤트 마커 (이미 선택된 이벤트 강조)
  const eventMarkers: readonly SensorEventMarker[] = data.eventMarkers;

  return (
    <div style={{ position: 'relative', background: '#2D2D2D', borderRadius: 10, overflow: 'hidden', padding: '10px 0 0' }}>
      {/* ── 컨트롤 바 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 8px', flexWrap: 'wrap' }}>
        {/* 뷰 모드 */}
        <div style={{ display: 'flex', gap: 2, background: '#1a1a1a', borderRadius: 6, padding: 2 }}>
          {(Object.entries(VIEW_LABELS) as [ViewMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: 'none', cursor: 'pointer',
                background: viewMode === mode ? '#C8D530' : 'transparent',
                color: viewMode === mode ? '#111' : '#888',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* 기간 정보 */}
        <span style={{ fontSize: 9, color: '#666' }}>
          {fmtDate(tsMin)} — {fmtDate(tsMax)}
        </span>

        {/* 설정 버튼 */}
        <div ref={settingsRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => setShowSettings(!showSettings)}
            style={{ background: '#444', border: 'none', borderRadius: 4, width: 24, height: 24, cursor: 'pointer', color: '#aaa', fontSize: 13 }}>
            ⚙️
          </button>
          {showSettings && (
            <div style={{
              position: 'absolute', right: 0, top: 28, zIndex: 50,
              background: '#1a1a1a', border: '1px solid #444', borderRadius: 8,
              padding: 12, minWidth: 180,
            }}>
              {[
                { key: 'temp',     label: '온도',      color: C.temp     },
                { key: 'tempNorm', label: '정상 체온', color: C.tempNorm },
                { key: 'act',      label: '활동량',    color: C.act      },
                { key: 'estrus',   label: '발정지수',  color: C.estrus   },
                { key: 'rum',      label: '반추',      color: C.rum      },
                { key: 'calving',  label: '분만지수',  color: C.calving  },
                { key: 'dr',       label: '음수량',    color: C.dr       },
              ].map(({ key, label, color }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!visible[key]} onChange={() => toggleSeries(key)} />
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ color: C.text, fontSize: 11 }}>{label}</span>
                </label>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button type="button" onClick={() => { setVisible(DEFAULT_VISIBLE); setShowSettings(false); }}
                  style={{ flex: 1, padding: '4px 0', borderRadius: 4, background: '#333', border: '1px solid #555', color: '#aaa', fontSize: 10, cursor: 'pointer' }}>
                  RESET
                </button>
                <button type="button" onClick={() => setShowSettings(false)}
                  style={{ flex: 1, padding: '4px 0', borderRadius: 4, background: '#C8D530', border: 'none', color: '#111', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                  저장
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 차트 ── */}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 58, left: 58, bottom: 30 }}
        >
          {/* 주야간 밴드 */}
          {bands.map((b, i) => (
            <ReferenceArea
              key={i}
              x1={b.x1} x2={b.x2}
              yAxisId="lh"
              fill={b.day ? C.day : C.night}
              fillOpacity={1}
              stroke="none"
            />
          ))}

          {/* 그리드 */}
          <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />

          {/* X축 */}
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={[tsMin, tsMax]}
            ticks={xTicks}
            tickFormatter={(v) => fmtTs(v)}
            tick={{ fill: C.muted, fontSize: 9 }}
            tickLine={{ stroke: '#555' }}
            axisLine={{ stroke: '#555' }}
            label={{
              value: '',
              position: 'insideBottom',
            }}
          />

          {/* 좌측 Y축 — l/24h (활동/음수 + 체온 스케일)
              domain [0,700]: (t-20)×25 공식
                38.8°C → 470 → 67% (정상 체온, 반추 73% 아래 배치)
                30°C → 250 → 36% (음수 피크 → 31% 낙차 — W딥 명확)
                act raw×3: 0-300 → 0-43% (하단 가시화)
          */}
          <YAxis
            yAxisId="lh"
            orientation="left"
            domain={[0, 700]}
            ticks={[0, 100, 200, 300, 400, 500, 600, 700]}
            tickFormatter={(v) => `${v}`}
            tick={{ fill: C.muted, fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            width={46}
            label={{ value: 'l/24h', angle: -90, position: 'insideLeft', offset: -10, style: { fill: C.muted, fontSize: 9 } }}
          />

          {/* 우측 Y축 — 반추 (분)
              domain [0,600]: 반추 440분 → 73% (체온 67% 위에 배치 — smaXtec 레이아웃 일치)
              최대 600분: 정상 젖소 반추 상한값, 이상 시 600분 초과 가능 */}
          <YAxis
            yAxisId="rum"
            orientation="right"
            domain={[0, 600]}
            ticks={[0, 100, 200, 300, 400, 500, 600]}
            tickFormatter={(v) => `${v}`}
            tick={{ fill: C.rum, fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            width={46}
            label={{ value: '분', angle: 90, position: 'insideRight', offset: 10, style: { fill: C.rum, fontSize: 9 } }}
          />

          {/* 이벤트 마커 수직선 */}
          {eventMarkers.map((m) => {
            const mTs = new Date(m.detectedAt).getTime() / 1000;
            const isSelected = m.eventId === selectedEventId;
            return (
              <ReferenceLine
                key={m.eventId}
                x={mTs}
                yAxisId="lh"
                stroke={isSelected ? '#ff4444' : C.event}
                strokeWidth={isSelected ? 3 : 2}
                strokeDasharray={isSelected ? undefined : '4 3'}
                label={(props) => <EventMarkerLabel {...props} label={m.label} />}
              />
            );
          })}

          {/* 체온 °C 오버레이 축 레이블 */}
          <Customized component={(props: Record<string, unknown>) => {
            const { top, left, height: h } = props as { top?: number; left?: number; height?: number };
            return <TempAxisOverlay top={top} left={(left as number ?? 58) - 44} height={h} />;
          }} />

          {/* 툴팁 */}
          <Tooltip
            content={(props) => (
              <CustomTooltip
                active={props.active}
                payload={props.payload as Array<{ dataKey: string; value: unknown }>}
                label={props.label as number}
                chartData={chartData}
              />
            )}
            cursor={{ stroke: '#888', strokeWidth: 1, strokeDasharray: '4 3' }}
          />

          {/* ── 시리즈 ── */}

          {/* 활동량 — raw×3 스케일 (가시성 3배 향상) */}
          {effectiveVisible['act'] && (
            <Line yAxisId="lh" type="monotone" dataKey="act"
              stroke={C.act} strokeWidth={2.0} dot={false} isAnimationActive={false}
              connectNulls />
          )}

          {/* 발정지수 */}
          {effectiveVisible['estrus'] && (
            <Line yAxisId="lh" type="monotone" dataKey="estrus"
              stroke={C.estrus} strokeWidth={1} dot={false} isAnimationActive={false}
              connectNulls />
          )}

          {/* 음수량 — step chart */}
          {effectiveVisible['dr'] && (
            <Line yAxisId="lh" type="stepAfter" dataKey="dr"
              stroke={C.dr} strokeWidth={1.5} dot={false} isAnimationActive={false}
              connectNulls />
          )}

          {/* 분만지수 */}
          {effectiveVisible['calving'] && (
            <Line yAxisId="lh" type="monotone" dataKey="calving"
              stroke={C.calving} strokeWidth={2} dot={false} isAnimationActive={false}
              connectNulls />
          )}

          {/* 평균체온 (scaled) */}
          {effectiveVisible['tempNorm'] && (
            <Line yAxisId="lh" type="monotone" dataKey="tempNorm"
              stroke={C.tempNorm} strokeWidth={1} dot={false} isAnimationActive={false}
              strokeOpacity={0.7} connectNulls />
          )}

          {/* 체온 (scaled) */}
          {effectiveVisible['temp'] && (
            <Line yAxisId="lh" type="monotone" dataKey="temp"
              stroke={C.temp} strokeWidth={2} dot={false} isAnimationActive={false}
              connectNulls />
          )}

          {/* 반추 — 우측 축, 가장 눈에 띄는 메인 라인 */}
          {effectiveVisible['rum'] && (
            <Line yAxisId="rum" type="monotone" dataKey="rum"
              stroke={C.rum} strokeWidth={2.5} dot={false} isAnimationActive={false}
              connectNulls />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* ── 범례 ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '6px 14px 10px', borderTop: '1px solid #333' }}>
        {[
          { key: 'temp',     color: C.temp,     label: '온도 (°C)'    },
          { key: 'tempNorm', color: C.tempNorm, label: '정상 체온'    },
          { key: 'rum',      color: C.rum,       label: '반추 (min)'  },
          { key: 'act',      color: C.act,       label: '활동량'      },
          { key: 'dr',       color: C.dr,        label: '음수량'      },
          { key: 'estrus',   color: C.estrus,    label: '발정지수'    },
          { key: 'calving',  color: C.calving,   label: '분만지수'    },
        ].filter((s) => effectiveVisible[s.key]).map(({ key, color, label }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 16, height: 2, background: color, display: 'inline-block', borderRadius: 1 }} />
            <span style={{ fontSize: 9, color: '#999' }}>{label}</span>
          </div>
        ))}
        {eventMarkers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 2, height: 12, background: C.event, display: 'inline-block' }} />
            <span style={{ fontSize: 9, color: '#999' }}>알람 이벤트 ({eventMarkers.length})</span>
          </div>
        )}
      </div>
    </div>
  );
}
