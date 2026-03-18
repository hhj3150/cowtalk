// 백신 스케줄러 페이지

import React from 'react';
import { useFarmStore } from '@web/stores/farm.store';
import { VaccineScheduler } from '@web/components/vaccine/VaccineScheduler';
import { VaccineCoverage } from '@web/components/vaccine/VaccineCoverage';
import { useAuthStore } from '@web/stores/auth.store';
import { EmptyState } from '@web/components/common/EmptyState';

export default function VaccineSchedulerPage(): React.JSX.Element {
  const farmId = useFarmStore((s) => s.selectedFarmId);
  const role = useAuthStore((s) => s.user?.role);
  const tenantId = useAuthStore((s) => s.user?.tenantId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">백신 관리</h1>

      {farmId ? (
        <VaccineScheduler farmId={farmId} />
      ) : (
        <EmptyState message="농장을 선택해 주세요." />
      )}

      {(role === 'quarantine_officer' || role === 'government_admin') && tenantId && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">지역 접종률</h2>
          <VaccineCoverage regionId={tenantId} />
        </div>
      )}
    </div>
  );
}
