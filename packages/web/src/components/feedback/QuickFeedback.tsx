// 알림/액션 인라인 피드백 — 확인/무시/오알림

import React from 'react';
import { useSubmitFeedback } from '@web/hooks/useFeedback';
import type { FeedbackType } from '@web/api/feedback.api';

interface Props {
  readonly alertId: string;
  readonly farmId: string;
}

export function QuickFeedback({ alertId, farmId }: Props): React.JSX.Element {
  const feedbackMutation = useSubmitFeedback();

  function handleClick(type: FeedbackType): void {
    feedbackMutation.mutate({
      type,
      predictionId: null,
      alertId,
      animalId: null,
      farmId,
      notes: null,
    });
  }

  if (feedbackMutation.isSuccess) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium animate-[feedbackFadeIn_0.3s_ease-in-out]"
        style={{ color: 'var(--ct-success)' }}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        피드백 전송됨
      </span>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => handleClick('alert_acknowledged')}
        disabled={feedbackMutation.isPending}
        className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
        style={{ background: 'var(--ct-primary-light)', color: 'var(--ct-primary)' }}
      >
        확인
      </button>
      <button
        type="button"
        onClick={() => handleClick('alert_dismissed')}
        disabled={feedbackMutation.isPending}
        className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
        style={{ background: '#F5F5F3', color: 'var(--ct-text-secondary)' }}
      >
        무시
      </button>
      <button
        type="button"
        onClick={() => handleClick('alert_false_positive')}
        disabled={feedbackMutation.isPending}
        className="rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
        style={{ background: '#FEE2E2', color: 'var(--ct-danger)' }}
      >
        오알림
      </button>
    </div>
  );
}
