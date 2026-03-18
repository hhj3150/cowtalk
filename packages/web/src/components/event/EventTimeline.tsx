// 이벤트 타임라인 — 개체/농장별 이벤트 이력 표시

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as eventApi from '@web/api/event.api';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly animalId?: string;
  readonly farmId?: string;
  readonly limit?: number;
}

const CATEGORY_BADGE: Record<string, { label: string; variant: 'info' | 'critical' | 'medium' | 'success' | 'high' }> = {
  breeding: { label: '번식', variant: 'medium' },
  health: { label: '건강', variant: 'critical' },
  management: { label: '관리', variant: 'info' },
  movement: { label: '이동', variant: 'high' },
  production_dairy: { label: '생산', variant: 'success' },
  production_beef: { label: '생산', variant: 'success' },
  feed: { label: '사료', variant: 'medium' },
  other: { label: '기타', variant: 'info' },
};

export function EventTimelineList({ animalId, farmId, limit = 20 }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['events', animalId ?? farmId, limit],
    queryFn: () => animalId
      ? eventApi.getAnimalEvents(animalId)
      : farmId
        ? eventApi.getFarmEvents(farmId, { limit })
        : Promise.resolve([]),
    enabled: Boolean(animalId || farmId),
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={4} />;
  if (!data?.length) return <p className="text-xs text-gray-400">기록된 이벤트가 없습니다.</p>;

  return (
    <div className="space-y-2">
      {data.slice(0, limit).map((event) => {
        const badge = CATEGORY_BADGE[event.category] ?? CATEGORY_BADGE.other!;
        return (
          <div key={event.eventId} className="flex items-start gap-3 rounded-md border border-gray-100 bg-white px-3 py-2">
            <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-blue-400" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge label={badge.label} variant={badge.variant} />
                <span className="text-sm font-medium text-gray-800">{event.eventTypeName}</span>
              </div>
              {event.animalId && <p className="text-xs text-gray-500">개체: {event.animalId}</p>}
              <p className="text-[10px] text-gray-400">{event.recordedAt} · {event.recordedBy}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
