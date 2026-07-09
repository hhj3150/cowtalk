// 통합 대시보드 — 상단 4개 KPI 카드 (애니메이션 카운터 + 스파크라인 + 트렌드)
// DX: 오늘 업무 완료율 미니 링 표시

import React, { useEffect, useRef, useState } from 'react';
import type { HerdOverview } from '@cowtalk/shared';

interface Props {
  readonly data: HerdOverview | null;
  readonly isLoading?: boolean;
  readonly onCardClick?: (category: string) => void;
  readonly dxCompletion?: {
    readonly completed: number;
    readonly total: number;
  };
  readonly role?: string;
}

type CardIconName = 'herd' | 'sensor' | 'bell' | 'heart' | 'stethoscope' | 'thermometer' | 'siren' | 'clipboard' | 'shield';

interface CardConfig {
  readonly key: keyof HerdOverview;
  readonly label: string;
  readonly icon: CardIconName;
  readonly category: string;
  readonly accent: string;
  readonly accentRgb: string;
  readonly sparkColor: string;
}

const DEFAULT_CARDS: readonly CardConfig[] = [
  { key: 'totalAnimals', label: '총 두수', icon: 'herd', category: 'total', accent: '#3b82f6', accentRgb: '59,130,246', sparkColor: '#3b82f6' },
  { key: 'sensorAttached', label: '센서 장착', icon: 'sensor', category: 'sensor', accent: '#06b6d4', accentRgb: '6,182,212', sparkColor: '#06b6d4' },
  { key: 'activeAlerts', label: '24h 알림', icon: 'bell', category: 'alerts', accent: '#f59e0b', accentRgb: '245,158,11', sparkColor: '#f59e0b' },
  { key: 'healthIssues', label: '건강 이상', icon: 'heart', category: 'health', accent: '#ef4444', accentRgb: '239,68,68', sparkColor: '#ef4444' },
];

const ROLE_CARDS: Readonly<Record<string, readonly CardConfig[]>> = {
  veterinarian: [
    { key: 'totalAnimals', label: '관리 두수', icon: 'stethoscope', category: 'total', accent: '#3b82f6', accentRgb: '59,130,246', sparkColor: '#3b82f6' },
    { key: 'healthIssues', label: '진료 대상', icon: 'heart', category: 'health', accent: '#ef4444', accentRgb: '239,68,68', sparkColor: '#ef4444' },
    { key: 'activeAlerts', label: '발열·질병', icon: 'thermometer', category: 'alerts', accent: '#f59e0b', accentRgb: '245,158,11', sparkColor: '#f59e0b' },
    { key: 'sensorAttached', label: '센서 장착', icon: 'sensor', category: 'sensor', accent: '#06b6d4', accentRgb: '6,182,212', sparkColor: '#06b6d4' },
  ],
  quarantine_officer: [
    { key: 'totalAnimals', label: '감시 두수', icon: 'shield', category: 'total', accent: '#3b82f6', accentRgb: '59,130,246', sparkColor: '#3b82f6' },
    { key: 'healthIssues', label: '발열 두수', icon: 'thermometer', category: 'health', accent: '#ef4444', accentRgb: '239,68,68', sparkColor: '#ef4444' },
    { key: 'activeAlerts', label: '역학 경보', icon: 'siren', category: 'alerts', accent: '#f59e0b', accentRgb: '245,158,11', sparkColor: '#f59e0b' },
    { key: 'sensorAttached', label: '감시 농장', icon: 'clipboard', category: 'sensor', accent: '#06b6d4', accentRgb: '6,182,212', sparkColor: '#06b6d4' },
  ],
};

// ── SVG 라인 아이콘 (이모지 대체 — 관제센터 톤) ──
const CARD_ICON_PATHS: Readonly<Record<CardIconName, React.JSX.Element>> = {
  herd: (
    <>
      <path d="M5 4c0 2.2 1.8 4 4 4h6c2.2 0 4-1.8 4-4" />
      <path d="M8 8l-1.3 4.5V16a5.3 5.3 0 0 0 10.6 0v-3.5L16 8" />
      <circle cx="10" cy="16" r="0.4" fill="currentColor" />
      <circle cx="14" cy="16" r="0.4" fill="currentColor" />
    </>
  ),
  sensor: (
    <>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
      <path d="M5 19a10 10 0 0 1 0-14M19 5a10 10 0 0 1 0 14" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </>
  ),
  heart: (
    <>
      <path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 1 1 12 6.3a5 5 0 1 1 7.5 6.3z" />
      <path d="M8 12.5h2l1.2-2.4 1.6 3.6 1.2-1.9H16" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M5 3v6a5 5 0 0 0 10 0V3" />
      <path d="M10 14v2a5 5 0 0 0 10 0v-2" />
      <circle cx="20" cy="10" r="2" />
    </>
  ),
  thermometer: (
    <>
      <path d="M14 4a2 2 0 0 0-4 0v9.5a4 4 0 1 0 4 0V4z" />
      <circle cx="12" cy="17" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  siren: (
    <>
      <path d="M12 3v2M4.5 6.5 6 8M19.5 6.5 18 8" />
      <path d="M7 19v-4a5 5 0 0 1 10 0v4" />
      <path d="M5 19h14" />
    </>
  ),
  clipboard: (
    <>
      <rect x="6" y="5" width="12" height="16" rx="2" />
      <path d="M9 3h6v4H9zM9 12h6M9 16h4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
};

function CardIcon({ name }: { readonly name: CardIconName }): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {CARD_ICON_PATHS[name]}
    </svg>
  );
}

// ── 애니메이션 카운터 ──
function AnimatedCounter({ target }: { readonly target: number }): React.JSX.Element {
  const [current, setCurrent] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    const from = 0;

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCurrent(Math.round(from + (target - from) * eased));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    }

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  return <>{current.toLocaleString('ko-KR')}</>;
}

// ── 미니 스파크라인 SVG ──
function Sparkline({ color, seed }: { readonly color: string; readonly seed: number }): React.JSX.Element {
  // 최근 7일 트렌드를 시뮬레이션 (실 데이터 연동 시 교체)
  const points = React.useMemo(() => {
    const base = seed;
    const variance = base * 0.15;
    return Array.from({ length: 7 }, (_, i) => {
      const noise = Math.sin(seed * 0.1 + i * 1.5) * variance;
      return base + noise + (i * variance * 0.1);
    });
  }, [seed]);

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const h = 24;
  const w = 60;

  const pathData = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');

  const areaPath = `${pathData} L${w},${h} L0,${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ opacity: 0.7 }}>
      <defs>
        <linearGradient id={`spark-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#spark-${seed})`} />
      <path d={pathData} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* 마지막 점 강조 */}
      <circle
        cx={w}
        cy={h - (((points[points.length - 1] ?? 0) - min) / range) * h}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}

// ── 스켈레톤 카드 ──
function SkeletonCard({ accentRgb }: { readonly accentRgb: string }): React.JSX.Element {
  return (
    <div
      className="ct-kpi-card flex flex-col p-4 md:p-5"
      style={{
        background: `linear-gradient(145deg, var(--ct-card) 0%, rgba(${accentRgb},0.05) 100%)`,
        borderRadius: 16,
        border: '1px solid var(--ct-border)',
        overflow: 'hidden',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="ct-skeleton-pulse"
          style={{ width: 60, height: 12, borderRadius: 4, background: 'var(--ct-border)' }}
        />
        <div
          className="ct-skeleton-pulse"
          style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--ct-border)' }}
        />
      </div>
      <div className="flex items-end justify-between">
        <div
          className="ct-skeleton-pulse"
          style={{ width: 64, height: 28, borderRadius: 6, background: 'var(--ct-border)' }}
        />
        <div
          className="ct-skeleton-pulse"
          style={{ width: 60, height: 24, borderRadius: 4, background: 'var(--ct-border)' }}
        />
      </div>
      <div className="mt-3">
        <div
          className="ct-skeleton-pulse"
          style={{ width: 48, height: 10, borderRadius: 4, background: 'var(--ct-border)' }}
        />
      </div>
    </div>
  );
}

// ── 트렌드 뱃지 ──
function TrendBadge({ value, accent }: { readonly value: number; readonly accent: string }): React.JSX.Element {
  // 건강 이상, 알림은 0이 좋은 것
  const isNeutral = value === 0;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        fontSize: '10px',
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: 6,
        background: isNeutral ? 'rgba(34,197,94,0.15)' : `rgba(${accent},0.12)`,
        color: isNeutral ? '#22c55e' : `rgb(${accent})`,
      }}
    >
      {isNeutral ? '✓ 정상' : `${value > 100 ? '↑' : '→'} 활성`}
    </span>
  );
}

// ── DX 완료율 미니 링 ──

function DxCompletionRing({
  completed,
  total,
}: {
  readonly completed: number;
  readonly total: number;
}): React.JSX.Element {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const isDone = pct === 100;
  const ringColor = isDone ? '#22c55e' : 'var(--ct-primary)';

  return (
    <div
      className="ct-fade-up ct-fade-up-5 flex items-center gap-3 rounded-2xl px-4 py-3"
      style={{
        background: 'var(--ct-card)',
        border: '1px solid var(--ct-border)',
        gridColumn: 'span 2',
      }}
    >
      {/* 미니 링 */}
      <svg width={36} height={36} viewBox="0 0 36 36">
        <circle
          cx={18}
          cy={18}
          r={radius}
          fill="none"
          stroke="var(--ct-border)"
          strokeWidth={3}
        />
        <circle
          cx={18}
          cy={18}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
          }}
        />
        <text
          x={18}
          y={19}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontSize: '9px',
            fontWeight: 700,
            fill: ringColor,
          }}
        >
          {pct}%
        </text>
      </svg>
      <div className="flex flex-col">
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ct-text)' }}>
          오늘 업무 완료율
        </span>
        <span style={{ fontSize: '11px', color: 'var(--ct-text-secondary)' }}>
          {completed}/{total} {isDone ? '- 모두 완료!' : '진행 중'}
        </span>
      </div>
    </div>
  );
}

export function HerdOverviewCards({ data, isLoading, onCardClick, dxCompletion, role }: Props): React.JSX.Element {
  const CARDS = (role && ROLE_CARDS[role]) ? ROLE_CARDS[role] : DEFAULT_CARDS;
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {CARDS.map((card) => (
          <SkeletonCard key={card.key} accentRgb={card.accentRgb} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {CARDS.map((card, idx) => {
        const value = data[card.key];
        const isClickable = Boolean(onCardClick);
        // 위험 카드(알림·건강)는 값>0일 때 색으로 신호 — 0이면 평상 테두리
        const isAlerting = (card.category === 'alerts' || card.category === 'health') && value > 0;

        return (
          <button
            key={card.key}
            type="button"
            disabled={!isClickable}
            onClick={() => onCardClick?.(card.category)}
            className={`ct-kpi-card ct-kpi-card-hover ct-fade-up ct-fade-up-${idx + 1} flex flex-col p-4 md:p-5 text-left group`}
            style={{
              '--kpi-accent': card.accent,
              '--kpi-accent-rgb': card.accentRgb,
              background: `linear-gradient(145deg, var(--ct-card) 0%, rgba(${card.accentRgb},0.08) 100%)`,
              borderRadius: 16,
              border: isAlerting ? `1px solid rgba(${card.accentRgb},0.55)` : '1px solid var(--ct-border)',
              // 평상시 boxShadow 는 미지정 → 다크 테마 공통 카드 섀도(index.css)가 적용됨
              boxShadow: isAlerting ? `0 0 0 1px rgba(${card.accentRgb},0.22), 0 6px 20px rgba(${card.accentRgb},0.16)` : undefined,
              cursor: isClickable ? 'pointer' : 'default',
              transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s ease',
              position: 'relative',
              overflow: 'hidden',
            } as React.CSSProperties}
          >
            {/* 배경 글로우 효과 */}
            <div
              style={{
                position: 'absolute',
                top: -20,
                right: -20,
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: `radial-gradient(circle, rgba(${card.accentRgb},0.15) 0%, transparent 70%)`,
                transition: 'opacity 0.3s',
              }}
            />

            <div className="flex items-center justify-between mb-2 relative z-10">
              <span
                className="font-semibold tracking-wide"
                style={{ fontSize: '11px', color: 'var(--ct-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}
              >
                {card.label}
              </span>
              <span
                className="flex items-center justify-center"
                style={{
                  width: 36,
                  height: 36,
                  color: `rgb(${card.accentRgb})`,
                  background: `rgba(${card.accentRgb},0.12)`,
                  border: `1px solid rgba(${card.accentRgb},0.2)`,
                  borderRadius: 12,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <CardIcon name={card.icon} />
              </span>
            </div>

            {/* 숫자 + 스파크라인 */}
            <div className="flex items-end justify-between relative z-10">
              <span
                className="font-bold tabular-nums ct-kpi-value"
                style={{
                  fontSize: '28px',
                  lineHeight: '1.1',
                  color: 'var(--ct-text)',
                  letterSpacing: '-0.5px',
                }}
              >
                <AnimatedCounter target={value} />
              </span>
              <Sparkline color={card.sparkColor} seed={value} />
            </div>

            {/* 트렌드 뱃지 + 상세보기 */}
            <div className="flex items-center justify-between mt-3 relative z-10">
              {(card.category === 'alerts' || card.category === 'health') ? (
                <TrendBadge value={value} accent={card.accentRgb} />
              ) : (
                <span style={{ fontSize: '10px', color: 'var(--ct-text-muted)' }}>7일 추이</span>
              )}
              {isClickable && (
                <span
                  className="flex items-center gap-1 group-hover:gap-2 transition-all"
                  style={{ fontSize: '11px', color: card.accent }}
                >
                  <span>상세</span>
                  <span style={{ fontSize: '10px', transition: 'transform 0.2s' }}>→</span>
                </span>
              )}
            </div>
          </button>
        );
      })}
      {dxCompletion && dxCompletion.total > 0 && (
        <DxCompletionRing completed={dxCompletion.completed} total={dxCompletion.total} />
      )}
    </div>
  );
}
