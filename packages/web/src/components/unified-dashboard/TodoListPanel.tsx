// 통합 대시보드 — To-do 목록 패널

import React from 'react';
import type { TodoItem } from '@cowtalk/shared';

interface Props {
  readonly items: readonly TodoItem[];
  readonly onItemClick?: (item: TodoItem) => void;
}

// Lucide 아이콘 이름 → 이모지 매핑
const ICON_MAP: Record<string, string> = {
  venus: '♀️',
  baby: '👶',
  thermometer: '🌡️',
  'heart-pulse': '💓',
  utensils: '🍽️',
  activity: '📊',
  'alert-triangle': '⚠️',
  droplets: '💧',
  stethoscope: '🩺',
  syringe: '💉',
  pill: '💊',
  cow: '🐄',
};

function resolveIcon(icon: string): string {
  return ICON_MAP[icon] ?? icon;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'var(--ct-danger)',
  high: 'var(--ct-warning)',
  medium: '#eab308',
  low: 'var(--ct-info)',
  info: 'var(--ct-text-secondary)',
};

export function TodoListPanel({ items, onItemClick }: Props): React.JSX.Element {
  return (
    <div className="ct-card p-4" style={{ borderRadius: '12px' }}>
      <h3
        className="mb-3 font-semibold"
        style={{ fontSize: '13px', color: 'var(--ct-text)' }}
      >
{'\uD83D\uDCCB'} 오늘 할 일
      </h3>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const hasCount = item.count > 0;
          const badgeColor = hasCount
            ? SEVERITY_COLORS[item.severity] ?? 'var(--ct-text-secondary)'
            : 'var(--ct-border)';

          const shouldPulse = item.count > 10;

          return (
            <li key={`${item.category}-${item.label}`}>
              <button
                type="button"
                onClick={() => onItemClick?.(item)}
                disabled={!onItemClick}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                  onItemClick ? 'cursor-pointer hover:bg-black/5' : 'cursor-default'
                }`}
                style={{ position: 'relative' }}
              >
                {/* severity accent bar */}
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '20%',
                    bottom: '20%',
                    width: 3,
                    borderRadius: 2,
                    backgroundColor: hasCount ? badgeColor : 'var(--ct-border)',
                    transition: 'background-color 0.2s ease',
                  }}
                />
                <span style={{ fontSize: '14px', marginLeft: 2 }}>{resolveIcon(item.icon)}</span>
                <span
                  className="flex-1 text-sm"
                  style={{
                    color: hasCount ? 'var(--ct-text)' : 'var(--ct-text-secondary)',
                  }}
                >
                  {item.label}
                </span>
                {/* severity badge with glow */}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium${hasCount ? ' ct-severity-glow' : ''}`}
                  style={{
                    backgroundColor: hasCount ? badgeColor : 'var(--ct-border)',
                    color: hasCount ? '#ffffff' : 'var(--ct-text-secondary)',
                    minWidth: '24px',
                    textAlign: 'center',
                  }}
                >
                  {item.count}
                </span>
                {/* count badge with pulse when > 10 */}
                {shouldPulse && (
                  <span
                    className="ct-count-pulse rounded-full px-1.5 py-0.5 text-xs font-bold"
                    style={{
                      backgroundColor: 'var(--ct-danger)',
                      color: '#ffffff',
                      minWidth: '20px',
                      textAlign: 'center',
                      fontSize: '10px',
                    }}
                  >
                    !
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
