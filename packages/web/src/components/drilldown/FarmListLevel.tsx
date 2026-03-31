// 드릴다운 1단계 — 농장 목록 (DB에서 실시간 로딩)

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import { useDrilldown } from '@web/hooks/useDrilldown';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { Badge } from '@web/components/common/Badge';

interface FarmRow {
  readonly farmId: string;
  readonly name: string;
  readonly currentHeadCount: number;
  readonly status: string;
  readonly ownerName: string;
  readonly regionProvince: string | null;
  readonly regionDistrict: string | null;
}

interface FarmsResponse {
  readonly farms?: readonly FarmRow[];
}

interface Props {
  readonly filter: string;
  readonly compact?: boolean;
  readonly activeFarmId?: string;
}

export function FarmListLevel({ filter, compact = false, activeFarmId }: Props): React.JSX.Element {
  const [search, setSearch] = useState('');
  const { navigateToFarm } = useDrilldown();

  const { data, isLoading } = useQuery({
    queryKey: ['drilldown', 'farms', filter],
    queryFn: () => apiGet<readonly FarmRow[] | FarmsResponse>('/farms', { limit: 100 }),
  });

  if (isLoading) return <LoadingSkeleton lines={compact ? 4 : 6} />;

  const farms: readonly FarmRow[] = Array.isArray(data) ? data : (data as FarmsResponse)?.farms ?? [];

  const filtered = search
    ? farms.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : farms;

  return (
    <div>
      {!compact && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>총 {farms.length}개 농장</span>
        </div>
      )}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="농장명 검색..."
        className={`${compact ? 'mb-2' : 'mb-3'} w-full rounded-lg border px-3 ${compact ? 'py-1.5 text-xs' : 'py-2 text-sm'} outline-none transition-colors`}
        style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)' }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--ct-primary)'; }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--ct-border)'; }}
      />
      <div className={`${compact ? 'space-y-1' : 'space-y-2'} ${compact ? '' : 'max-h-[55vh]'} overflow-y-auto`}>
        {filtered.map((farm) => {
          const isActive = activeFarmId === farm.farmId;
          return (
            <button
              key={farm.farmId}
              type="button"
              onClick={() => navigateToFarm(farm.farmId, farm.name)}
              className={`ct-card flex w-full items-center justify-between ${compact ? 'p-2' : 'p-3'} text-left transition-all`}
              style={isActive ? {
                borderColor: 'var(--ct-primary)',
                background: 'rgba(59,130,246,0.08)',
              } : undefined}
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-primary)'; }}
              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-border)'; }}
            >
              <div className="min-w-0 flex-1">
                <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium truncate`} style={{ color: isActive ? 'var(--ct-primary)' : 'var(--ct-text)' }}>
                  {farm.name}
                </p>
                {!compact && (
                  <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                    {farm.regionProvince && farm.regionDistrict
                      && !farm.regionProvince.toLowerCase().includes('smaxtec')
                      && !farm.regionDistrict.toLowerCase().includes('smaxtec')
                      ? `${farm.regionProvince} ${farm.regionDistrict} · `
                      : ''}
                    {farm.currentHeadCount}두
                  </p>
                )}
                {compact && (
                  <p className="text-[10px]" style={{ color: 'var(--ct-text-muted)' }}>
                    {farm.currentHeadCount}두
                  </p>
                )}
              </div>
              {!compact && (
                <div className="flex items-center gap-2">
                  <Badge
                    label={farm.status === 'active' ? '운영중' : farm.status}
                    variant={farm.status === 'active' ? 'success' : 'medium'}
                  />
                  <svg className="h-4 w-4" style={{ color: 'var(--ct-border)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              )}
              {compact && isActive && (
                <span style={{ color: 'var(--ct-primary)', fontSize: 10, flexShrink: 0 }}>●</span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className={`${compact ? 'py-4' : 'py-8'} text-center text-sm`} style={{ color: 'var(--ct-text-secondary)' }}>검색 결과가 없습니다.</p>
        )}
      </div>
    </div>
  );
}
