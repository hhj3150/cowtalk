// 농장 건강 스코어 위젯 — Top-10 worst health farms with breakdown

import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell,
} from 'recharts';

// ── 타입 ──

interface FactorDetail {
  readonly score: number;
  readonly max: number;
  readonly alarmRate?: number;
  readonly trend?: string;
  readonly clusterRisk?: string;
}

interface FarmFactors {
  readonly temperature: FactorDetail;
  readonly rumination: FactorDetail;
  readonly activity: FactorDetail;
  readonly historical: FactorDetail;
  readonly epidemiological: FactorDetail;
}

export interface FarmHealthScore {
  readonly farmId: string;
  readonly name: string;
  readonly headCount: number;
  readonly healthScore: number;
  readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
  readonly factors: FarmFactors;
  readonly trend: 'improving' | 'stable' | 'declining';
  readonly prediction24h: 'safe' | 'watch' | 'alert' | 'danger';
}

interface Props {
  readonly scores: readonly FarmHealthScore[];
  readonly onFarmClick?: (farmId: string) => void;
}

// ── 상수 ──

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#3b82f6',
  C: '#eab308',
  D: '#f97316',
  F: '#ef4444',
};

const TREND_ICONS: Record<string, string> = {
  improving: '↗',
  stable: '→',
  declining: '↘',
};

const TREND_COLORS: Record<string, string> = {
  improving: '#22c55e',
  stable: '#eab308',
  declining: '#ef4444',
};

const TREND_LABELS: Record<string, string> = {
  improving: '개선',
  stable: '유지',
  declining: '악화',
};

const PREDICTION_LABELS: Record<string, string> = {
  safe: '안전',
  watch: '관찰',
  alert: '주의',
  danger: '위험',
};

const PREDICTION_COLORS: Record<string, string> = {
  safe: '#22c55e',
  watch: '#eab308',
  alert: '#f97316',
  danger: '#ef4444',
};

const FACTOR_LABELS: Record<string, string> = {
  temperature: '체온',
  rumination: '반추',
  activity: '활동',
  historical: '이력',
  epidemiological: '역학',
};

const FACTOR_COLORS: readonly string[] = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6'];

// ── 유틸 ──

function getGradeColor(grade: string): string {
  return GRADE_COLORS[grade] ?? '#94a3b8';
}

// ── 점수 배지 ──

function ScoreBadge({ score, grade }: {
  readonly score: number;
  readonly grade: string;
}): React.JSX.Element {
  const color = getGradeColor(grade);

  return (
    <div style={{
      width: 42,
      height: 42,
      borderRadius: '50%',
      border: `2.5px solid ${color}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      background: `${color}11`,
    }}>
      <span style={{ fontSize: 14, fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </span>
      <span style={{ fontSize: 8, fontWeight: 700, color, lineHeight: 1, marginTop: 1 }}>
        {grade}
      </span>
    </div>
  );
}

// ── 팩터 브레이크다운 ──

function FactorBreakdown({ factors }: {
  readonly factors: FarmFactors;
}): React.JSX.Element {
  const factorKeys = ['temperature', 'rumination', 'activity', 'historical', 'epidemiological'] as const;

  const chartData = factorKeys.map((key) => ({
    name: FACTOR_LABELS[key],
    score: factors[key].score,
    max: factors[key].max,
    pct: factors[key].max > 0 ? (factors[key].score / factors[key].max) * 100 : 0,
  }));

  return (
    <div style={{ padding: '8px 0 4px' }}>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 36, right: 12, top: 4, bottom: 4 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--ct-text-muted)' }} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 10, fill: 'var(--ct-text-secondary)' }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} animationDuration={800} barSize={14}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={FACTOR_COLORS[i]} fillOpacity={0.75} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* 상세 수치 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 4 }}>
        {factorKeys.map((key, i) => {
          const f = factors[key];
          return (
            <div key={key} style={{ fontSize: 10, color: 'var(--ct-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: FACTOR_COLORS[i], display: 'inline-block' }} />
              {FACTOR_LABELS[key]}: <span style={{ color: 'var(--ct-text-secondary)', fontWeight: 600 }}>{f.score}/{f.max}</span>
              {'alarmRate' in f && f.alarmRate !== undefined && (
                <span style={{ color: f.alarmRate > 0.1 ? '#ef4444' : 'var(--ct-text-muted)' }}>
                  ({(f.alarmRate * 100).toFixed(0)}%)
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 농장 행 ──

function FarmRow({
  farm,
  rank,
  onClick,
}: {
  readonly farm: FarmHealthScore;
  readonly rank: number;
  readonly onClick?: () => void;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const trendColor = TREND_COLORS[farm.trend] ?? '#94a3b8';
  const predColor = PREDICTION_COLORS[farm.prediction24h] ?? '#94a3b8';

  return (
    <div style={{
      borderRadius: 10,
      background: expanded ? 'rgba(0,0,0,0.15)' : 'transparent',
      transition: 'background 0.2s',
    }}>
      <button
        type="button"
        onClick={() => {
          setExpanded((prev) => !prev);
          if (onClick) onClick();
        }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {/* 순위 */}
        <span style={{
          width: 22,
          fontSize: 12,
          fontWeight: 800,
          color: rank <= 3 ? '#ef4444' : 'var(--ct-text-muted)',
          textAlign: 'center',
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {rank}
        </span>

        {/* 점수 배지 */}
        <ScoreBadge score={farm.healthScore} grade={farm.grade} />

        {/* 농장명 + 두수 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ct-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {farm.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 2 }}>
            {farm.headCount}두
          </div>
        </div>

        {/* 추세 */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 14, color: trendColor, fontWeight: 700 }}>
            {TREND_ICONS[farm.trend]}
          </div>
          <div style={{ fontSize: 9, color: trendColor }}>
            {TREND_LABELS[farm.trend]}
          </div>
        </div>

        {/* 24시간 예측 */}
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          padding: '3px 8px',
          borderRadius: 6,
          background: `${predColor}22`,
          color: predColor,
          border: `1px solid ${predColor}33`,
          flexShrink: 0,
        }}>
          {PREDICTION_LABELS[farm.prediction24h]}
        </span>
      </button>

      {/* 확장: 팩터 브레이크다운 */}
      {expanded && (
        <div style={{ padding: '0 12px 12px 46px' }}>
          <FactorBreakdown factors={farm.factors} />
        </div>
      )}
    </div>
  );
}

// ── 미니 히스토그램 ──

function ScoreHistogram({ scores }: {
  readonly scores: readonly FarmHealthScore[];
}): React.JSX.Element {
  const buckets = useMemo(() => {
    const bins = [
      { label: '0-39', min: 0, max: 39, count: 0, color: '#ef4444' },
      { label: '40-59', min: 40, max: 59, count: 0, color: '#f97316' },
      { label: '60-74', min: 60, max: 74, count: 0, color: '#eab308' },
      { label: '75-89', min: 75, max: 89, count: 0, color: '#3b82f6' },
      { label: '90+', min: 90, max: 100, count: 0, color: '#22c55e' },
    ];

    return bins.map((bin) => ({
      ...bin,
      count: scores.filter((s) => s.healthScore >= bin.min && s.healthScore <= bin.max).length,
    }));
  }, [scores]);

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 36 }}>
      {buckets.map((b) => (
        <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div
            style={{
              width: '100%',
              height: maxCount > 0 ? Math.max((b.count / maxCount) * 28, 2) : 2,
              background: b.color,
              borderRadius: 2,
              opacity: 0.7,
              transition: 'height 0.3s ease',
            }}
          />
          <span style={{ fontSize: 8, color: 'var(--ct-text-muted)' }}>{b.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── 메인 컴포넌트 ──

export function FarmHealthScoreWidget({ scores, onFarmClick }: Props): React.JSX.Element {
  const sorted = useMemo(
    () => [...scores].sort((a, b) => a.healthScore - b.healthScore).slice(0, 10),
    [scores],
  );

  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.healthScore, 0) / scores.length)
    : 0;

  const avgGrade = avgScore >= 90 ? 'A' : avgScore >= 75 ? 'B' : avgScore >= 60 ? 'C' : avgScore >= 40 ? 'D' : 'F';
  const avgColor = getGradeColor(avgGrade);

  return (
    <div
      className="ct-fade-up"
      style={{
        background: 'var(--ct-card)',
        borderRadius: 14,
        border: '1px solid var(--ct-border)',
        padding: '18px 16px 14px',
      }}
    >
      {/* 헤더 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
        paddingBottom: 10,
        borderBottom: '1px solid var(--ct-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🏥</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ct-text)' }}>농장 건강 스코어</span>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '4px 10px',
          borderRadius: 8,
          background: `${avgColor}22`,
          color: avgColor,
          border: `1px solid ${avgColor}33`,
        }}>
          평균 {avgScore}점 ({avgGrade})
        </span>
      </div>

      {/* 농장 리스트 */}
      {sorted.length === 0 ? (
        <div style={{ color: 'var(--ct-text-secondary)', fontSize: 13, textAlign: 'center', padding: 40 }}>
          건강 스코어 데이터가 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sorted.map((farm, i) => (
            <FarmRow
              key={farm.farmId}
              farm={farm}
              rank={i + 1}
              onClick={onFarmClick ? () => onFarmClick(farm.farmId) : undefined}
            />
          ))}
        </div>
      )}

      {/* 푸터: 평균 + 분포 */}
      <div style={{
        marginTop: 14,
        paddingTop: 12,
        borderTop: '1px solid var(--ct-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginBottom: 4 }}>전체 농장 평균</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: avgColor, fontVariantNumeric: 'tabular-nums' }}>
              {avgScore}
            </span>
            <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>/ 100</span>
          </div>
        </div>
        <div style={{ flex: 2 }}>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginBottom: 4 }}>점수 분포</div>
          <ScoreHistogram scores={scores} />
        </div>
      </div>
    </div>
  );
}
