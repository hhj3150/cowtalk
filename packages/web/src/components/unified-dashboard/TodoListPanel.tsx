// 통합 대시보드 — To-do 목록 패널 (DX 완료 처리 + 프로그레스바)

import React from 'react';
import type { TodoItem } from '@cowtalk/shared';
import { useDxCompletion } from '../../hooks/useDxCompletion';

interface Props {
  readonly items: readonly TodoItem[];
  readonly onItemClick?: (item: TodoItem) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#64748b',
  info: '#94a3b8',
};

function makeTodoKey(item: TodoItem): string {
  return `${item.category}-${item.label}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: 'var(--ct-text-secondary)', fontWeight: 500 }}>
          {completed}/{total} 완료
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: pct === 100 ? '#22c55e' : 'var(--ct-primary)' }}>
          {pct}%
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'var(--ct-border)', overflow: 'hidden' }}>
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
    <div
      className="ct-card"
      style={{
        borderRadius: 12,
        padding: '14px 12px',
        overflow: 'hidden',       // 모바일 넘침 방지
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ct-text)', margin: '0 0 10px 2px' }}>
        오늘 할 일
      </h3>

      {items.length > 0 && (
        <CompletionProgressBar completed={completedCount} total={items.length} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((item) => {
          const key = makeTodoKey(item);
          const completedAt = completedTodos.get(key);
          const isCompleted = completedAt !== undefined;
          const hasCount = item.count > 0;
          const barColor = isCompleted
            ? '#22c55e'
            : hasCount
              ? (SEVERITY_COLORS[item.severity] ?? '#64748b')
              : 'var(--ct-border)';
          const badgeColor = isCompleted ? '#22c55e' : barColor;

          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 6px 7px 0',
                borderRadius: 8,
                opacity: isCompleted ? 0.5 : 1,
                transition: 'opacity 0.2s',
                position: 'relative',
                minWidth: 0,          // flex children 넘침 방지
              }}
            >
              {/* severity accent bar */}
              <span
                style={{
                  flexShrink: 0,
                  width: 3,
                  alignSelf: 'stretch',
                  borderRadius: 2,
                  background: barColor,
                }}
              />

              {/* 체크박스 */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleTodo(key); }}
                style={{
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border: `1.5px solid ${isCompleted ? '#22c55e' : 'var(--ct-border)'}`,
                  background: isCompleted ? '#22c55e' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
                title={isCompleted ? '완료 취소' : '완료 처리'}
              >
                {isCompleted && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {/* 라벨 — 클릭 시 드릴다운 */}
              <button
                type="button"
                onClick={() => onItemClick?.(item)}
                disabled={!onItemClick}
                style={{
                  flex: '1 1 0',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'left',
                  fontSize: 13,
                  fontWeight: hasCount && !isCompleted ? 500 : 400,
                  color: isCompleted
                    ? 'var(--ct-text-secondary)'
                    : hasCount ? 'var(--ct-text)' : 'var(--ct-text-secondary)',
                  textDecoration: isCompleted ? 'line-through' : 'none',
                  cursor: onItemClick ? 'pointer' : 'default',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  lineHeight: 1.3,
                }}
              >
                {item.label}
              </button>

              {/* 완료 시각 */}
              {isCompleted && completedAt !== undefined && (
                <span style={{ flexShrink: 0, fontSize: 10, color: '#22c55e', fontWeight: 500 }}>
                  {formatTime(completedAt)}
                </span>
              )}

              {/* 카운트 배지 */}
              {!isCompleted && (
                <span
                  style={{
                    flexShrink: 0,
                    minWidth: 24,
                    padding: '2px 6px',
                    borderRadius: 10,
                    background: badgeColor,
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: 'center',
                    lineHeight: 1.3,
                  }}
                >
                  {item.count}
                </span>
              )}
              {isCompleted && (
                <span
                  style={{
                    flexShrink: 0,
                    minWidth: 24,
                    padding: '2px 6px',
                    borderRadius: 10,
                    background: '#22c55e',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: 'center',
                  }}
                >
                  ✓
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
