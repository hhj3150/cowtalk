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
}

const CARDS: readonly CardConfig[] = [
  { key: 'totalAnimals', label: '총 두수', icon: '\uD83D\uDC04', category: 'total' },
  { key: 'sensorAttached', label: '센서 장착', icon: '\uD83D\uDCE1', category: 'sensor' },
  { key: 'activeAlerts', label: '금일 알림', icon: '\u26A0\uFE0F', category: 'alerts' },
  { key: 'healthIssues', label: '건강 이상', icon: '\uD83C\uDFE5', category: 'health' },
] as const;

export function HerdOverviewCards({ data, onCardClick }: Props): React.JSX.Element {
  return (
    <div className="grid grid-cols-4 gap-3">
      {CARDS.map((card) => {
        const value = data[card.key];
        const isClickable = Boolean(onCardClick);

        return (
          <button
            key={card.key}
            type="button"
            disabled={!isClickable}
            onClick={() => onCardClick?.(card.category)}
            className={`ct-card flex flex-col p-4 text-left transition-all ${
              isClickable ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
            }`}
            style={{ borderRadius: '12px' }}
          >
            <div className="flex items-center justify-between">
              <span
                className="font-medium"
                style={{ fontSize: '11px', color: 'var(--ct-text-secondary)' }}
              >
                {card.label}
              </span>
              <span className="text-base">{card.icon}</span>
            </div>
            <span
              className="mt-2 font-bold"
              style={{ fontSize: '28px', lineHeight: '1.2', color: 'var(--ct-text)' }}
            >
              {value.toLocaleString('ko-KR')}
            </span>
            {isClickable && (
              <span className="mt-2" style={{ fontSize: '10px', color: 'var(--ct-primary)' }}>
                클릭하여 상세 보기
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
