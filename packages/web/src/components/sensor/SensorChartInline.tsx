// 개체 프로필 임베디드 센서 차트 — SmaxtecSensorChart 통합 래퍼
// 4개 별도 패널(구버전) → smaXtec 스타일 통합 차트로 교체
// 어제 vs 오늘 센서 비교 토글 추가

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { fetchAnimalSensorChart } from '@web/api/unified-dashboard.api';
import type { SensorChartPoint } from '@web/api/unified-dashboard.api';
import { SmaxtecSensorChart } from '@web/components/unified-dashboard/SmaxtecSensorChart';
import { useIsMobile } from '@web/hooks/useIsMobile';

interface Props {
  readonly animalId: string;
}

const PERIOD_OPTIONS = [
  { label: '일', days: 2 },
  { label: '주', days: 7 },
  { label: '월', days: 30 },
] as const;

// ── 어제 vs 오늘 비교 차트 ──────────────────────────

interface HourPoint {
  hour: number;       // 0-23
  label: string;      // "00시"
  today?: number;
  yesterday?: number;
}

function buildComparisonSeries(pts: readonly SensorChartPoint[]): HourPoint[] {
  const todayStr = new Date().toISOString().slice(0, 10);
  const yestD = new Date();
  yestD.setDate(yestD.getDate() - 1);
  const yestStr = yestD.toISOString().slice(0, 10);

  // hour → avg buckets
  const todayBuckets = new Map<number, number[]>();
  const yestBuckets  = new Map<number, number[]>();

  for (const pt of pts) {
    const d = new Date(pt.ts * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    const h = d.getHours();
    if (dateStr === todayStr) {
      if (!todayBuckets.has(h)) todayBuckets.set(h, []);
      todayBuckets.get(h)!.push(pt.value);
    } else if (dateStr === yestStr) {
      if (!yestBuckets.has(h)) yestBuckets.set(h, []);
      yestBuckets.get(h)!.push(pt.value);
    }
  }

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

  const result: HourPoint[] = [];
  for (let h = 0; h < 24; h++) {
    const tb = todayBuckets.get(h);
    const yb = yestBuckets.get(h);
    result.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      today:     tb && tb.length > 0 ? Math.round(avg(tb) * 10) / 10 : undefined,
      yesterday: yb && yb.length > 0 ? Math.round(avg(yb) * 10) / 10 : undefined,
    });
  }
  return result;
}

interface ComparisonPanelProps {
  readonly animalId: string;
  readonly isMobile: boolean;
}

function ComparisonPanel({ animalId, isMobile }: ComparisonPanelProps): React.JSX.Element {
  const [metric, setMetric] = useState<'temp' | 'act'>('temp');

  const { data, isLoading } = useQuery({
    queryKey: ['sensor-chart-inline', animalId, 2],
    queryFn: () => fetchAnimalSensorChart(animalId, 2),
    staleTime: 5 * 60 * 1000,
  });

  const series = useMemo(() => {
    const pts = data?.metrics[metric] ?? [];
    return buildComparisonSeries(pts);
  }, [data, metric]);

  const hasToday = series.some((p) => p.today !== undefined);
  const hasYest  = series.some((p) => p.yesterday !== undefined);

  const metricLabel = metric === 'temp' ? '체온 (°C)' : '활동량';
  const domain = metric === 'temp' ? [37, 40] : undefined;

  return (
    <div style={{ marginTop: 10 }}>
      {/* 메트릭 선택 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginRight: 4 }}>비교 지표:</span>
        {([
          { key: 'temp', label: '🌡️ 체온' },
          { key: 'act',  label: '🏃 활동량' },
        ] as const).map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            style={{
              padding: '3px 8px',
              borderRadius: 5,
              border: metric === m.key ? '1.5px solid var(--ct-primary)' : '1px solid var(--ct-border)',
              background: metric === m.key ? 'rgba(0,214,126,0.12)' : 'transparent',
              color: metric === m.key ? 'var(--ct-primary)' : 'var(--ct-text-muted)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: metric === m.key ? 700 : 400,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 범례 */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 6 }}>
        {hasToday && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ct-text-muted)' }}>
            <div style={{ width: 24, height: 2, background: '#4A90D9', borderRadius: 1 }} />
            오늘
          </div>
        )}
        {hasYest && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ct-text-muted)' }}>
            <div style={{ width: 24, height: 2, background: '#94a3b8', borderRadius: 1, borderTop: '1px dashed #94a3b8' }} />
            어제
          </div>
        )}
      </div>

      {isLoading && (
        <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--ct-text-muted)' }}>
          비교 데이터 로딩 중...
        </div>
      )}

      {!isLoading && !hasToday && !hasYest && (
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--ct-text-muted)' }}>
          비교 데이터 없음
        </div>
      )}

      {!isLoading && (hasToday || hasYest) && (
        <ResponsiveContainer width="100%" height={isMobile ? 140 : 180}>
          <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#888' }}
              interval={5}
              tickLine={false}
            />
            <YAxis
              domain={domain}
              tick={{ fontSize: 9, fill: '#888' }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              contentStyle={{ background: 'rgba(33,33,33,0.93)', border: 'none', borderRadius: 6, fontSize: 11, color: '#eee' }}
              labelStyle={{ color: '#aaa', marginBottom: 4 }}
              formatter={(v: number, name: string) => [
                metric === 'temp' ? `${v}°C` : String(v),
                name === 'today' ? '오늘' : '어제',
              ]}
            />
            {hasToday && (
              <Line
                type="monotone"
                dataKey="today"
                stroke="#4A90D9"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                name="today"
              />
            )}
            {hasYest && (
              <Line
                type="monotone"
                dataKey="yesterday"
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
                name="yesterday"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}

      <p style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 4 }}>
        {metricLabel} 시간대별 평균 · 점선=어제, 실선=오늘
      </p>
    </div>
  );
}

// ── 메인 컴포넌트 ──────────────────────────────────

export function SensorChartInline({ animalId }: Props): React.JSX.Element {
  const [days, setDays] = useState(7);
  const [showComparison, setShowComparison] = useState(false);
  const isMobile = useIsMobile();
  const chartHeight = isMobile ? 280 : 420;

  const { data, isLoading, error } = useQuery({
    queryKey: ['sensor-chart-inline', animalId, days],
    queryFn: () => fetchAnimalSensorChart(animalId, days),
    staleTime: 5 * 60 * 1000,
  });

  const hasSimulated = (data?.simulatedMetrics?.length ?? 0) > 0;

  return (
    <div style={{
      background: 'var(--ct-card)',
      border: '1px solid var(--ct-border)',
      borderRadius: 10,
      padding: '12px 14px',
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📊</span>
          <span>센서 데이터</span>
          {hasSimulated && (
            <span style={{
              fontSize: 9, fontWeight: 600,
              background: 'rgba(245,158,11,0.15)',
              color: '#b45309',
              padding: '1px 5px', borderRadius: 4,
              border: '1px solid rgba(245,158,11,0.3)',
            }}>
              추정치 포함
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* 어제 비교 토글 */}
          <button
            type="button"
            onClick={() => setShowComparison((v) => !v)}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: showComparison ? '1.5px solid #f97316' : '1px solid var(--ct-border)',
              background: showComparison ? 'rgba(249,115,22,0.12)' : 'transparent',
              color: showComparison ? '#f97316' : 'var(--ct-text-muted)',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: showComparison ? 700 : 400,
              marginRight: 4,
            }}
          >
            어제 비교
          </button>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setDays(opt.days)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: days === opt.days
                  ? '1.5px solid var(--ct-primary)'
                  : '1px solid var(--ct-border)',
                background: days === opt.days ? 'rgba(0,214,126,0.12)' : 'transparent',
                color: days === opt.days ? 'var(--ct-primary)' : 'var(--ct-text-muted)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: days === opt.days ? 700 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 어제 vs 오늘 비교 패널 */}
      {showComparison && (
        <div style={{
          marginBottom: 12,
          padding: '10px 12px',
          borderRadius: 8,
          background: 'rgba(249,115,22,0.05)',
          border: '1px solid rgba(249,115,22,0.2)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316', marginBottom: 4 }}>
            📈 어제 vs 오늘 행동 비교
          </div>
          <ComparisonPanel animalId={animalId} isMobile={isMobile} />
        </div>
      )}

      {/* 차트 영역 */}
      {isLoading && (
        <div style={{
          height: chartHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ct-text-muted)',
          fontSize: 12,
        }}>
          센서 데이터 로딩 중...
        </div>
      )}
      {error && (
        <div style={{
          height: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ef4444',
          fontSize: 12,
        }}>
          센서 데이터를 불러올 수 없습니다
        </div>
      )}
      {data && (
        <SmaxtecSensorChart data={data} height={chartHeight} />
      )}
      {!isLoading && !error && !data && (
        <div style={{
          height: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ct-text-muted)',
          fontSize: 12,
        }}>
          데이터 없음
        </div>
      )}
    </div>
  );
}
