// 통합 대시보드 — To-do 목록 패널

import React from 'react';
import type { TodoItem } from '@cowtalk/shared';

interface Props {
  readonly items: readonly TodoItem[];
  readonly onItemClick?: (item: TodoItem) => void;
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

          return (
            <li key={`${item.category}-${item.label}`}>
              <button
                type="button"
                onClick={() => onItemClick?.(item)}
                disabled={!onItemClick}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                  onItemClick ? 'cursor-pointer hover:bg-black/5' : 'cursor-default'
                }`}
              >
                <span style={{ fontSize: '14px' }}>{item.icon}</span>
                <span
                  className="flex-1 text-sm"
                  style={{
                    color: hasCount ? 'var(--ct-text)' : 'var(--ct-text-secondary)',
                  }}
                >
                  {item.label}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: hasCount ? badgeColor : 'var(--ct-border)',
                    color: hasCount ? '#ffffff' : 'var(--ct-text-secondary)',
                    minWidth: '24px',
                    textAlign: 'center',
                  }}
                >
                  {item.count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
