// 알림 에스컬레이션 대시보드 — 미확인 알림 관리

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as escalationApi from '@web/api/escalation.api';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { EmptyState } from '@web/components/common/EmptyState';

const LEVEL_LABELS: Record<number, string> = { 1: '농가주', 2: '수의사', 3: '방역관', 4: '긴급' };

export function EscalationDashboard(): React.JSX.Element {
  const queryClient = useQueryClient();

  const { data: records, isLoading } = useQuery({
    queryKey: ['escalation', 'unacknowledged'],
    queryFn: escalationApi.getUnacknowledgedAlerts,
    refetchInterval: 30 * 1000,
  });

  const { data: stats } = useQuery({
    queryKey: ['escalation', 'stats'],
    queryFn: escalationApi.getEscalationStats,
    staleTime: 60 * 1000,
  });

  const ackMutation = useMutation({
    mutationFn: (alertId: string) => escalationApi.acknowledgeAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['escalation'] });
    },
  });

  if (isLoading) return <LoadingSkeleton lines={5} />;

  return (
    <div className="space-y-4">
      {/* 통계 */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
            <p className="text-xs text-gray-500">미확인</p>
            <p className="text-2xl font-bold text-red-600">{stats.unacknowledged}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
            <p className="text-xs text-gray-500">총 에스컬레이션</p>
            <p className="text-2xl font-bold text-gray-800">{stats.totalEscalated}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
            <p className="text-xs text-gray-500">평균 응답 시간</p>
            <p className="text-2xl font-bold text-blue-600">{stats.avgResponseMinutes}분</p>
          </div>
        </div>
      )}

      {/* 미확인 목록 */}
      {(!records || records.length === 0) ? (
        <EmptyState message="미확인 알림이 없습니다." />
      ) : (
        <div className="space-y-2">
          {records.map((r) => (
            <div key={r.escalationId} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge label={r.severity === 'critical' ? '긴급' : r.severity === 'high' ? '높음' : '보통'} variant={r.severity === 'critical' ? 'critical' : r.severity === 'high' ? 'high' : 'medium'} />
                  <span className="text-sm font-medium text-gray-800">{r.alertTitle}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  Level {r.currentLevel} ({LEVEL_LABELS[r.currentLevel] ?? '?'}) · {r.escalatedAt}
                </p>
              </div>
              <button
                type="button"
                onClick={() => ackMutation.mutate(r.alertId)}
                disabled={ackMutation.isPending}
                className="rounded-md bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:opacity-50"
              >
                확인
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
