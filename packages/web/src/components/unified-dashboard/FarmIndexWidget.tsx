// Farm Intelligence Index 위젯 — "오늘의 목장 점수"
// 정직성: 데이터 부족 축은 '—', 종합 점수에는 coverage(가용/전체 축) 명시.
// 각 축 클릭 없이도 근거(reasons)가 바로 보인다 — "오늘 이 점수인 이유".

import React from 'react';
import type { FarmIntelligenceIndex, FarmIndexAxis } from '@cowtalk/shared';
import { TitleAccentBar } from './WidgetTitle';

interface Props {
  readonly data: FarmIntelligenceIndex | undefined;
  readonly isLoading: boolean;
}

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#38bdf8',
  C: '#f59e0b',
  D: '#ef4444',
};

function ScoreRing({ score, grade }: { readonly score: number | null; readonly grade: string | null }): React.JSX.Element {
  const color = grade ? (GRADE_COLORS[grade] ?? 'var(--ct-primary)') : 'var(--ct-text-muted)';
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const pct = score ?? 0;
  return (
    <div style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
      <svg width={88} height={88} viewBox="0 0 88 88">
        <circle cx={44} cy={44} r={radius} fill="none" stroke="var(--ct-border)" strokeWidth={7} />
        {score != null && (
          <circle
            cx={44} cy={44} r={radius} fill="none"
            stroke={color} strokeWidth={7} strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - (pct / 100) * circumference}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)' }}
          />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: score != null ? 'var(--ct-text)' : 'var(--ct-text-muted)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {score ?? '—'}
        </span>
        {grade && <span style={{ fontSize: 10, fontWeight: 700, color, marginTop: 2 }}>{grade}등급</span>}
      </div>
    </div>
  );
}

function AxisRow({ axis }: { readonly axis: FarmIndexAxis }): React.JSX.Element {
  const hasScore = axis.score != null;
  const barColor = !hasScore
    ? 'var(--ct-border)'
    : axis.score! >= 85 ? '#22c55e' : axis.score! >= 70 ? '#38bdf8' : axis.score! >= 55 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text)', width: 52, flexShrink: 0 }}>
          {axis.label}
        </span>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--ct-border)', overflow: 'hidden' }}>
          {hasScore && (
            <div style={{
              width: `${axis.score}%`, height: '100%', borderRadius: 3, background: barColor,
              transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
            }} />
          )}
        </div>
        <span style={{
          fontSize: 12, fontWeight: 700, width: 30, textAlign: 'right', flexShrink: 0,
          color: hasScore ? 'var(--ct-text)' : 'var(--ct-text-muted)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {hasScore ? axis.score : '—'}
        </span>
      </div>
      {/* 근거 — 이 점수인 이유 (실데이터 인용) */}
      <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', paddingLeft: 60, lineHeight: 1.5 }}>
        {axis.reasons.join(' · ')}
      </div>
    </div>
  );
}

export function FarmIndexWidget({ data, isLoading }: Props): React.JSX.Element {
  return (
    <div className="ct-card ct-fade-up" style={{ borderRadius: 14, padding: '16px 16px 14px' }} role="region" aria-label="오늘의 목장 점수">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <TitleAccentBar />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ct-text)', letterSpacing: '-0.2px' }}>
          오늘의 목장 점수
        </span>
        {data && (
          <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
            {data.coverage.available}/{data.coverage.total}축 기준
          </span>
        )}
      </div>

      {isLoading && <div className="ct-shimmer" style={{ height: 120, borderRadius: 12 }} />}

      {!isLoading && data && (
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          <ScoreRing score={data.overall} grade={data.grade} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.axes.map((axis) => <AxisRow key={axis.key} axis={axis} />)}
          </div>
        </div>
      )}

      {!isLoading && data && data.overall == null && (
        <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--ct-text-muted)' }}>
          아직 점수를 계산할 데이터가 부족합니다 — 기록이 쌓이면 자동으로 활성화됩니다.
        </p>
      )}
    </div>
  );
}
