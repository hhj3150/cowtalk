// 통합 대시보드 — 상단 4개 KPI 카드 (총 두수, 센서, 알림, 건강)

import React from 'react';
import type { HerdOverview } from '@cowtalk/shared';

interface Props {
  readonly data: HerdOverview;
  readonly onCardClick?: (category: string) => void;
}

interface CardConfig {
  readonly key: keyof HerdOverview;
  readonly label: string;
  readonly icon: string;
  readonly category: string;
  readonly accent: string;
  readonly glowVar: string;
}

const CARDS: readonly CardConfig[] = [
  { key: 'totalAnimals', label: '총 두수', icon: '\uD83D\uDC04', category: 'total', accent: 'var(--ct-primary)', glowVar: 'var(--ct-glow-primary)' },
  { key: 'sensorAttached', label: '센서 장착', icon: '\uD83D\uDCE1', category: 'sensor', accent: 'var(--ct-info)', glowVar: 'var(--ct-glow-info)' },
  { key: 'activeAlerts', label: '금일 알림', icon: '\u26A0\uFE0F', category: 'alerts', accent: 'var(--ct-warning)', glowVar: 'var(--ct-glow-warning)' },
  { key: 'healthIssues', label: '건강 이상', icon: '\uD83C\uDFE5', category: 'health', accent: 'var(--ct-danger)', glowVar: 'var(--ct-glow-danger)' },
] as const;

export function HerdOverviewCards({ data, onCardClick }: Props): React.JSX.Element {
  return (
    <div className="grid grid-cols-4 gap-4">
      {CARDS.map((card, idx) => {
        const value = data[card.key];
        const isClickable = Boolean(onCardClick);

        return (
          <button
            key={card.key}
            type="button"
            disabled={!isClickable}
            onClick={() => onCardClick?.(card.category)}
            className={`ct-kpi-card ct-fade-up ct-fade-up-${idx + 1} flex flex-col p-5 text-left`}
            style={{
              '--kpi-accent': card.accent,
              background: `linear-gradient(135deg, var(--ct-card) 0%, ${card.glowVar} 100%)`,
              borderRadius: 14,
              border: '1px solid var(--ct-border)',
              cursor: isClickable ? 'pointer' : 'default',
            } as React.CSSProperties}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className="font-semibold tracking-wide"
                style={{ fontSize: '11px', color: 'var(--ct-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}
              >
                {card.label}
              </span>
              <span
                className="flex items-center justify-center rounded-lg"
                style={{
                  width: 32,
                  height: 32,
                  fontSize: '16px',
                  background: `${card.glowVar}`,
                  border: `1px solid ${card.accent}22`,
                  borderRadius: 10,
                }}
              >
                {card.icon}
              </span>
            </div>
            <span
              className="font-bold tabular-nums"
              style={{ fontSize: '32px', lineHeight: '1.1', color: 'var(--ct-text)', letterSpacing: '-0.5px' }}
            >
              {value.toLocaleString('ko-KR')}
            </span>
            {isClickable && (
              <span className="mt-3 flex items-center gap-1" style={{ fontSize: '11px', color: card.accent }}>
                <span>상세 보기</span>
                <span style={{ fontSize: '10px' }}>&rarr;</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
