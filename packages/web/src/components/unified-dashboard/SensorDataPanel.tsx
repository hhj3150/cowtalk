// 소버린 AI — 센서 데이터 차트 패널
// 전문가가 실제 센서 데이터를 보면서 현장 확인할 수 있도록 시계열 차트 제공
//
// 4개 메트릭: 체온(temp), 활동(act), 반추(rum), 음수(dr)
// SVG 기반 경량 차트 — 정상범위 강조 + 이벤트 마커 + 현재 이벤트 하이라이트

import React, { useEffect, useState, useMemo } from 'react';
import { fetchAnimalSensorChart } from '@web/api/unified-dashboard.api';
import type { AnimalSensorChartData, AnimalProfileData, SensorChartPoint, SensorEventMarker } from '@web/api/unified-dashboard.api';

// ── 상수 ──

interface MetricConfig {
  readonly key: string;
  readonly label: string;
  readonly color: string;
  readonly unit: string;
  readonly yMin: number;
  readonly yMax: number;
  readonly normalMin: number;
  readonly normalMax: number;
}

const METRICS: readonly MetricConfig[] = [
  { key: 'temp', label: '체온', color: '#ef4444', unit: '°C', yMin: 36.5, yMax: 42, normalMin: 38.0, normalMax: 39.3 },
  { key: 'act', label: '활동', color: '#3b82f6', unit: 'I/24h', yMin: 0, yMax: 500, normalMin: 0, normalMax: 300 },
  { key: 'rum', label: '반추', color: '#22c55e', unit: '분', yMin: 0, yMax: 700, normalMin: 300, normalMax: 600 },
  { key: 'dr', label: '음수', color: '#f97316', unit: 'L', yMin: 0, yMax: 200, normalMin: 40, normalMax: 120 },
];

const SEVERITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#eab308',
};

const DAY_OPTIONS: readonly { readonly value: number; readonly label: string }[] = [
  { value: 1, label: '24h' },
  { value: 3, label: '3일' },
  { value: 7, label: '7일' },
  { value: 14, label: '14일' },
];

// ── SVG 미니차트 ──

const CHART_W = 340;
const CHART_H = 100;
const PAD_L = 0;
const PAD_R = 0;
const PAD_T = 4;
const PAD_B = 16; // X축 시간 라벨 공간
const PLOT_W = CHART_W - PAD_L - PAD_R;
const PLOT_H = CHART_H - PAD_T - PAD_B;

function toX(ts: number, tsMin: number, tsMax: number): number {
  const range = tsMax - tsMin || 1;
  return PAD_L + ((ts - tsMin) / range) * PLOT_W;
}

function toY(value: number, yMin: number, yMax: number): number {
  const range = yMax - yMin || 1;
  return PAD_T + PLOT_H - ((value - yMin) / range) * PLOT_H;
}

function buildPath(
  points: readonly SensorChartPoint[],
  tsMin: number,
  tsMax: number,
  yMin: number,
  yMax: number,
): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => {
      const x = toX(p.ts, tsMin, tsMax);
      const y = toY(Math.min(Math.max(p.value, yMin), yMax), yMin, yMax);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function MiniChart({ metric, points, eventMarkers, selectedEventId, tsMin, tsMax }: {
  readonly metric: MetricConfig;
  readonly points: readonly SensorChartPoint[];
  readonly eventMarkers: readonly SensorEventMarker[];
  readonly selectedEventId: string | null;
  readonly tsMin: number;
  readonly tsMax: number;
}): React.JSX.Element {
  const hasData = points.length > 0;

  // 데이터 기반 동적 Y축 — 변동을 잘 보이게 패딩 추가
  const dynY = useMemo(() => {
    if (!hasData) return { yMin: metric.yMin, yMax: metric.yMax };
    let dataMin = Infinity;
    let dataMax = -Infinity;
    for (const p of points) {
      if (p.value < dataMin) dataMin = p.value;
      if (p.value > dataMax) dataMax = p.value;
    }
    // 정상범위도 포함
    dataMin = Math.min(dataMin, metric.normalMin);
    dataMax = Math.max(dataMax, metric.normalMax);
    // 데이터 범위에 20% 패딩
    const range = dataMax - dataMin || 1;
    const padding = range * 0.2;
    return {
      yMin: Math.max(metric.yMin, dataMin - padding),
      yMax: Math.min(metric.yMax, dataMax + padding),
    };
  }, [points, hasData, metric]);

  const effectiveYMin = dynY.yMin;
  const effectiveYMax = dynY.yMax;

  // 정상범위 rect
  const normalY1 = toY(metric.normalMax, effectiveYMin, effectiveYMax);
  const normalY2 = toY(metric.normalMin, effectiveYMin, effectiveYMax);
  const normalH = normalY2 - normalY1;

  // 최근값
  const latestValue = hasData ? points[points.length - 1]!.value : null;
  const isAbnormal = latestValue !== null &&
    (latestValue < metric.normalMin || latestValue > metric.normalMax);

  // SVG path
  const pathD = hasData ? buildPath(points, tsMin, tsMax, effectiveYMin, effectiveYMax) : '';

  // 이상치 포인트
  const abnormalPoints = points.filter(
    (p) => p.value < metric.normalMin || p.value > metric.normalMax,
  );

  // 호버 상태
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; value: number; ts: number } | null>(null);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    if (!hasData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const relX = (mouseX / rect.width) * CHART_W;

    // 가장 가까운 점 찾기
    let closest: SensorChartPoint | null = null;
    let closestDist = Infinity;
    for (const p of points) {
      const px = toX(p.ts, tsMin, tsMax);
      const dist = Math.abs(px - relX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = p;
      }
    }
    if (closest && closestDist < 20) {
      setHoverPoint({
        x: toX(closest.ts, tsMin, tsMax),
        y: toY(
          Math.min(Math.max(closest.value, effectiveYMin), effectiveYMax),
          effectiveYMin,
          effectiveYMax,
        ),
        value: closest.value,
        ts: closest.ts,
      });
    } else {
      setHoverPoint(null);
    }
  };

  return (
    <div style={{ marginBottom: 6 }}>
      {/* 라벨 행 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 3,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: 2,
            background: metric.color,
            display: 'inline-block',
          }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ct-text)' }}>
            {metric.label}
          </span>
          <span style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>
            ({metric.normalMin}–{metric.normalMax} {metric.unit})
          </span>
        </div>
        {latestValue !== null && (
          <span style={{
            fontSize: 12,
            fontWeight: 800,
            color: isAbnormal ? '#ef4444' : metric.color,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {latestValue.toFixed(1)}
            <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 2 }}>{metric.unit}</span>
          </span>
        )}
      </div>

      {/* SVG 차트 */}
      {hasData ? (
        <svg
          width="100%"
          height={CHART_H}
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          style={{ display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverPoint(null)}
        >
          {/* 정상범위 대역 */}
          <rect
            x={PAD_L}
            y={normalY1}
            width={PLOT_W}
            height={Math.max(normalH, 1)}
            fill={metric.color}
            opacity={0.06}
          />
          {/* 정상범위 경계선 */}
          <line
            x1={PAD_L} y1={normalY1}
            x2={PAD_L + PLOT_W} y2={normalY1}
            stroke={metric.color}
            strokeDasharray="3 3"
            opacity={0.2}
          />
          <line
            x1={PAD_L} y1={normalY2}
            x2={PAD_L + PLOT_W} y2={normalY2}
            stroke={metric.color}
            strokeDasharray="3 3"
            opacity={0.2}
          />

          {/* 이벤트 마커 세로선 */}
          {eventMarkers.map((m) => {
            const ts = new Date(m.detectedAt).getTime() / 1000;
            const x = toX(ts, tsMin, tsMax);
            if (x < PAD_L || x > PAD_L + PLOT_W) return null;
            const isCurrent = m.eventId === selectedEventId;
            const color = isCurrent ? '#6366f1' : (SEVERITY_COLORS[m.severity] ?? '#eab308');
            return (
              <line
                key={m.eventId}
                x1={x} y1={PAD_T}
                x2={x} y2={PAD_T + PLOT_H}
                stroke={color}
                strokeWidth={isCurrent ? 2 : 1}
                strokeDasharray={isCurrent ? '0' : '3 2'}
                opacity={isCurrent ? 0.9 : 0.4}
              />
            );
          })}

          {/* 데이터 라인 */}
          <path
            d={pathD}
            fill="none"
            stroke={metric.color}
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* 이상치 점 */}
          {abnormalPoints.map((p, i) => {
            const x = toX(p.ts, tsMin, tsMax);
            const y = toY(
              Math.min(Math.max(p.value, effectiveYMin), effectiveYMax),
              effectiveYMin,
              effectiveYMax,
            );
            return (
              <circle
                key={i}
                cx={x} cy={y}
                r={2.5}
                fill="#ef4444"
                opacity={0.8}
              />
            );
          })}

          {/* X축 시간 라벨 */}
          {(() => {
            const range = tsMax - tsMin || 1;
            const totalHours = range / 3600;
            // 적절한 틱 간격 결정
            let tickIntervalH: number;
            if (totalHours <= 24) tickIntervalH = 4;
            else if (totalHours <= 72) tickIntervalH = 12;
            else if (totalHours <= 168) tickIntervalH = 24;
            else tickIntervalH = 48;

            const tickIntervalS = tickIntervalH * 3600;
            const firstTick = Math.ceil(tsMin / tickIntervalS) * tickIntervalS;
            const ticks: number[] = [];
            for (let t = firstTick; t <= tsMax; t += tickIntervalS) {
              ticks.push(t);
            }

            // 48h 이하면 HH:mm, 그 이상이면 M/D
            const useTimeFormat = totalHours <= 48;

            return ticks.map((t) => {
              const x = toX(t, tsMin, tsMax);
              if (x < PAD_L + 15 || x > PAD_L + PLOT_W - 15) return null;
              const d = new Date(t * 1000);
              const label = useTimeFormat
                ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                : `${d.getMonth() + 1}/${d.getDate()}`;
              return (
                <g key={t}>
                  <line
                    x1={x} y1={PAD_T + PLOT_H}
                    x2={x} y2={PAD_T + PLOT_H + 3}
                    stroke="rgba(148,163,184,0.3)"
                    strokeWidth={0.8}
                  />
                  <text
                    x={x}
                    y={PAD_T + PLOT_H + 12}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize={8}
                    fontFamily="monospace"
                  >
                    {label}
                  </text>
                </g>
              );
            });
          })()}

          {/* 호버 포인트 */}
          {hoverPoint && (
            <>
              <line
                x1={hoverPoint.x} y1={PAD_T}
                x2={hoverPoint.x} y2={PAD_T + PLOT_H}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1}
              />
              <circle
                cx={hoverPoint.x}
                cy={hoverPoint.y}
                r={4}
                fill={metric.color}
                stroke="#fff"
                strokeWidth={1.5}
              />
              {/* 툴팁 */}
              <g>
                <rect
                  x={Math.min(hoverPoint.x + 6, CHART_W - 90)}
                  y={Math.max(hoverPoint.y - 28, 0)}
                  width={84}
                  height={24}
                  rx={4}
                  fill="rgba(15,23,42,0.92)"
                  stroke={metric.color}
                  strokeWidth={0.8}
                />
                <text
                  x={Math.min(hoverPoint.x + 10, CHART_W - 86)}
                  y={Math.max(hoverPoint.y - 16, 8) + 6}
                  fill="#f8fafc"
                  fontSize={9}
                  fontWeight={600}
                >
                  {hoverPoint.value.toFixed(1)} {metric.unit}
                </text>
                <text
                  x={Math.min(hoverPoint.x + 10, CHART_W - 86)}
                  y={Math.max(hoverPoint.y - 16, 8) + 17}
                  fill="#94a3b8"
                  fontSize={7.5}
                >
                  {new Date(hoverPoint.ts * 1000).toLocaleString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </text>
              </g>
            </>
          )}
        </svg>
      ) : (
        <div style={{
          height: CHART_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: 'var(--ct-text-muted)',
          background: 'rgba(0,0,0,0.1)',
          borderRadius: 6,
        }}>
          데이터 없음
        </div>
      )}
    </div>
  );
}

// ── 시간축 라벨 ──

function TimeAxis({ tsMin, tsMax }: {
  readonly tsMin: number;
  readonly tsMax: number;
}): React.JSX.Element {
  const labels = useMemo(() => {
    const rangeS = tsMax - tsMin;
    const totalHours = rangeS / 3600;
    const useTimeFormat = totalHours <= 48;
    const count = 5;
    const result: { label: string; pct: number }[] = [];
    for (let i = 0; i <= count; i++) {
      const ts = tsMin + (rangeS * i) / count;
      const d = new Date(ts * 1000);
      const label = useTimeFormat
        ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        : `${d.getMonth() + 1}/${d.getDate()}`;
      result.push({ label, pct: (i / count) * 100 });
    }
    return result;
  }, [tsMin, tsMax]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: 8.5,
      color: 'var(--ct-text-muted)',
      paddingTop: 2,
      marginBottom: 8,
    }}>
      {labels.map((l, i) => (
        <span key={i}>{l.label}</span>
      ))}
    </div>
  );
}

// ── 이벤트 마커 범례 ──

function EventLegend({ markers, selectedEventId }: {
  readonly markers: readonly SensorEventMarker[];
  readonly selectedEventId: string | null;
}): React.JSX.Element {
  if (markers.length === 0) return <></>;

  return (
    <div style={{
      marginTop: 8,
      padding: '8px 10px',
      borderRadius: 8,
      background: 'rgba(0,0,0,0.15)',
      border: '1px solid var(--ct-border)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ct-text-muted)', marginBottom: 6 }}>
        차트 이벤트 마커
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {markers.slice(0, 8).map((m) => {
          const isCurrent = m.eventId === selectedEventId;
          const color = isCurrent ? '#6366f1' : (SEVERITY_COLORS[m.severity] ?? '#eab308');
          const d = new Date(m.detectedAt);
          const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

          return (
            <div key={m.eventId} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              opacity: isCurrent ? 1 : 0.7,
            }}>
              <span style={{
                width: 10,
                height: 2,
                background: color,
                display: 'inline-block',
                borderRadius: 1,
              }} />
              <span style={{ color: 'var(--ct-text-secondary)', fontWeight: isCurrent ? 700 : 400 }}>
                {m.label}
              </span>
              <span style={{ color: 'var(--ct-text-muted)' }}>{timeStr}</span>
              {isCurrent && (
                <span style={{
                  fontSize: 8,
                  padding: '0 4px',
                  borderRadius: 3,
                  background: '#6366f122',
                  color: '#6366f1',
                  fontWeight: 700,
                }}>
                  현재
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 동물 프로필 카드 ──

const BREED_LABELS: Record<string, string> = {
  holstein: '홀스타인',
  hanwoo: '한우',
  jersey: '저지',
  angus: '앵거스',
  simmental: '짐멘탈',
};

const LACTATION_LABELS: Record<string, string> = {
  milking: '착유 중',
  dry: '건유',
  pregnant_milking: '임신 착유',
  pregnant_dry: '임신 건유',
  unknown: '미확인',
};

const PREGNANCY_RESULT_LABELS: Record<string, string> = {
  positive: '임신',
  negative: '비임신',
  inconclusive: '불확실',
  recheck: '재검필요',
};

function AnimalProfileCard({ profile, earTag }: {
  readonly profile: AnimalProfileData;
  readonly earTag: string;
}): React.JSX.Element {
  // 나이 계산
  const ageText = useMemo(() => {
    if (!profile.birthDate) return null;
    const birth = new Date(profile.birthDate);
    const now = new Date();
    const diffMs = now.getTime() - birth.getTime();
    const months = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
    const years = Math.floor(months / 12);
    const rem = months % 12;
    return years > 0 ? `${years}년 ${rem}개월` : `${months}개월`;
  }, [profile.birthDate]);

  // 최근 분만 후 경과
  const daysSinceCalving = useMemo(() => {
    if (!profile.lastCalving?.calvingDate) return null;
    const calving = new Date(profile.lastCalving.calvingDate);
    return Math.floor((Date.now() - calving.getTime()) / 86_400_000);
  }, [profile.lastCalving]);

  const isPregnant = profile.pregnancy?.result === 'positive';

  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: 10,
      background: 'rgba(0,0,0,0.15)',
      border: '1px solid var(--ct-border)',
      marginBottom: 12,
    }}>
      {/* 개체 기본정보 헤더 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 16 }}>🐄</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)' }}>
            {earTag}
          </span>
          <span style={{
            fontSize: 9,
            padding: '1px 6px',
            borderRadius: 4,
            background: isPregnant ? 'rgba(236,72,153,0.15)' : 'rgba(99,102,241,0.1)',
            color: isPregnant ? '#ec4899' : '#6366f1',
            fontWeight: 700,
          }}>
            {isPregnant ? '임신' : (LACTATION_LABELS[profile.lactationStatus] ?? profile.lactationStatus)}
          </span>
        </div>
        <span style={{
          fontSize: 10,
          color: profile.status === 'active' ? '#22c55e' : 'var(--ct-text-muted)',
          fontWeight: 600,
        }}>
          {profile.status === 'active' ? '활동' : profile.status}
        </span>
      </div>

      {/* 프로필 그리드 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '4px 12px',
        fontSize: 10,
      }}>
        <ProfileRow label="품종" value={BREED_LABELS[profile.breed] ?? profile.breed} />
        <ProfileRow label="성별" value={profile.sex === 'female' ? '암' : '수'} />
        {profile.birthDate && (
          <ProfileRow
            label="생년월일"
            value={`${profile.birthDate.slice(0, 10)}${ageText ? ` (${ageText})` : ''}`}
          />
        )}
        <ProfileRow label="산차" value={`${profile.parity}산차`} highlight={profile.parity >= 4} />
        {profile.daysInMilk !== null && profile.daysInMilk !== undefined && (
          <ProfileRow label="착유일수" value={`${profile.daysInMilk}일 (DIM)`} />
        )}
        {daysSinceCalving !== null && (
          <ProfileRow label="최근 분만" value={`${daysSinceCalving}일 전`} />
        )}
      </div>

      {/* 임신 / 번식 정보 */}
      {(profile.pregnancy ?? profile.lastBreeding) && (
        <div style={{
          marginTop: 8,
          paddingTop: 6,
          borderTop: '1px solid var(--ct-border)',
        }}>
          {profile.pregnancy && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              marginBottom: 3,
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: profile.pregnancy.result === 'positive' ? '#ec4899' : '#94a3b8',
                display: 'inline-block',
              }} />
              <span style={{ color: 'var(--ct-text-muted)' }}>임신검사:</span>
              <span style={{
                fontWeight: 700,
                color: profile.pregnancy.result === 'positive' ? '#ec4899' : 'var(--ct-text-secondary)',
              }}>
                {PREGNANCY_RESULT_LABELS[profile.pregnancy.result] ?? profile.pregnancy.result}
              </span>
              {profile.pregnancy.daysPostInsemination && (
                <span style={{ color: 'var(--ct-text-muted)' }}>
                  (수정 후 {profile.pregnancy.daysPostInsemination}일)
                </span>
              )}
              {profile.pregnancy.checkDate && (
                <span style={{ color: 'var(--ct-text-muted)' }}>
                  {new Date(profile.pregnancy.checkDate).toLocaleDateString('ko-KR')}
                </span>
              )}
            </div>
          )}
          {profile.lastBreeding && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#8b5cf6',
                display: 'inline-block',
              }} />
              <span style={{ color: 'var(--ct-text-muted)' }}>최근 수정:</span>
              <span style={{ color: 'var(--ct-text-secondary)', fontWeight: 600 }}>
                {profile.lastBreeding.type}
              </span>
              {profile.lastBreeding.semenInfo && (
                <span style={{ color: 'var(--ct-text-muted)' }}>
                  ({profile.lastBreeding.semenInfo})
                </span>
              )}
              {profile.lastBreeding.eventDate && (
                <span style={{ color: 'var(--ct-text-muted)' }}>
                  {new Date(profile.lastBreeding.eventDate).toLocaleDateString('ko-KR')}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* 분만 이력 (최근 3건) */}
      {profile.calvingHistory.length > 0 && (
        <div style={{
          marginTop: 6,
          paddingTop: 6,
          borderTop: '1px solid var(--ct-border)',
        }}>
          <div style={{ fontSize: 9, color: 'var(--ct-text-muted)', marginBottom: 3, fontWeight: 600 }}>
            분만 이력
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {profile.calvingHistory.map((c, i) => (
              <span key={i} style={{
                fontSize: 9,
                color: 'var(--ct-text-secondary)',
                padding: '1px 6px',
                borderRadius: 4,
                background: 'rgba(0,0,0,0.1)',
              }}>
                {c.calvingDate ? new Date(c.calvingDate).toLocaleDateString('ko-KR') : '?'}
                {c.calfSex ? ` (${c.calfSex === 'male' ? '♂' : '♀'})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileRow({ label, value, highlight }: {
  readonly label: string;
  readonly value: string;
  readonly highlight?: boolean;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 0' }}>
      <span style={{ color: 'var(--ct-text-muted)', minWidth: 48 }}>{label}</span>
      <span style={{
        color: highlight ? '#f97316' : 'var(--ct-text-secondary)',
        fontWeight: 600,
      }}>
        {value}
      </span>
    </div>
  );
}

// ── 메인 패널 ──

// ── 센서 데이터 텍스트 요약 생성 (AI 컨텍스트용) ──

function buildSensorSummaryText(
  data: AnimalSensorChartData,
): string {
  const lines: string[] = [];

  // 동물 프로필
  const p = data.animalProfile;
  if (p) {
    const age = p.birthDate
      ? `${Math.floor((Date.now() - new Date(p.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))}세`
      : '나이불명';
    lines.push(`[동물프로필] ${data.earTag} | ${p.breed} ${p.breedType} | ${p.sex === 'female' ? '암' : '수'} | ${age} | ${p.parity}산차 | 착유일수: ${p.daysInMilk ?? '?'}일 | 비유상태: ${p.lactationStatus} | 상태: ${p.status}`);
    if (p.pregnancy) {
      const pregResult = p.pregnancy.result === 'positive' ? '임신' : p.pregnancy.result === 'negative' ? '미임신' : p.pregnancy.result;
      lines.push(`[임신검사] ${pregResult} | 수정후 ${p.pregnancy.daysPostInsemination ?? '?'}일 | 검사일: ${p.pregnancy.checkDate ?? '?'}`);
    }
    if (p.lastBreeding) {
      lines.push(`[최근수정] ${p.lastBreeding.type} | ${p.lastBreeding.eventDate ?? '?'} | 정액: ${p.lastBreeding.semenInfo ?? '?'}`);
    }
    if (p.lastCalving?.calvingDate) {
      const daysSince = Math.floor((Date.now() - new Date(p.lastCalving.calvingDate).getTime()) / (24 * 3600 * 1000));
      lines.push(`[최근분만] ${daysSince}일 전 | 송아지: ${p.lastCalving.calfSex ?? '?'} ${p.lastCalving.calfStatus ?? ''} | 합병증: ${p.lastCalving.complications ?? '없음'}`);
    }
  }

  // 센서 데이터 요약
  for (const metric of METRICS) {
    const pts = data.metrics[metric.key] ?? [];
    if (pts.length === 0) continue;

    const values = pts.map((pt) => pt.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const latest = values[values.length - 1]!;
    const abnormalCount = values.filter(
      (v) => v < metric.normalMin || v > metric.normalMax,
    ).length;

    // 최근 24시간 추세
    const now = pts[pts.length - 1]!.ts;
    const recent24h = pts.filter((pt) => pt.ts >= now - 86400);
    const recent24hAvg = recent24h.length > 0
      ? recent24h.reduce((a, b) => a + b.value, 0) / recent24h.length
      : avg;

    lines.push(
      `[${metric.label}] 현재: ${latest.toFixed(1)}${metric.unit} | 평균: ${avg.toFixed(1)} | 최고: ${max.toFixed(1)} | 최저: ${min.toFixed(1)} | 정상범위: ${metric.normalMin}~${metric.normalMax} | 이상횟수: ${abnormalCount}건 | 24h평균: ${recent24hAvg.toFixed(1)}`,
    );
  }

  // 이벤트 마커 요약
  if (data.eventMarkers.length > 0) {
    const markerSummary = data.eventMarkers
      .slice(0, 10)
      .map((m) => `${m.label}(${m.severity}) ${new Date(m.detectedAt).toLocaleString('ko-KR')}`)
      .join('; ');
    lines.push(`[최근이벤트] ${markerSummary}`);
  }

  return lines.join('\n');
}

interface PanelProps {
  readonly animalId: string;
  readonly selectedEventId: string | null;
  readonly onDataLoaded?: (summary: string) => void;
}

export function SensorDataPanel({ animalId, selectedEventId, onDataLoaded }: PanelProps): React.JSX.Element {
  const [data, setData] = useState<AnimalSensorChartData | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAnimalSensorChart(animalId, days)
      .then((result) => {
        setData(result);
        setLoading(false);
        if (onDataLoaded) {
          onDataLoaded(buildSensorSummaryText(result));
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load sensor data');
        setLoading(false);
      });
  }, [animalId, days, onDataLoaded]);

  // 시간 범위 계산
  const { tsMin, tsMax } = useMemo(() => {
    if (!data) return { tsMin: 0, tsMax: 1 };

    let min = Infinity;
    let max = -Infinity;
    for (const points of Object.values(data.metrics)) {
      for (const p of points) {
        if (p.ts < min) min = p.ts;
        if (p.ts > max) max = p.ts;
      }
    }

    // 이벤트 마커도 시간 범위에 포함
    for (const m of data.eventMarkers) {
      const ts = new Date(m.detectedAt).getTime() / 1000;
      if (ts < min) min = ts;
      if (ts > max) max = ts;
    }

    // 데이터 없으면 지정 기간으로
    if (!isFinite(min) || !isFinite(max)) {
      const now = Date.now() / 1000;
      return { tsMin: now - days * 86400, tsMax: now };
    }

    return { tsMin: min, tsMax: max };
  }, [data, days]);

  const hasAnyData = data !== null && Object.values(data.metrics).some((pts) => pts.length > 0);

  return (
    <div style={{
      width: 380,
      borderRight: '1px solid var(--ct-border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'rgba(0,0,0,0.02)',
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--ct-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>📊</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ct-text)' }}>
            센서 데이터
          </span>
          {data && (
            <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
              {data.earTag}
            </span>
          )}
        </div>

        {/* 기간 선택 */}
        <div style={{ display: 'flex', gap: 3 }}>
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDays(opt.value)}
              style={{
                padding: '3px 8px',
                borderRadius: 5,
                border: days === opt.value
                  ? '1px solid var(--ct-primary)'
                  : '1px solid var(--ct-border)',
                background: days === opt.value ? 'rgba(0,214,126,0.1)' : 'transparent',
                color: days === opt.value ? 'var(--ct-primary)' : 'var(--ct-text-muted)',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 차트 영역 */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '12px 14px',
      }}>
        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 200,
            fontSize: 12,
            color: 'var(--ct-text-muted)',
          }}>
            센서 데이터 로딩 중...
          </div>
        )}

        {error && (
          <div style={{
            padding: '12px',
            borderRadius: 8,
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            fontSize: 11,
            color: '#ef4444',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* 동물 프로필 카드 */}
            {data.animalProfile && (
              <AnimalProfileCard
                profile={data.animalProfile}
                earTag={data.earTag}
              />
            )}

            {/* 메트릭 차트들 */}
            {METRICS.map((metric) => (
              <MiniChart
                key={metric.key}
                metric={metric}
                points={data.metrics[metric.key] ?? []}
                eventMarkers={data.eventMarkers}
                selectedEventId={selectedEventId}
                tsMin={tsMin}
                tsMax={tsMax}
              />
            ))}

            {/* 공통 시간축 */}
            {hasAnyData && <TimeAxis tsMin={tsMin} tsMax={tsMax} />}

            {/* 이벤트 범례 */}
            <EventLegend
              markers={data.eventMarkers}
              selectedEventId={selectedEventId}
            />

            {/* 데이터 없을 때 안내 */}
            {!hasAnyData && (
              <div style={{
                padding: '30px 16px',
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--ct-text-muted)',
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>센서 데이터가 아직 없습니다</div>
                <div style={{ fontSize: 10 }}>
                  smaXtec 볼루스가 연동되면 체온·활동·반추·음수 데이터가 표시됩니다.
                </div>
              </div>
            )}

            {/* 데이터 요약 카드 */}
            {hasAnyData && (
              <div style={{
                marginTop: 10,
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.15)',
              }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#6366f1',
                  marginBottom: 6,
                }}>
                  AI 분석 참고 요약
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                }}>
                  {METRICS.map((metric) => {
                    const pts = data.metrics[metric.key] ?? [];
                    if (pts.length === 0) return null;

                    const values = pts.map((p) => p.value);
                    const avg = values.reduce((a, b) => a + b, 0) / values.length;
                    const max = Math.max(...values);
                    const min = Math.min(...values);
                    const abnormalCount = values.filter(
                      (v) => v < metric.normalMin || v > metric.normalMax,
                    ).length;

                    return (
                      <div key={metric.key} style={{
                        padding: '6px 8px',
                        borderRadius: 6,
                        background: 'rgba(0,0,0,0.1)',
                      }}>
                        <div style={{
                          fontSize: 9,
                          color: metric.color,
                          fontWeight: 700,
                          marginBottom: 3,
                        }}>
                          {metric.label}
                        </div>
                        <div style={{
                          fontSize: 9,
                          color: 'var(--ct-text-muted)',
                          lineHeight: 1.6,
                        }}>
                          평균 {avg.toFixed(1)} | 최고 {max.toFixed(1)} | 최저 {min.toFixed(1)}
                          {abnormalCount > 0 && (
                            <span style={{ color: '#ef4444', fontWeight: 600 }}>
                              {' '}| 이상 {abnormalCount}건
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
