// 액션 카드 — 추천 행동 + 피드백 (수용/거부), CowTalk 디자인

import React from 'react';
import { Badge, severityToBadgeVariant } from '@web/components/common/Badge';
import { useSubmitFeedback } from '@web/hooks/useFeedback';

interface Props {
  readonly action: string;
  readonly target: string;
  readonly urgency: string;
  readonly reasoning?: string;
  readonly animalId: string | null;
  readonly farmId: string;
}

export function ActionCard({ action, target, urgency, reasoning, animalId, farmId }: Props): React.JSX.Element {
  const feedbackMutation = useSubmitFeedback();

  function handleFeedback(type: 'action_accepted' | 'action_rejected'): void {
    feedbackMutation.mutate({
      type,
      predictionId: null,
      alertId: null,
      animalId,
      farmId,
      notes: action,
    });
  }

  return (
    <div className="ct-card p-4 transition-colors hover:bg-[#FAFAF8]">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge label={urgency} variant={severityToBadgeVariant(urgency)} />
            <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{target}</span>
          </div>
          <p className="mt-1.5 text-sm font-medium" style={{ color: 'var(--ct-text)' }}>{action}</p>
          {reasoning && <p className="mt-0.5 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{reasoning}</p>}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => handleFeedback('action_accepted')}
          disabled={feedbackMutation.isPending}
          className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ background: 'var(--ct-primary-light)', color: 'var(--ct-primary)' }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#C8EDE0'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'var(--ct-primary-light)'; }}
        >
          수용
        </button>
        <button
          type="button"
          onClick={() => handleFeedback('action_rejected')}
          disabled={feedbackMutation.isPending}
          className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ background: '#F5F5F3', color: 'var(--ct-text-secondary)' }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#EBEBEA'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = '#F5F5F3'; }}
        >
          거부
        </button>
      </div>
    </div>
  );
}
