// 수정 동선 패널 — 최적 방문 순서 + 거리 + 예상 시간
// 목장 간 이동 순서를 시각적으로 표시

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import { useDrilldown } from '@web/hooks/useDrilldown';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { Badge } from '@web/components/common/Badge';

interface RouteStop {
  readonly order: number;
  readonly farmId: string;
  readonly farmName: string;
  readonly address: string;
  readonly estrusCount: number;
  readonly nowCount: number;
  readonly distanceFromPrev: number;
  readonly cumulativeDistance: number;
}

interface EstrusRouteResponse {
  readonly totalStops: number;
  readonly totalDistanceKm: number;
  readonly estimatedMinutes: number;
  readonly stops: readonly RouteStop[];
}

export function EstrusRoutePanel(): React.JSX.Element {
  const { navigateToFarm } = useDrilldown();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'estrus-route'],
    queryFn: () => apiGet<EstrusRouteResponse>('/dashboard/estrus-route'),
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingSkeleton lines={4} />;

  const route = data;
  if (!route || route.totalStops === 0) {
    return (
      <div className="ct-card p-4 text-center">
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
          현재 방문할 목장이 없습니다.
        </p>
      </div>
    );
  }

  const hours = Math.floor(route.estimatedMinutes / 60);
  const mins = route.estimatedMinutes % 60;

  return (
    <div>
      {/* 요약 카드 */}
      <div
        className="mb-4 rounded-xl p-4"
        style={{ background: 'var(--ct-primary-light)', border: '1px solid var(--ct-primary)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <svg className="h-5 w-5" style={{ color: 'var(--ct-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          </svg>
          <span className="text-sm font-bold" style={{ color: 'var(--ct-primary)' }}>오늘의 수정 동선</span>
        </div>
        <div className="flex gap-6">
          <RouteStatItem value={String(route.totalStops)} label="방문 목장" />
          <RouteStatItem value={`${route.totalDistanceKm}km`} label="총 이동거리" />
          <RouteStatItem value={hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`} label="예상 소요" />
        </div>
      </div>

      {/* 경로 스텝 */}
      <div className="relative">
        {route.stops.map((stop, idx) => {
          const isLast = idx === route.stops.length - 1;
          return (
            <div key={stop.farmId} className="flex gap-3 mb-0">
              {/* 타임라인 */}
              <div className="flex flex-col items-center" style={{ width: 28 }}>
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: stop.nowCount > 0 ? 'var(--ct-danger)' : 'var(--ct-primary)',
                    color: '#ffffff',
                  }}
                >
                  {stop.order}
                </div>
                {!isLast && (
                  <div className="flex-1 w-px my-1" style={{ background: 'var(--ct-border)', minHeight: 24 }} />
                )}
              </div>

              {/* 내용 */}
              <div className="flex-1 pb-3">
                <button
                  type="button"
                  onClick={() => navigateToFarm(stop.farmId, stop.farmName)}
                  className="ct-card flex w-full items-center justify-between p-3 text-left transition-all hover:bg-[#FAFAF8]"
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-primary)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-border)'; }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--ct-text)' }}>{stop.farmName}</p>
                    <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                      {stop.address.length > 35 ? `${stop.address.slice(0, 35)}...` : stop.address}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {stop.nowCount > 0 && <Badge label={`NOW ${stop.nowCount}`} variant="critical" />}
                    <span className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>
                      {stop.estrusCount}두
                    </span>
                    <svg className="h-4 w-4" style={{ color: 'var(--ct-border)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                </button>

                {/* 다음 목장까지 거리 */}
                {!isLast && stop.distanceFromPrev > 0 && (
                  <p className="mt-1 text-[10px] pl-3" style={{ color: 'var(--ct-text-secondary)' }}>
                    ↓ {route.stops[idx + 1]?.distanceFromPrev ?? 0}km 이동
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RouteStatItem({ value, label }: { readonly value: string; readonly label: string }): React.JSX.Element {
  return (
    <div>
      <p className="text-lg font-bold" style={{ color: 'var(--ct-text)' }}>{value}</p>
      <p className="text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>{label}</p>
    </div>
  );
}
