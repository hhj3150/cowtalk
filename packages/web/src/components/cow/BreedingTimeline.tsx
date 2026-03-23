// 임신 관리 타임라인 — 수정 → 임신감정 → 재확인 → 건유전환 → 분만
// 수평 타임라인 바 + 현재 단계 하이라이트 + 다음 예정 알림

import React, { useEffect, useState } from 'react';
import { apiGet } from '@web/api/client';

interface TimelineEvent {
  readonly id: string;
  readonly type: string;
  readonly date: string;
  readonly label: string;
  readonly details: Record<string, unknown>;
}

interface NextAction {
  readonly stage: string;
  readonly dueDate: string;
  readonly daysRemaining: number;
  readonly message: string;
}

interface TimelineData {
  readonly animalId: string;
  readonly timeline: readonly TimelineEvent[];
  readonly currentStage: string;
  readonly nextAction: NextAction | null;
}

interface Props {
  readonly animalId: string;
}

const STAGE_CONFIG: readonly { key: string; label: string; icon: string }[] = [
  { key: 'insemination', label: '수정', icon: '💉' },
  { key: 'pregnancy_check', label: '임신 감정', icon: '🔍' },
  { key: 'recheck', label: '재확인', icon: '✅' },
  { key: 'dry_off', label: '건유 전환', icon: '🏖️' },
  { key: 'calving', label: '분만', icon: '🐣' },
];

const TYPE_COLORS: Readonly<Record<string, string>> = {
  estrus: '#a855f7',
  insemination: '#3b82f6',
  pregnancy_check: '#22c55e',
  dry_off: '#eab308',
  calving: '#ef4444',
};

export function BreedingTimeline({ animalId }: Props): React.JSX.Element {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<TimelineData>(`/animals/${animalId}/breeding-timeline`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [animalId]);

  if (loading) {
    return <div style={{ padding: 16, textAlign: 'center', color: 'var(--ct-text-muted)', fontSize: 12 }}>타임라인 로딩 중...</div>;
  }

  if (!data || data.timeline.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--ct-text-muted)', fontSize: 12 }}>
        번식 이력이 없습니다
      </div>
    );
  }

  // 현재 단계 인덱스 계산
  const stageMap: Readonly<Record<string, number>> = {
    post_insemination: 0, awaiting_pregnancy_check: 1,
    pregnant: 2, awaiting_dry_off: 3, dry: 3, calving: 4,
  };
  const currentStageIdx = stageMap[data.currentStage] ?? -1;

  return (
    <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '16px 18px' }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>
        📋 임신 관리 타임라인
      </h3>

      {/* 진행 바 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, padding: '0 8px' }}>
        {STAGE_CONFIG.map((stage, idx) => {
          const isCompleted = idx < currentStageIdx;
          const isCurrent = idx === currentStageIdx;
          const isFuture = idx > currentStageIdx;

          return (
            <React.Fragment key={stage.key}>
              {idx > 0 && (
                <div style={{
                  flex: 1, height: 3, borderRadius: 2,
                  background: isCompleted ? '#22c55e' : isCurrent ? 'var(--ct-primary)' : 'var(--ct-border)',
                }} />
              )}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                opacity: isFuture ? 0.4 : 1,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 14,
                  background: isCompleted ? '#22c55e' : isCurrent ? 'var(--ct-primary)' : 'var(--ct-border)',
                  color: isCompleted || isCurrent ? '#fff' : 'var(--ct-text-muted)',
                  boxShadow: isCurrent ? '0 0 0 4px rgba(59,130,246,0.3)' : 'none',
                  animation: isCurrent ? 'ctPulse 2s ease-in-out infinite' : 'none',
                }}>
                  {isCompleted ? '✓' : stage.icon}
                </div>
                <span style={{ fontSize: 9, color: isCurrent ? 'var(--ct-primary)' : 'var(--ct-text-muted)', fontWeight: isCurrent ? 700 : 400, whiteSpace: 'nowrap' }}>
                  {stage.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* 다음 예정 알림 */}
      {data.nextAction && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 12,
          background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ct-primary)', marginBottom: 2 }}>
            📌 {data.nextAction.stage} — {data.nextAction.dueDate}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ct-text-secondary)' }}>
            {data.nextAction.message}
          </div>
        </div>
      )}

      {/* 이벤트 목록 (최근 10건) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.timeline.slice(0, 10).map((event) => {
          const color = TYPE_COLORS[event.type] ?? 'var(--ct-text-muted)';
          const dateStr = event.date ? new Date(event.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '';

          return (
            <div key={event.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ minWidth: 60, color: 'var(--ct-text-muted)' }}>{dateStr}</span>
              <span style={{ color: 'var(--ct-text)' }}>{event.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
