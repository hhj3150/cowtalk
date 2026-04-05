// 역할별 피드백 버튼

import React from 'react';
import { useAuthStore } from '@web/stores/auth.store';
import { useSubmitFeedback } from '@web/hooks/useFeedback';
import type { FeedbackType } from '@web/api/feedback.api';
import type { Role } from '@cowtalk/shared';

interface Props {
  readonly animalId: string | null;
  readonly farmId: string;
  readonly predictionId?: string | null;
}

interface FeedbackOption {
  readonly label: string;
  readonly type: FeedbackType;
  readonly color: string;
}

const ROLE_FEEDBACK: Record<Role, readonly FeedbackOption[]> = {
  farmer: [
    { label: '발정 확인', type: 'estrus_confirmed', color: 'bg-pink-50 text-pink-700 hover:bg-pink-100' },
    { label: '오알림', type: 'estrus_false_positive', color: 'bg-gray-50 text-gray-600 hover:bg-gray-100' },
    { label: '교배 완료', type: 'insemination_done', color: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
  ],
  veterinarian: [
    { label: '질병 확진', type: 'disease_confirmed', color: 'bg-red-50 text-red-700 hover:bg-red-100' },
    { label: '질병 배제', type: 'disease_excluded', color: 'bg-green-50 text-green-700 hover:bg-green-100' },
    { label: '치료 반응', type: 'treatment_response', color: 'bg-blue-50 text-blue-700 hover:bg-blue-100' },
    { label: '처방 완료', type: 'action_accepted', color: 'bg-teal-50 text-teal-700 hover:bg-teal-100' },
  ],
  government_admin: [
    { label: '확인함', type: 'alert_acknowledged', color: 'bg-[var(--ct-primary-light)] text-[var(--ct-primary)] hover:opacity-80' },
    { label: '불필요', type: 'alert_dismissed', color: 'bg-gray-50 text-gray-600 hover:bg-gray-100' },
  ],
  quarantine_officer: [
    { label: '역학조사 실시', type: 'disease_confirmed', color: 'bg-red-50 text-red-700 hover:bg-red-100' },
    { label: '오경보', type: 'alert_false_positive', color: 'bg-gray-50 text-gray-600 hover:bg-gray-100' },
  ],
};

export function FeedbackButtons({ animalId, farmId, predictionId }: Props): React.JSX.Element {
  const role = useAuthStore((s) => s.user?.role) ?? 'farmer';
  const feedbackMutation = useSubmitFeedback();
  const options = ROLE_FEEDBACK[role];

  if (options.length === 0) return <></>;

  function handleClick(type: FeedbackType): void {
    feedbackMutation.mutate({
      type,
      predictionId: predictionId ?? null,
      alertId: null,
      animalId,
      farmId,
      notes: null,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((opt) => (
        <button
          key={opt.type}
          type="button"
          onClick={() => handleClick(opt.type)}
          disabled={feedbackMutation.isPending}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${opt.color} disabled:opacity-50`}
        >
          {opt.label}
        </button>
      ))}
      {feedbackMutation.isSuccess && (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium animate-[feedbackSuccess_0.3s_ease-in-out]"
          style={{ color: 'var(--ct-success)' }}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          전송됨
        </span>
      )}
    </div>
  );
}
