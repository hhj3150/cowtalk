// Decision Fusion 패널 — "이 신호가 발정인가? 질병인가? 열스트레스인가?" 시각화

import React, { useState } from 'react';
import { Badge } from '@web/components/common/Badge';
import { useSubmitFeedback } from '@web/hooks/useFeedback';

interface FusionEvent {
  readonly eventType: string;
  readonly severity: string;
  readonly detectedAt: string;
}

export interface FusionCandidate {
  readonly animalId: string;
  readonly events: readonly FusionEvent[];
  readonly primary: { readonly interpretation: string; readonly confidence: number };
  readonly secondary: { readonly interpretation: string; readonly confidence: number };
  readonly recommendedAction: string;
}

interface Props {
  readonly candidates: readonly FusionCandidate[];
}

const EVENT_LABELS: Record<string, string> = {
  health_warning: '건강 경고',
  temperature_warning: '체온 이상',
  drinking_warning: '음수 이상',
  rumination_warning: '반추 이상',
  activity_warning: '활동 이상',
  estrus: '발정',
  calving: '분만 징후',
};

const EVENT_SIGNALS: Record<string, string> = {
  health_warning: '건강↓',
  temperature_warning: '체온↑',
  drinking_warning: '음수↓',
  rumination_warning: '반추↓',
  activity_warning: '활동↑',
  estrus: '발정징후↑',
  calving: '분만징후↑',
};

export function FusionPanel({ candidates }: Props): React.JSX.Element {
  if (candidates.length === 0) return <></>;

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
        경합 해석 (Decision Fusion)
        <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ct-text-secondary)' }}>
          {candidates.length}개체 · 복수 이벤트 동시 감지
        </span>
      </h2>
      <div className="space-y-3">
        {candidates.map((candidate) => (
          <FusionCard key={candidate.animalId} candidate={candidate} />
        ))}
      </div>
    </div>
  );
}

function FusionCard({ candidate }: { readonly candidate: FusionCandidate }): React.JSX.Element {
  const feedbackMutation = useSubmitFeedback();
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);

  function handleFeedback(type: 'estrus_confirmed' | 'disease_confirmed' | 'alert_dismissed'): void {
    const labelMap: Record<string, string> = {
      estrus_confirmed: '발정 맞음',
      disease_confirmed: '질병이었음',
      alert_dismissed: '기타',
    };
    feedbackMutation.mutate({
      type,
      predictionId: null,
      alertId: null,
      animalId: candidate.animalId,
      farmId: candidate.events[0]?.eventType ?? '',
      notes: `Fusion feedback: ${labelMap[type]}`,
    });
    setFeedbackSent(labelMap[type] ?? type);
  }

  const uncertaintyPct = Math.max(0, 100 - candidate.primary.confidence - candidate.secondary.confidence);

  return (
    <div
      className="ct-card overflow-hidden"
      style={{ borderLeft: '3px solid var(--ct-primary)' }}
    >
      {/* 헤더: 동물번호 + 신호 요약 */}
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>
            개체 {candidate.animalId.slice(0, 8)}
          </span>
          <Badge label={`${candidate.events.length}개 이벤트`} variant="info" />
        </div>
        <span className="text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>
          {new Date(candidate.events[0]?.detectedAt ?? '').toLocaleString('ko-KR', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </div>

      {/* 감지 신호 태그 */}
      <div className="flex flex-wrap gap-1 px-4 pb-3">
        {candidate.events.map((evt, i) => (
          <span
            key={`${evt.eventType}-${i}`}
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: evt.severity === 'critical' ? '#FEE2E2' : '#FEF3C7',
              color: evt.severity === 'critical' ? 'var(--ct-danger)' : '#D97706',
            }}
          >
            {EVENT_SIGNALS[evt.eventType] ?? evt.eventType}
          </span>
        ))}
      </div>

      {/* 경합 해석 결과 바 */}
      <div className="px-4 pb-3">
        <div className="mb-2 flex h-5 w-full overflow-hidden rounded-full">
          <div
            className="flex items-center justify-center text-[10px] font-bold text-white transition-all"
            style={{
              width: `${candidate.primary.confidence}%`,
              background: 'var(--ct-primary)',
            }}
          >
            {candidate.primary.confidence}%
          </div>
          <div
            className="flex items-center justify-center text-[10px] font-bold transition-all"
            style={{
              width: `${candidate.secondary.confidence}%`,
              background: 'var(--ct-warning)',
              color: '#7C2D12',
            }}
          >
            {candidate.secondary.confidence}%
          </div>
          {uncertaintyPct > 0 && (
            <div
              className="flex items-center justify-center text-[10px] transition-all"
              style={{
                width: `${uncertaintyPct}%`,
                background: 'var(--ct-border)',
                color: 'var(--ct-text-secondary)',
              }}
            >
              {uncertaintyPct > 8 ? `${uncertaintyPct}%` : ''}
            </div>
          )}
        </div>

        {/* 해석 레이블 */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: 'var(--ct-primary)' }}
            />
            <span className="text-xs font-medium" style={{ color: 'var(--ct-primary)' }}>
              {candidate.primary.interpretation} ({candidate.primary.confidence}%)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: 'var(--ct-warning)' }}
            />
            <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
              {candidate.secondary.interpretation} ({candidate.secondary.confidence}%)
            </span>
          </div>
          {uncertaintyPct > 5 && (
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: 'var(--ct-border)' }}
              />
              <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                불확실 ({uncertaintyPct}%)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 근거 이벤트 */}
      <div className="border-t px-4 py-2" style={{ borderColor: 'var(--ct-border)' }}>
        <p className="mb-1 text-[10px] font-medium" style={{ color: 'var(--ct-text-secondary)' }}>
          근거 이벤트
        </p>
        <div className="flex flex-wrap gap-1">
          {candidate.events.map((evt, i) => (
            <span
              key={`ref-${evt.eventType}-${i}`}
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{ background: 'var(--ct-primary-light)', color: 'var(--ct-primary)' }}
            >
              {EVENT_LABELS[evt.eventType] ?? evt.eventType}
            </span>
          ))}
        </div>
      </div>

      {/* 권고 액션 + 피드백 */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--ct-ai-bg)' }}
      >
        <div className="flex items-center gap-2">
          <svg className="h-3.5 w-3.5" style={{ color: 'var(--ct-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="text-xs font-medium" style={{ color: 'var(--ct-primary)' }}>
            {candidate.recommendedAction}
          </span>
        </div>

        {feedbackSent ? (
          <span className="text-[10px]" style={{ color: 'var(--ct-success)' }}>
            ✓ {feedbackSent}
          </span>
        ) : (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => handleFeedback('estrus_confirmed')}
              disabled={feedbackMutation.isPending}
              className="rounded px-2 py-1 text-[10px] font-medium transition-colors"
              style={{ background: 'var(--ct-primary-light)', color: 'var(--ct-primary)' }}
            >
              발정 맞음
            </button>
            <button
              type="button"
              onClick={() => handleFeedback('disease_confirmed')}
              disabled={feedbackMutation.isPending}
              className="rounded px-2 py-1 text-[10px] font-medium transition-colors"
              style={{ background: '#FEE2E2', color: 'var(--ct-danger)' }}
            >
              질병이었음
            </button>
            <button
              type="button"
              onClick={() => handleFeedback('alert_dismissed')}
              disabled={feedbackMutation.isPending}
              className="rounded px-2 py-1 text-[10px] font-medium transition-colors"
              style={{ background: '#F5F5F3', color: 'var(--ct-text-secondary)' }}
            >
              기타
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
