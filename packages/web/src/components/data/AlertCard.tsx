// 알림 카드 — CowTalk 디자인 시스템, hover 배경 변경

import React from 'react';
import { Badge, severityToBadgeVariant } from '@web/components/common/Badge';
import { QuickFeedback } from '@web/components/feedback/QuickFeedback';

interface Props {
  readonly alertId: string;
  readonly title: string;
  readonly message: string;
  readonly severity: string;
  readonly type: string;
  readonly animalId: string | null;
  readonly farmId: string;
  readonly createdAt: string;
  readonly onAnimalClick?: (animalId: string) => void;
}

export function AlertCard({
  alertId,
  title,
  message,
  severity,
  type: _type,
  animalId,
  farmId,
  createdAt,
  onAnimalClick,
}: Props): React.JSX.Element {
  const timeStr = new Date(createdAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className="ct-card p-4 transition-colors hover:bg-[#FAFAF8]"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge label={severity} variant={severityToBadgeVariant(severity)} />
            <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{timeStr}</span>
          </div>
          <h4 className="mt-1.5 text-sm font-medium" style={{ color: 'var(--ct-text)' }}>{title}</h4>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{message}</p>
          {animalId && onAnimalClick && (
            <button
              type="button"
              onClick={() => onAnimalClick(animalId)}
              className="mt-1 text-xs font-medium hover:underline"
              style={{ color: 'var(--ct-primary)' }}
            >
              개체 상세 보기
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--ct-border)' }}>
        <QuickFeedback alertId={alertId} farmId={farmId} />
      </div>
    </div>
  );
}
