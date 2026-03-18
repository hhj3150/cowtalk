// 이벤트 기록 페이지

import React from 'react';
import { useFarmStore } from '@web/stores/farm.store';
import { EventRecorder } from '@web/components/event/EventRecorder';
import { EventTimelineList } from '@web/components/event/EventTimeline';
import { EmptyState } from '@web/components/common/EmptyState';

export default function EventRecorderPage(): React.JSX.Element {
  const farmId = useFarmStore((s) => s.selectedFarmId);

  if (!farmId) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-900">이벤트 기록</h1>
        <EmptyState message="농장을 선택해 주세요." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">이벤트 기록</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <EventRecorder farmId={farmId} />
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">최근 기록</h2>
          <EventTimelineList farmId={farmId} limit={15} />
        </div>
      </div>
    </div>
  );
}
