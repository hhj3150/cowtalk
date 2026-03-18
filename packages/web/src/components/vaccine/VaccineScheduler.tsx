// 백신 스케줄러 — 농장별 접종 계획

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as vaccineApi from '@web/api/vaccine.api';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { EmptyState } from '@web/components/common/EmptyState';

interface Props {
  readonly farmId: string;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'medium' | 'critical' }> = {
  completed: { label: '완료', variant: 'success' },
  pending: { label: '예정', variant: 'medium' },
  overdue: { label: '미접종', variant: 'critical' },
};

export function VaccineScheduler({ farmId }: Props): React.JSX.Element {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['vaccines', 'schedule', farmId],
    queryFn: () => vaccineApi.getFarmVaccineSchedule(farmId),
    staleTime: 5 * 60 * 1000,
  });

  const recordMutation = useMutation({
    mutationFn: (record: vaccineApi.VaccineRecord) => vaccineApi.recordVaccination(record),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vaccines', 'schedule', farmId] });
    },
  });

  if (isLoading) return <LoadingSkeleton lines={5} />;
  if (!data?.length) return <EmptyState message="백신 접종 계획이 없습니다." />;

  const overdue = data.filter((v) => v.status === 'overdue');
  const pending = data.filter((v) => v.status === 'pending');
  const completed = data.filter((v) => v.status === 'completed');

  return (
    <div className="space-y-4">
      {/* 미접종 경고 */}
      {overdue.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-800">미접종 {overdue.length}건</p>
          <div className="mt-2 space-y-1">
            {overdue.map((v) => (
              <div key={v.scheduleId} className="flex items-center justify-between text-xs">
                <span className="text-red-700">{v.vaccineName} — {v.animalId}</span>
                <span className="text-red-500">예정: {v.scheduledDate}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 예정 목록 */}
      {pending.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">접종 예정 ({pending.length})</h3>
          <div className="space-y-2">
            {pending.map((v) => {
              const badge = STATUS_BADGE[v.status]!;
              return (
                <div key={v.scheduleId} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{v.vaccineName}</p>
                    <p className="text-xs text-gray-400">개체: {v.animalId} · 예정일: {v.scheduledDate}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge label={badge.label} variant={badge.variant} />
                    <button
                      type="button"
                      onClick={() => recordMutation.mutate({
                        animalId: v.animalId,
                        vaccineName: v.vaccineName,
                        manufacturer: null,
                        lotNumber: null,
                        dosageMl: 0,
                        administeredDate: new Date().toISOString().split('T')[0]!,
                      })}
                      disabled={recordMutation.isPending}
                      className="rounded bg-green-100 px-2 py-1 text-xs text-green-700 hover:bg-green-200"
                    >
                      접종 완료
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 완료 목록 */}
      {completed.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">접종 완료 ({completed.length})</h3>
          <div className="space-y-1">
            {completed.slice(0, 10).map((v) => (
              <div key={v.scheduleId} className="flex items-center justify-between rounded bg-gray-50 px-4 py-2 text-xs">
                <span className="text-gray-600">{v.vaccineName} — {v.animalId}</span>
                <span className="text-gray-400">{v.completedDate}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
