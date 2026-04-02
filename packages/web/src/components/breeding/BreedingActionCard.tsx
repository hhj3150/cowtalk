// 번식 액션 카드 — 원탭으로 수정기록·임신감정 완료
// UrgentCard 아래에 액션 버튼을 추가하는 확장 카드

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recordInsemination, recordPregnancyCheck } from '@web/api/breeding.api';
import type { BreedingUrgentAction } from '@cowtalk/shared';

interface Props {
  readonly action: BreedingUrgentAction;
  readonly onNavigate: (animalId: string) => void;
}

const ACTION_META: Readonly<Record<string, { label: string; icon: string; color: string; bg: string }>> = {
  inseminate_now:      { label: '즉시 수정 필요',   icon: '💉', color: '#dc2626', bg: 'rgba(220,38,38,0.06)' },
  pregnancy_check_due: { label: '임신감정 예정',    icon: '🔍', color: '#d97706', bg: 'rgba(217,119,6,0.06)' },
  calving_imminent:    { label: '분만 임박',         icon: '🐄', color: '#7c3aed', bg: 'rgba(124,58,237,0.06)' },
  repeat_breeder:      { label: '반복 미수태',       icon: '⚠️', color: '#ea580c', bg: 'rgba(234,88,12,0.06)' },
};

export function BreedingActionCard({ action, onNavigate }: Props): React.JSX.Element {
  const meta = ACTION_META[action.actionType] ?? ACTION_META.inseminate_now!;
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);

  const hoursLabel = action.hoursRemaining < 1
    ? `${Math.round(action.hoursRemaining * 60)}분 남음`
    : `${action.hoursRemaining.toFixed(0)}시간 남음`;

  const inseminationMutation = useMutation({
    mutationFn: () => recordInsemination({
      animalId: action.animalId,
      farmId: action.farmId,
      notes: '번식 커맨드센터에서 원탭 기록',
    }),
    onSuccess: () => {
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ['breeding-pipeline'] });
    },
  });

  const pregnancyCheckMutation = useMutation({
    mutationFn: (result: 'pregnant' | 'open') => recordPregnancyCheck({
      animalId: action.animalId,
      checkDate: new Date().toISOString(),
      result,
      method: 'ultrasound',
    }),
    onSuccess: () => {
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: ['breeding-pipeline'] });
    },
  });

  const isLoading = inseminationMutation.isPending || pregnancyCheckMutation.isPending;

  return (
    <div
      className="rounded-xl p-3 transition-all"
      style={{
        background: done ? 'rgba(22,163,74,0.06)' : meta.bg,
        border: `1.5px solid ${done ? 'rgba(22,163,74,0.3)' : `${meta.color}30`}`,
        opacity: done ? 0.7 : 1,
      }}
    >
      {/* 상단: 개체 정보 */}
      <button
        type="button"
        onClick={() => onNavigate(action.animalId)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg flex-shrink-0">{done ? '✅' : meta.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: done ? '#16a34a' : meta.color }}>
                #{action.earTag} — {action.farmName}
              </p>
              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--ct-text-secondary)' }}>
                {done ? '기록 완료' : action.description}
              </p>
            </div>
          </div>
          {!done && (
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: meta.color, color: '#fff' }}
            >
              {hoursLabel}
            </span>
          )}
        </div>
      </button>

      {/* 하단: 원탭 액션 버튼 */}
      {!done && (
        <div className="flex gap-2 mt-2.5 pt-2" style={{ borderTop: '1px solid var(--ct-border)' }}>
          {action.actionType === 'inseminate_now' && (
            <button
              type="button"
              disabled={isLoading}
              onClick={(e) => { e.stopPropagation(); inseminationMutation.mutate(); }}
              className="flex-1 text-xs font-semibold py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: '#dc2626', color: '#fff' }}
            >
              {isLoading ? '기록중...' : '💉 수정 완료'}
            </button>
          )}

          {action.actionType === 'pregnancy_check_due' && (
            <>
              <button
                type="button"
                disabled={isLoading}
                onClick={(e) => { e.stopPropagation(); pregnancyCheckMutation.mutate('pregnant'); }}
                className="flex-1 text-xs font-semibold py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: '#16a34a', color: '#fff' }}
              >
                {isLoading ? '기록중...' : '🤰 임신'}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={(e) => { e.stopPropagation(); pregnancyCheckMutation.mutate('open'); }}
                className="flex-1 text-xs font-semibold py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: '#6b7280', color: '#fff' }}
              >
                {isLoading ? '기록중...' : '⬜ 공태'}
              </button>
            </>
          )}

          {(action.actionType === 'repeat_breeder' || action.actionType === 'calving_imminent') && (
            <button
              type="button"
              onClick={() => onNavigate(action.animalId)}
              className="flex-1 text-xs font-semibold py-1.5 rounded-lg transition-opacity hover:opacity-80"
              style={{ background: 'var(--ct-surface)', color: meta.color, border: `1px solid ${meta.color}30` }}
            >
              상세 보기 →
            </button>
          )}
        </div>
      )}

      {/* 에러 표시 */}
      {(inseminationMutation.isError || pregnancyCheckMutation.isError) && (
        <p className="text-xs mt-1.5" style={{ color: '#dc2626' }}>
          기록 실패. 다시 시도해주세요.
        </p>
      )}
    </div>
  );
}
