// 통합 대시보드 — To-do 목록 패널 (DX 완료 처리 + 프로그레스바)

import React from 'react';
import type { TodoItem } from '@cowtalk/shared';
import { useDxCompletion } from '../../hooks/useDxCompletion';

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

function makeTodoKey(item: TodoItem): string {
  return `${item.category}-${item.label}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ── 프로그레스바 ──

function CompletionProgressBar({
  completed,
  total,
}: {
  readonly completed: number;
  readonly total: number;
}): React.JSX.Element {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span style={{ fontSize: '11px', color: 'var(--ct-text-secondary)', fontWeight: 500 }}>
          오늘 할 일 {completed}/{total} 완료
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: pct === 100 ? '#22c55e' : 'var(--ct-primary)',
          }}
        >
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--ct-border)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 3,
            background: pct === 100
              ? 'linear-gradient(90deg, #22c55e, #16a34a)'
              : 'linear-gradient(90deg, var(--ct-primary), #60a5fa)',
            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
    </div>
  );
}

// ── 메인 ──

export function TodoListPanel({ items, onItemClick }: Props): React.JSX.Element {
  const { completedTodos, toggleTodo } = useDxCompletion();

  const completedCount = items.filter((item) => completedTodos.has(makeTodoKey(item))).length;

  return (
    <div className="ct-card p-4" style={{ borderRadius: '12px' }}>
      <h3
        className="mb-3 font-semibold"
        style={{ fontSize: '13px', color: 'var(--ct-text)' }}
      >
        {'\uD83D\uDCCB'} 오늘 할 일
      </h3>

      {items.length > 0 && (
        <CompletionProgressBar completed={completedCount} total={items.length} />
      )}

      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const key = makeTodoKey(item);
          const completedAt = completedTodos.get(key);
          const isCompleted = completedAt !== undefined;
          const hasCount = item.count > 0;
          const badgeColor = hasCount
            ? SEVERITY_COLORS[item.severity] ?? 'var(--ct-text-secondary)'
            : 'var(--ct-border)';

          const shouldPulse = item.count > 10 && !isCompleted;

          return (
            <li key={key}>
              <div
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors"
                style={{
                  position: 'relative',
                  opacity: isCompleted ? 0.55 : 1,
                  transition: 'opacity 0.3s ease',
                }}
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
                    backgroundColor: isCompleted
                      ? '#22c55e'
                      : hasCount
                        ? badgeColor
                        : 'var(--ct-border)',
                    transition: 'background-color 0.2s ease',
                  }}
                />

                {/* 완료 체크박스 */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTodo(key);
                  }}
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-all"
                  style={{
                    borderColor: isCompleted ? '#22c55e' : 'var(--ct-border)',
                    backgroundColor: isCompleted ? '#22c55e' : 'transparent',
                    cursor: 'pointer',
                    marginLeft: 2,
                  }}
                  title={isCompleted ? '완료 취소' : '완료 처리'}
                >
                  {isCompleted && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {/* 본문 클릭 영역 */}
                <button
                  type="button"
                  onClick={() => onItemClick?.(item)}
                  disabled={!onItemClick}
                  className={`flex flex-1 items-center gap-2 ${
                    onItemClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                  }`}
                >
                  <span style={{ fontSize: '14px' }}>{resolveIcon(item.icon)}</span>
                  <span
                    className="flex-1 text-sm"
                    style={{
                      color: isCompleted
                        ? 'var(--ct-text-secondary)'
                        : hasCount
                          ? 'var(--ct-text)'
                          : 'var(--ct-text-secondary)',
                      textDecoration: isCompleted ? 'line-through' : 'none',
                      transition: 'color 0.2s ease',
                    }}
                  >
                    {item.label}
                  </span>
                </button>

                {/* 완료 시간 표시 */}
                {isCompleted && completedAt !== undefined && (
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#22c55e',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatTime(completedAt)}
                  </span>
                )}

                {/* severity badge */}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium${hasCount && !isCompleted ? ' ct-severity-glow' : ''}`}
                  style={{
                    backgroundColor: isCompleted ? '#22c55e' : hasCount ? badgeColor : 'var(--ct-border)',
                    color: isCompleted || hasCount ? '#ffffff' : 'var(--ct-text-secondary)',
                    minWidth: '24px',
                    textAlign: 'center',
                  }}
                >
                  {isCompleted ? '\u2713' : item.count}
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
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
