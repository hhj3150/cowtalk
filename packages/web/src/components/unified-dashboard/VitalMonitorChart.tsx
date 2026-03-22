// 체온 + 반추 정밀 모니터링 차트 — 전염성 질병 조기경보 핵심
// Dual-axis 동적 차트: 체온(좌) + 반추(우) + 이상치 + 이벤트 마커

import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Brush,
} from 'recharts';
import type {
  VitalMonitorData,
  VitalSummary,
  VitalAnomaly,
} from '@cowtalk/shared';

// ── Props ──

interface Props {
  readonly data: VitalMonitorData;
  readonly onAnimalClick?: (animalId: string) => void;
}

// ── 상수 ──

const PERIOD_OPTIONS: readonly { readonly value: number; readonly label: string }[] = [
  { value: 7, label: '7일' },
  { value: 14, label: '14일' },
  { value: 30, label: '30일' },
];

const RISK_CONFIG: Readonly<Record<string, { readonly color: string; readonly label: string; readonly icon: string }>> = {
  normal: { color: '#22c55e', label: '정상', icon: '\u2705' },
  caution: { color: '#eab308', label: '주의', icon: '\u26A0\uFE0F' },
  warning: { color: '#f97316', label: '경고', icon: '\uD83D\uDFE0' },
  critical: { color: '#ef4444', label: '위험', icon: '\uD83D\uDD34' },
};

const TREND_ICONS: Readonly<Record<string, string>> = {
  rising: '\u2191',
  falling: '\u2193',
  stable: '\u2192',
};

const TOOLTIP_STYLE = {
  backgroundColor: '#111920',
  border: '1px solid #1e2a38',
  borderRadius: '12px',
  padding: '12px 16px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  fontSize: '12px',
} as const;

// ── 유틸 ──

function formatDate(val: string): string {
  const d = new Date(val);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateFull(val: string): string {
  const d = new Date(val);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// ── 커스텀 툴팁 ──

function VitalTooltip({ active, payload, label }: {
  readonly active?: boolean;
  readonly payload?: readonly { readonly dataKey: string; readonly value: number; readonly color: string }[];
  readonly label?: string;
}): React.JSX.Element | null {
  if (!active || !payload?.length || !label) return null;

  const tempAvg = payload.find((p) => p.dataKey === 'tempAvg');
  const rumAvg = payload.find((p) => p.dataKey === 'rumAvg');
  const eventCount = payload.find((p) => p.dataKey === 'eventCount');

  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>{formatDateFull(label)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tempAvg && tempAvg.value > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f87171', flexShrink: 0 }} />
            <span style={{ color: '#e2e8f0' }}>
              체온 편차: <b style={{ color: '#f87171' }}>{tempAvg.value.toFixed(2)}</b>
            </span>
          </div>
        )}
        {rumAvg && rumAvg.value > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#38bdf8', flexShrink: 0 }} />
            <span style={{ color: '#e2e8f0' }}>
              반추 감소: <b style={{ color: '#38bdf8' }}>{rumAvg.value.toFixed(1)}분</b>
            </span>
          </div>
        )}
        {eventCount && eventCount.value > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#a78bfa40', flexShrink: 0 }} />
            <span style={{ color: '#94a3b8' }}>
              이벤트: <b>{eventCount.value}건</b>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 서머리 카드 ──

function SummaryCards({ summary }: { readonly summary: VitalSummary }): React.JSX.Element {
  const risk = RISK_CONFIG[summary.riskLevel] ?? { color: '#22c55e', label: '정상', icon: '\u2705' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
      <StatCard
        label="위험 등급"
        value={risk.label}
        icon={risk.icon}
        accentColor={risk.color}
        glow
      />
      <StatCard
        label="체온 편차 (7일)"
        value={summary.avgTemp > 0 ? summary.avgTemp.toFixed(2) : '-'}
        sub={`${TREND_ICONS[summary.tempTrend] ?? ''} ${summary.tempTrend === 'rising' ? '상승' : summary.tempTrend === 'falling' ? '하강' : '안정'}`}
        accentColor="#f87171"
      />
      <StatCard
        label="반추 감소 (7일)"
        value={summary.avgRumination > 0 ? `${summary.avgRumination.toFixed(0)}분` : '-'}
        sub={`${TREND_ICONS[summary.ruminationTrend] ?? ''} ${summary.ruminationTrend === 'rising' ? '증가' : summary.ruminationTrend === 'falling' ? '감소' : '안정'}`}
        accentColor="#38bdf8"
      />
      <StatCard
        label="이상 개체"
        value={String(summary.totalAnomalies)}
        sub={`${summary.criticalAnomalies}건 긴급`}
        accentColor="#f59e0b"
      />
      <StatCard
        label="AI 정확도"
        value="학습 중"
        sub="레이블 축적 필요"
        accentColor="#a78bfa"
      />
    </div>
  );
}

function StatCard({ label, value, sub, icon, accentColor, glow }: {
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
  readonly icon?: string;
  readonly accentColor: string;
  readonly glow?: boolean;
}): React.JSX.Element {
  return (
    <div
      style={{
        backgroundColor: '#111920',
        border: '1px solid #1e2a38',
        borderRadius: 12,
        padding: '12px 14px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: glow ? `0 0 20px ${accentColor}30` : undefined,
      }}
    >
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${accentColor}, transparent)`,
      }} />
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        <span style={{ fontSize: 22, fontWeight: 700, color: accentColor, lineHeight: 1 }}>{value}</span>
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

// ── 이상 개체 테이블 ──

function AnomalyTable({ anomalies, onAnimalClick }: {
  readonly anomalies: readonly VitalAnomaly[];
  readonly onAnimalClick?: (animalId: string) => void;
}): React.JSX.Element {
  if (anomalies.length === 0) {
    return (
      <div style={{ color: '#64748b', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>
        이상 개체가 감지되지 않았습니다
      </div>
    );
  }

  const top10 = anomalies.slice(0, 10);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {'\uD83D\uDD25'} 이상 개체 Top {top10.length}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 6,
      }}>
        {top10.map((a, i) => (
          <button
            key={`${a.animalId}-${a.date}-${i}`}
            type="button"
            onClick={() => onAnimalClick?.(a.animalId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 8,
              border: `1px solid ${a.severity === 'critical' ? '#ef444440' : '#eab30840'}`,
              backgroundColor: a.severity === 'critical' ? '#ef444410' : '#eab30810',
              cursor: onAnimalClick ? 'pointer' : 'default',
              textAlign: 'left',
              transition: 'transform 0.15s',
            }}
          >
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              backgroundColor: a.severity === 'critical' ? '#ef4444' : '#eab308',
            }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0' }}>
                {a.earTag}
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                {a.metric === 'temp' ? '체온' : '반추'} {a.value.toFixed(1)} (z={a.deviation.toFixed(1)})
              </div>
            </div>
            <span style={{ fontSize: 10, color: '#64748b' }}>{a.date.slice(5)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 커스텀 Legend ──

function ChartLegend(): React.JSX.Element {
  const items = [
    { color: '#f87171', label: '체온 편차', type: 'line' as const },
    { color: '#f8717130', label: '체온 범위', type: 'area' as const },
    { color: '#38bdf8', label: '반추 감소', type: 'line' as const },
    { color: '#a78bfa40', label: '이벤트 수', type: 'bar' as const },
  ];

  return (
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 8 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {item.type === 'line' ? (
            <div style={{ width: 16, height: 2, backgroundColor: item.color, borderRadius: 1 }} />
          ) : item.type === 'area' ? (
            <div style={{ width: 12, height: 8, backgroundColor: item.color, borderRadius: 2 }} />
          ) : (
            <div style={{ width: 8, height: 10, backgroundColor: item.color, borderRadius: 1 }} />
          )}
          <span style={{ fontSize: 10, color: '#64748b' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── 메인 컴포넌트 ──

export function VitalMonitorChart({ data, onAnimalClick }: Props): React.JSX.Element {
  const [selectedPeriod, setSelectedPeriod] = useState(30);

  // 타임라인 데이터를 차트 포맷으로 변환
  const chartData = useMemo(() => {
    if (!data.timeline || data.timeline.length === 0) return [];
    const sliced = data.timeline.slice(-selectedPeriod);
    return sliced.map((point) => ({
      date: point.date,
      tempAvg: point.temp.avg,
      tempMin: point.temp.min,
      tempMax: point.temp.max,
      tempRange: [point.temp.min, point.temp.max] as [number, number],
      rumAvg: point.rumination.avg,
      rumMin: point.rumination.min,
      rumMax: point.rumination.max,
      eventCount: point.eventCount,
    }));
  }, [data.timeline, selectedPeriod]);

  // 유효 데이터만 필터 (값이 0인 날은 데이터 없음)
  const hasData = chartData.some((d) => d.tempAvg > 0 || d.rumAvg > 0);

  return (
    <div
      style={{
        backgroundColor: '#0d1117',
        border: '1px solid #1e2a38',
        borderRadius: 16,
        padding: 20,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 상단 글로우 효과 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: 'linear-gradient(90deg, #f87171, #38bdf8, #a78bfa)',
        opacity: 0.7,
      }} />

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #f8717120, #38bdf820)',
            fontSize: 18,
          }}>
            {'\uD83C\uDF21\uFE0F'}
          </span>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
              체온 · 반추 정밀 모니터링
            </h3>
            <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>
              {data.farmName ?? '전체 농장'} — 전염성 질병 조기경보 핵심 지표
            </p>
          </div>
        </div>

        {/* 기간 선택 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedPeriod(opt.value)}
              style={{
                padding: '4px 12px',
                borderRadius: 8,
                border: `1px solid ${selectedPeriod === opt.value ? '#38bdf840' : '#1e2a38'}`,
                backgroundColor: selectedPeriod === opt.value ? '#38bdf815' : 'transparent',
                color: selectedPeriod === opt.value ? '#38bdf8' : '#64748b',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 서머리 카드 */}
      <SummaryCards summary={data.summary} />

      {/* 차트 */}
      {hasData ? (
        <>
          <ChartLegend />
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="vitalTempGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="vitalRumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="vitalBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.1} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3860" vertical={false} />

              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: '#475569' }}
                stroke="#1e2a38"
                axisLine={{ stroke: '#1e2a38' }}
                tickLine={false}
              />

              {/* 좌측 Y축: 체온 편차 */}
              <YAxis
                yAxisId="temp"
                orientation="left"
                tick={{ fontSize: 10, fill: '#f8717190' }}
                stroke="#1e2a38"
                axisLine={false}
                tickLine={false}
                label={{
                  value: '체온 편차',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 10, fill: '#f8717180' },
                  offset: 10,
                }}
              />

              {/* 우측 Y축: 반추 감소분 */}
              <YAxis
                yAxisId="rum"
                orientation="right"
                tick={{ fontSize: 10, fill: '#38bdf890' }}
                stroke="#1e2a38"
                axisLine={false}
                tickLine={false}
                label={{
                  value: '반추 (분)',
                  angle: 90,
                  position: 'insideRight',
                  style: { fontSize: 10, fill: '#38bdf880' },
                  offset: 10,
                }}
              />

              <Tooltip content={<VitalTooltip />} />

              {/* 이벤트 수 (바 차트, 배경) */}
              <Bar
                yAxisId="temp"
                dataKey="eventCount"
                fill="url(#vitalBarGrad)"
                radius={[3, 3, 0, 0]}
                maxBarSize={12}
                opacity={0.6}
              />

              {/* 체온 편차 영역 */}
              <Area
                yAxisId="temp"
                type="monotone"
                dataKey="tempAvg"
                stroke="transparent"
                fill="url(#vitalTempGrad)"
                connectNulls
              />

              {/* 체온 편차 라인 */}
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="tempAvg"
                stroke="#f87171"
                strokeWidth={2.5}
                dot={false}
                activeDot={{
                  r: 5,
                  stroke: '#f87171',
                  strokeWidth: 2,
                  fill: '#0d1117',
                }}
                connectNulls
              />

              {/* 반추 감소 영역 */}
              <Area
                yAxisId="rum"
                type="monotone"
                dataKey="rumAvg"
                stroke="transparent"
                fill="url(#vitalRumGrad)"
                connectNulls
              />

              {/* 반추 감소 라인 */}
              <Line
                yAxisId="rum"
                type="monotone"
                dataKey="rumAvg"
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={false}
                activeDot={{
                  r: 5,
                  stroke: '#38bdf8',
                  strokeWidth: 2,
                  fill: '#0d1117',
                }}
                strokeDasharray="6 3"
                connectNulls
              />

              {/* 경고 기준선 */}
              <ReferenceLine
                yAxisId="temp"
                y={1.0}
                stroke="#f8717140"
                strokeDasharray="4 4"
                label={{
                  value: '체온 경고',
                  position: 'insideTopLeft',
                  fontSize: 9,
                  fill: '#f8717160',
                }}
              />

              <ReferenceLine
                yAxisId="rum"
                y={55}
                stroke="#38bdf840"
                strokeDasharray="4 4"
                label={{
                  value: '반추 경고',
                  position: 'insideTopRight',
                  fontSize: 9,
                  fill: '#38bdf860',
                }}
              />

              {/* 브러시 (줌) */}
              {chartData.length > 14 && (
                <Brush
                  dataKey="date"
                  height={24}
                  stroke="#1e2a38"
                  fill="#0d1117"
                  tickFormatter={formatDate}
                  travellerWidth={8}
                >
                  <ComposedChart>
                    <Line
                      type="monotone"
                      dataKey="tempAvg"
                      stroke="#f8717160"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="rumAvg"
                      stroke="#38bdf860"
                      dot={false}
                    />
                  </ComposedChart>
                </Brush>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </>
      ) : (
        <div style={{
          height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#475569', fontSize: 13,
        }}>
          센서 데이터를 불러오는 중...
        </div>
      )}

      {/* 이상 개체 테이블 */}
      <AnomalyTable anomalies={data.anomalies ?? []} onAnimalClick={onAnimalClick} />
    </div>
  );
}
