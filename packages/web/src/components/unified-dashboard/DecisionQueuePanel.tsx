// 오늘의 결정 큐 — "무엇을 할 수 있는가"가 아니라 "오늘 무엇을 해야 하는가"
// 소버린 알람 + smaXtec 이벤트 + 번식 긴급조치를 합성한 우선순위 Top 5 결정 카드.
// 카드 = 행동 명령형 제목 + 원인 체인(why) + 즉시 실행 버튼 (알람→행동 완결).

import React from 'react';
import type { DecisionCard, DecisionQueueData } from '@cowtalk/shared';
import { TitleAccentBar } from './WidgetTitle';
import { useDxCompletion } from '../../hooks/useDxCompletion';

interface Props {
  readonly data: DecisionQueueData | undefined;
  readonly isLoading: boolean;
  readonly onAnimalClick?: (animalId: string) => void;
  readonly onFarmClick?: (farmId: string) => void;
  readonly onAiAnalysis?: (card: DecisionCard) => void;
}

const SEVERITY_META: Record<string, { color: string; label: string }> = {
  critical: { color: '#ef4444', label: '긴급' },
  high: { color: '#f97316', label: '높음' },
  medium: { color: '#f59e0b', label: '보통' },
  low: { color: '#64748b', label: '낮음' },
};

const SOURCE_LABEL: Record<string, string> = {
  sovereign: 'CowTalk AI',
  smaxtec: 'smaXtec',
  breeding: '번식',
};

function dueLabel(hours: number | undefined): string | null {
  if (hours == null) return null;
  if (hours <= 0) return '지금';
  if (hours < 24) return `${Math.round(hours)}시간 내`;
  return `${Math.round(hours / 24)}일 내`;
}

function DecisionCardRow({ card, done, onToggleDone, onAnimalClick, onFarmClick, onAiAnalysis }: {
  readonly card: DecisionCard;
  readonly done: boolean;
  readonly onToggleDone: () => void;
  readonly onAnimalClick?: (animalId: string) => void;
  readonly onFarmClick?: (farmId: string) => void;
  readonly onAiAnalysis?: (card: DecisionCard) => void;
}): React.JSX.Element {
  const sev = SEVERITY_META[card.severity] ?? SEVERITY_META.medium!;
  const due = dueLabel(card.dueInHours);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'var(--ct-surface-2, rgba(255,255,255,0.03))',
        border: `1px solid ${done ? 'var(--ct-border)' : `${sev.color}33`}`,
        borderLeft: `3px solid ${done ? 'var(--ct-border)' : sev.color}`,
        opacity: done ? 0.5 : 1,
        transition: 'opacity 0.25s ease, border-color 0.25s ease',
      }}
    >
      {/* 순위 */}
      <span
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          background: done ? 'var(--ct-border)' : `${sev.color}1f`,
          color: done ? 'var(--ct-text-muted)' : sev.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {card.rank}
      </span>

      {/* 본문 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--ct-text)',
            letterSpacing: '-0.2px',
            textDecoration: done ? 'line-through' : 'none',
          }}>
            {card.title}
          </span>
          {due && !done && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: sev.color,
              background: `${sev.color}1a`,
              padding: '2px 7px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
            }}>
              ⏱ {due}
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
            {SOURCE_LABEL[card.source] ?? card.source}
            {card.subject.farmName ? ` · ${card.subject.farmName}` : ''}
          </span>
        </div>

        {/* 경제 환산 — 실측 유량 보유 개체만, 항상 '추정' 표기 */}
        {card.economicImpact && !done && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 6,
            fontSize: 11,
            color: '#fbbf24',
            fontWeight: 600,
          }}>
            <span aria-hidden>₩</span>
            <span>
              미조치 시 일 손실 약 {card.economicImpact.dailyLossKrw.toLocaleString('ko-KR')}원
            </span>
            <span style={{ color: 'var(--ct-text-muted)', fontWeight: 400 }}>
              — 실측 유량 {card.economicImpact.basisYieldL}L/일 × 손실률 {card.economicImpact.lossFractionPct}% (추정)
            </span>
          </div>
        )}

        {/* 원인 체인 */}
        {card.why.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {card.why.map((w, i) => (
              <span
                key={i}
                style={{
                  fontSize: 11,
                  color: 'var(--ct-text-secondary)',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--ct-border)',
                  borderRadius: 6,
                  padding: '2px 8px',
                  maxWidth: 320,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={w}
              >
                {w}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 액션 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {!done && card.subject.animalId && onAnimalClick && (
          <button
            type="button"
            onClick={() => onAnimalClick(card.subject.animalId!)}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '5px 10px',
              borderRadius: 8,
              border: `1px solid ${sev.color}55`,
              background: `${sev.color}14`,
              color: sev.color,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {card.actionLabel}
          </button>
        )}
        {!done && !card.subject.animalId && card.subject.farmId && onFarmClick && (
          <button
            type="button"
            onClick={() => onFarmClick(card.subject.farmId!)}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '5px 10px',
              borderRadius: 8,
              border: `1px solid ${sev.color}55`,
              background: `${sev.color}14`,
              color: sev.color,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {card.actionLabel}
          </button>
        )}
        {!done && onAiAnalysis && (
          <button
            type="button"
            onClick={() => onAiAnalysis(card)}
            title="팅커벨 AI 정밀분석"
            aria-label="AI 정밀분석"
            style={{
              fontSize: 11,
              padding: '5px 8px',
              borderRadius: 8,
              border: '1px solid var(--ct-border)',
              background: 'transparent',
              color: 'var(--ct-text-secondary)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            AI
          </button>
        )}
        <button
          type="button"
          onClick={onToggleDone}
          aria-label={done ? '완료 취소' : '완료 처리'}
          title={done ? '완료 취소' : '완료 처리'}
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            border: `1px solid ${done ? 'var(--ct-primary)' : 'var(--ct-border)'}`,
            background: done ? 'rgba(0,214,126,0.15)' : 'transparent',
            color: done ? 'var(--ct-primary)' : 'var(--ct-text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
          }}
        >
          ✓
        </button>
      </div>
    </div>
  );
}

export function DecisionQueuePanel({ data, isLoading, onAnimalClick, onFarmClick, onAiAnalysis }: Props): React.JSX.Element {
  const { completedTodos, toggleTodo } = useDxCompletion();

  return (
    <div
      className="ct-card ct-fade-up"
      style={{ borderRadius: 14, padding: '16px 16px 14px' }}
      role="region"
      aria-label="오늘의 결정 큐"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <TitleAccentBar />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ct-text)', letterSpacing: '-0.2px' }}>
          오늘 해야 할 일
        </span>
        <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
          AI 우선순위 결정 큐
        </span>
        {data && data.totalCandidates > data.cards.length && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ct-text-muted)' }}>
            외 {data.totalCandidates - data.cards.length}건
          </span>
        )}
      </div>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="ct-shimmer" style={{ height: 52, borderRadius: 12 }} />
          ))}
        </div>
      )}

      {!isLoading && data && data.cards.length === 0 && (
        <div style={{
          padding: '22px 16px',
          textAlign: 'center',
          color: 'var(--ct-text-secondary)',
          fontSize: 13,
        }}>
          <span style={{ color: 'var(--ct-primary)', fontWeight: 700 }}>✓ 지금 필요한 조치가 없습니다</span>
          <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 4 }}>
            최근 48시간 판단 기준 — 긴급 신호 없음
          </div>
        </div>
      )}

      {!isLoading && data && data.cards.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.cards.map((card) => {
            const doneKey = `decision-${card.id}`;
            return (
              <DecisionCardRow
                key={card.id}
                card={card}
                done={completedTodos.has(doneKey)}
                onToggleDone={() => toggleTodo(doneKey)}
                onAnimalClick={onAnimalClick}
                onFarmClick={onFarmClick}
                onAiAnalysis={onAiAnalysis}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
