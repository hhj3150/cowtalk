// 분만 관리 페이지

import React from 'react';
import { useFarmStore } from '@web/stores/farm.store';
import { CalvingWorkflow } from '@web/components/calving/CalvingWorkflow';
import { EmptyState } from '@web/components/common/EmptyState';

export default function CalvingPage(): React.JSX.Element {
  const farmId = useFarmStore((s) => s.selectedFarmId);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">분만 관리</h1>
      {farmId ? (
        <CalvingWorkflow farmId={farmId} />
      ) : (
        <EmptyState message="농장을 선택해 주세요." />
      )}
    </div>
  );
}
