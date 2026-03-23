// 방역관 당일 업무 큐 컴포넌트
// 우선순위별 자동 정렬 + 출동/전화/모니터링/완료 버튼

import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export type ActionType = 'legal_disease' | 'cluster_fever' | 'individual_fever' | 'scheduled';
export type ActionStatus = 'pending' | 'dispatched' | 'phone_confirmed' | 'monitoring' | 'completed';
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ActionQueueItem {
  readonly actionId: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly type: ActionType;
  readonly priority: ActionPriority;
  readonly title: string;
  readonly description: string;
  readonly status: ActionStatus;
  readonly createdAt: string;
}

const TYPE_LABEL: Record<ActionType, string> = {
  legal_disease: '법정전염병 의심',
  cluster_fever: '집단 발열',
  individual_fever: '개별 발열',
  scheduled: '정기 예찰',
};

const PRIORITY_DOT: Record<ActionPriority, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-slate-400',
};

const STATUS_LABEL: Record<ActionStatus, string> = {
  pending: '대기',
  dispatched: '출동 중',
  phone_confirmed: '전화 확인',
  monitoring: '모니터링',
  completed: '완료',
};

async function patchActionStatus(actionId: string, status: ActionStatus): Promise<void> {
  const res = await fetch(`/api/quarantine/action/${actionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('업무 상태 변경 실패');
}

interface Props {
  items: readonly ActionQueueItem[];
  isLoading?: boolean;
}

export function ActionQueue({ items, isLoading }: Props): React.JSX.Element {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ actionId, status }: { actionId: string; status: ActionStatus }) =>
      patchActionStatus(actionId, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quarantine', 'action-queue'] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: 'var(--ct-border)' }} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ background: 'var(--ct-bg)', color: 'var(--ct-text-secondary)' }}
      >
        <span className="text-3xl">✅</span>
        <p className="mt-2 font-medium">오늘 처리할 업무가 없습니다</p>
      </div>
    );
  }

  const pending = items.filter((i) => i.status !== 'completed');
  const completed = items.filter((i) => i.status === 'completed');

  return (
    <div className="space-y-2">
      {pending.map((item) => (
        <div
          key={item.actionId}
          className="rounded-xl border p-3"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${PRIORITY_DOT[item.priority]}`} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold" style={{ color: 'var(--ct-primary)' }}>
                    {TYPE_LABEL[item.type]}
                  </span>
                  <span className="text-xs px-1.5 rounded" style={{ background: 'var(--ct-border)', color: 'var(--ct-text-secondary)' }}>
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
                <p className="text-sm font-medium truncate mt-0.5" style={{ color: 'var(--ct-text)' }}>
                  {item.farmName}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
                  {item.title}
                </p>
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex shrink-0 gap-1.5">
              {item.status === 'pending' && (
                <>
                  <button
                    onClick={() => mutation.mutate({ actionId: item.actionId, status: 'dispatched' })}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white"
                    style={{ background: 'var(--ct-primary)' }}
                  >
                    출동
                  </button>
                  <button
                    onClick={() => mutation.mutate({ actionId: item.actionId, status: 'phone_confirmed' })}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold border"
                    style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
                  >
                    전화
                  </button>
                  <button
                    onClick={() => mutation.mutate({ actionId: item.actionId, status: 'monitoring' })}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold border"
                    style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
                  >
                    모니터링
                  </button>
                </>
              )}
              {item.status !== 'pending' && item.status !== 'completed' && (
                <button
                  onClick={() => mutation.mutate({ actionId: item.actionId, status: 'completed' })}
                  className="rounded-lg px-2.5 py-1 text-xs font-semibold border"
                  style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
                >
                  완료 ✓
                </button>
              )}
            </div>
          </div>
        </div>
      ))}

      {completed.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs cursor-pointer" style={{ color: 'var(--ct-text-secondary)' }}>
            완료된 업무 {completed.length}건
          </summary>
          <div className="mt-2 space-y-1.5">
            {completed.map((item) => (
              <div
                key={item.actionId}
                className="rounded-lg border px-3 py-2 opacity-50"
                style={{ borderColor: 'var(--ct-border)' }}
              >
                <p className="text-xs line-through" style={{ color: 'var(--ct-text-secondary)' }}>
                  {item.farmName} — {item.title}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
