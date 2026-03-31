// 발정 드릴다운 1단계 — 발정소가 있는 목장별 그룹 목록
// 각 목장의 NOW/SOON/WATCH 두수 표시, 클릭 시 목장 내 발정 개체로 이동

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import { useDrilldown } from '@web/hooks/useDrilldown';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { Badge } from '@web/components/common/Badge';

interface EstrusFarmGroup {
  readonly farmId: string;
  readonly farmName: string;
  readonly address: string;
  readonly nowCount: number;
  readonly soonCount: number;
  readonly watchCount: number;
  readonly totalEstrus: number;
}

interface EstrusByFarmResponse {
  readonly todayTotal: number;
  readonly farmGroups: readonly EstrusFarmGroup[];
}

export function EstrusFarmListLevel({ compact: _compact }: { readonly compact?: boolean } = {}): React.JSX.Element {
  const [search, setSearch] = useState('');
  const { navigateToFarm } = useDrilldown();

  const { data, isLoading } = useQuery({
    queryKey: ['drilldown', 'estrus-by-farm'],
    queryFn: () => apiGet<EstrusByFarmResponse>('/dashboard/estrus-by-farm'),
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingSkeleton lines={6} />;

  const farmGroups = data?.farmGroups ?? [];
  const todayTotal = data?.todayTotal ?? 0;

  const filtered = search
    ? farmGroups.filter((f) => f.farmName.toLowerCase().includes(search.toLowerCase()))
    : farmGroups;

  return (
    <div>
      {/* 헤더 요약 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
            발정 감지 총 {todayTotal}두
          </span>
          <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
            {farmGroups.length}개 목장
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StageDot color="var(--ct-danger)" label="NOW" />
          <StageDot color="var(--ct-warning)" label="SOON" />
          <StageDot color="var(--ct-info)" label="WATCH" />
        </div>
      </div>

      {/* 검색 */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="목장명 검색..."
        className="mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
        style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)' }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--ct-primary)'; }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--ct-border)'; }}
      />

      {/* 목장 목록 */}
      <div className="space-y-2 max-h-[55vh] overflow-y-auto">
        {filtered.map((farm) => (
          <button
            key={farm.farmId}
            type="button"
            onClick={() => navigateToFarm(farm.farmId, farm.farmName)}
            className="ct-card flex w-full items-center justify-between p-3 text-left transition-all hover:bg-[#FAFAF8]"
            style={{
              borderLeft: farm.nowCount > 0
                ? '3px solid var(--ct-danger)'
                : farm.soonCount > 0
                  ? '3px solid var(--ct-warning)'
                  : '3px solid var(--ct-info)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-primary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-border)'; }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--ct-text)' }}>{farm.farmName}</p>
              <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                {farm.address.length > 30 ? `${farm.address.slice(0, 30)}...` : farm.address}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {farm.nowCount > 0 && (
                <Badge label={`NOW ${farm.nowCount}`} variant="critical" />
              )}
              {farm.soonCount > 0 && (
                <Badge label={`SOON ${farm.soonCount}`} variant="high" />
              )}
              {farm.watchCount > 0 && (
                <Badge label={`WATCH ${farm.watchCount}`} variant="info" />
              )}
              <svg className="h-4 w-4" style={{ color: 'var(--ct-border)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
            {search ? '검색 결과가 없습니다.' : '현재 발정 감지된 소가 없습니다.'}
          </p>
        )}
      </div>
    </div>
  );
}

function StageDot({ color, label }: { readonly color: string; readonly label: string }): React.JSX.Element {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>{label}</span>
    </span>
  );
}
