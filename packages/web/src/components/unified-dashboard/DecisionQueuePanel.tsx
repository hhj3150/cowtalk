// 오늘의 결정 큐 — "무엇을 할 수 있는가"가 아니라 "오늘 무엇을 해야 하는가"
// 소버린 알람 + smaXtec 이벤트 + 번식 긴급조치를 합성한 우선순위 Top 5 결정 카드.
// 카드 = 행동 명령형 제목 + 원인 체인(why) + 즉시 실행 버튼 (알람→행동 완결).

import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DecisionCard, DecisionQueueData } from '@cowtalk/shared';
import { URGENCY_LABELS, classifyUrgency } from '@cowtalk/shared';
import { TitleAccentBar } from './WidgetTitle';
import { completeDecision, undoDecision } from '../../api/unified-dashboard.api';
import { useT } from '../../i18n';

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

// 5단계 긴급도 칩 색 — "언제까지"를 심각도와 별도로 표시
const URGENCY_COLOR: Record<string, string> = {
  emergency: '#ef4444',
  today: '#f97316',
  within_48h: '#eab308',
  watch: '#38bdf8',
  info: '#64748b',
};

const SOURCE_LABEL: Record<string, string> = {
  sovereign: 'CowTalk AI',
  smaxtec: 'smaXtec',
  breeding: '번식',
  weather: '기상청',
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
  // 배포 전환기 캐시 응답에 urgency가 없을 수 있음 — 동일 분류기로 폴백
  const urgency = card.urgency ?? classifyUrgency(card.severity, card.dueInHours);
  const urgencyColor = URGENCY_COLOR[urgency] ?? URGENCY_COLOR.info!;

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
          {!done && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: urgencyColor,
              background: `${urgencyColor}1a`,
              padding: '2px 7px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
            }}>
              {URGENCY_LABELS[urgency]}{due ? ` · ⏱ ${due}` : ''}
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
  // 완료 상태는 DB(decision_actions) 기준 — 기기·사용자 간 공유. 낙관적 갱신 후 큐 재조회.
  const queryClient = useQueryClient();
  const invalidateQueue = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['decision-queue'] });
  };
  const complete = useMutation({
    mutationFn: (card: DecisionCard) => completeDecision({
      cardId: card.id,
      farmId: card.subject.farmId,
      animalId: card.subject.animalId,
      source: card.source,
      severity: card.severity,
      title: card.title,
    }),
    onSettled: invalidateQueue,
  });
  const undo = useMutation({
    mutationFn: (cardId: string) => undoDecision(cardId),
    onSettled: invalidateQueue,
  });
  // 낙관적 표시: 뮤테이션 진행 중인 카드는 서버 응답 전에도 토글된 상태로 그린다
  const pendingDoneId = complete.isPending ? complete.variables?.id : undefined;
  const pendingUndoId = undo.isPending ? undo.variables : undefined;
  const t = useT();

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
          {t('decision.title')}
        </span>
        <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
          {t('decision.subtitle')}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          {data && (data.completedLast7d ?? 0) > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ct-primary)' }}>
              {t('decision.completedLast7d').replace('{n}', String(data.completedLast7d))}
            </span>
          )}
          {data && data.totalCandidates > data.cards.length && (
            <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
              {t('decision.more').replace('{n}', String(data.totalCandidates - data.cards.length))}
            </span>
          )}
        </span>
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
          <span style={{ color: 'var(--ct-primary)', fontWeight: 700 }}>{t('decision.empty')}</span>
          <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 4 }}>
            {t('decision.emptyDetail')}
          </div>
        </div>
      )}

      {!isLoading && data && data.cards.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.cards.map((card) => {
            const done = card.id === pendingDoneId ? true
              : card.id === pendingUndoId ? false
              : Boolean(card.done);
            return (
              <DecisionCardRow
                key={card.id}
                card={card}
                done={done}
                onToggleDone={() => {
                  if (done) undo.mutate(card.id);
                  else complete.mutate(card);
                }}
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
