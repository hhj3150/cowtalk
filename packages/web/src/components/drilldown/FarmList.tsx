// 농장 목록 — 검색/필터, 그룹 내 농장

import React, { useState } from 'react';
import { useDrilldown } from '@web/hooks/useDrilldown';
import { Badge } from '@web/components/common/Badge';

interface FarmItem {
  readonly farmId: string;
  readonly name: string;
  readonly totalAnimals: number;
  readonly activeAlerts: number;
  readonly healthScore: number | null;
}

interface Props {
  readonly farms: readonly FarmItem[];
}

export function FarmList({ farms }: Props): React.JSX.Element {
  const [search, setSearch] = useState('');
  const { navigateToFarm } = useDrilldown();

  const filtered = search
    ? farms.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : farms;

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="농장 검색..."
        className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
      <div className="space-y-2">
        {filtered.map((farm) => (
          <button
            key={farm.farmId}
            type="button"
            onClick={() => navigateToFarm(farm.farmId, farm.name)}
            className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-blue-300 hover:shadow-sm"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">{farm.name}</p>
              <p className="text-xs text-gray-500">{farm.totalAnimals}두</p>
            </div>
            <div className="flex items-center gap-2">
              {farm.activeAlerts > 0 && (
                <Badge
                  label={`알림 ${farm.activeAlerts}`}
                  variant={farm.activeAlerts >= 3 ? 'high' : 'medium'}
                />
              )}
              {farm.healthScore !== null && (
                <span className="text-xs text-gray-400">{farm.healthScore}점</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
