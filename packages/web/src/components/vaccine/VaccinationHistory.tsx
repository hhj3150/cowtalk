// 백신 접종 이력 타임라인 — 공공데이터 + 로컬 DB 통합 표시

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAnimalVaccineHistory } from '@web/api/vaccine.api';
import type { PublicVaccination, LocalVaccineRecord, VaccineSchedule } from '@web/api/vaccine.api';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { EmptyState } from '@web/components/common/EmptyState';

interface Props {
  readonly animalId: string;
}

const STATUS_BADGE = {
  completed: { label: '완료', variant: 'success' as const },
  pending: { label: '예정', variant: 'medium' as const },
  overdue: { label: '미접종', variant: 'critical' as const },
} as const;

export function VaccinationHistory({ animalId }: Props): React.JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ['animal', 'vaccine-history', animalId],
    queryFn: () => getAnimalVaccineHistory(animalId),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(animalId),
  });

  if (isLoading) return <LoadingSkeleton lines={5} />;
  if (error) return <EmptyState message="백신 이력을 불러올 수 없습니다." />;
  if (!data) return <EmptyState message="데이터가 없습니다." />;

  const hasPublicVaccinations = data.publicData.vaccinations.length > 0;
  const hasLocalRecords = data.localRecords.length > 0;
  const hasSchedules = data.schedules.length > 0;
  const isEmpty = !hasPublicVaccinations && !hasLocalRecords && !hasSchedules;

  if (isEmpty) {
    return <EmptyState message="백신 접종 이력이 없습니다." />;
  }

  return (
    <div className="space-y-6">
      {/* 이력제 번호 표시 */}
      {data.traceId && (
        <div className="rounded-lg bg-blue-50 px-4 py-2 text-xs text-blue-700">
          이력번호: <span className="font-mono font-semibold">{data.traceId}</span>
          {data.earTag && <span className="ml-3">관리번호: {data.earTag}</span>}
        </div>
      )}

      {/* 공공데이터 백신접종 이력 */}
      {hasPublicVaccinations && (
        <PublicVaccinationSection vaccinations={data.publicData.vaccinations} />
      )}

      {/* 로컬 접종 기록 */}
      {hasLocalRecords && (
        <LocalRecordsSection records={data.localRecords} />
      )}

      {/* 접종 스케줄 */}
      {hasSchedules && (
        <ScheduleSection schedules={data.schedules} />
      )}
    </div>
  );
}

// ===========================
// 하위 컴포넌트
// ===========================

function PublicVaccinationSection({ vaccinations }: { readonly vaccinations: readonly PublicVaccination[] }): React.JSX.Element {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
        국가 접종 이력 (이력추적시스템)
      </h3>
      <div className="space-y-2">
        {vaccinations.map((v, idx) => (
          <div
            key={`pub-${String(idx)}`}
            className="flex items-center justify-between rounded-md border border-blue-100 bg-white px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                {v.order || String(idx + 1)}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {v.order ? `${v.order} 접종` : `${String(idx + 1)}차 접종`}
                </p>
                <p className="text-xs text-gray-500">{formatDate(v.date)}</p>
              </div>
            </div>
            <div className="text-right">
              <Badge label="접종완료" variant="success" />
              {v.daysSince && (
                <p className="mt-1 text-[10px] text-gray-400">{v.daysSince}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LocalRecordsSection({ records }: { readonly records: readonly LocalVaccineRecord[] }): React.JSX.Element {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
        CowTalk 접종 기록
      </h3>
      <div className="space-y-2">
        {records.map((r) => (
          <div
            key={r.recordId}
            className="flex items-center justify-between rounded-md border border-green-100 bg-white px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-gray-800">{r.vaccineName}</p>
              <p className="text-xs text-gray-500">
                {formatDate(r.administeredAt)}
                {r.batchNumber && ` · 로트: ${r.batchNumber}`}
              </p>
            </div>
            <Badge label="접종완료" variant="success" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleSection({ schedules }: { readonly schedules: readonly VaccineSchedule[] }): React.JSX.Element {
  const overdue = schedules.filter((s) => s.status === 'overdue');
  const pending = schedules.filter((s) => s.status === 'pending');
  const completed = schedules.filter((s) => s.status === 'completed');

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
        접종 스케줄
      </h3>

      {overdue.length > 0 && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="mb-2 text-xs font-semibold text-red-800">⚠️ 미접종 {overdue.length}건</p>
          {overdue.map((s) => (
            <ScheduleRow key={s.scheduleId} schedule={s} />
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map((s) => (
            <ScheduleRow key={s.scheduleId} schedule={s} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-gray-500">완료된 스케줄 ({completed.length}건)</summary>
          <div className="mt-2 space-y-1">
            {completed.map((s) => (
              <ScheduleRow key={s.scheduleId} schedule={s} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ScheduleRow({ schedule }: { readonly schedule: VaccineSchedule }): React.JSX.Element {
  const badge = STATUS_BADGE[schedule.status] ?? { label: schedule.status, variant: 'info' as const };
  return (
    <div className="flex items-center justify-between rounded border border-gray-100 bg-white px-3 py-2 text-xs">
      <span className="text-gray-700">{schedule.vaccineName}</span>
      <div className="flex items-center gap-2">
        <span className="text-gray-400">{formatDate(schedule.scheduledDate)}</span>
        <Badge label={badge.label} variant={badge.variant} />
      </div>
    </div>
  );
}

// ===========================
// 유틸
// ===========================

function formatDate(raw: string | null | undefined): string {
  if (!raw) return '-';
  const d = raw.replace(/\D/g, '');
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return raw.slice(0, 10);
}
