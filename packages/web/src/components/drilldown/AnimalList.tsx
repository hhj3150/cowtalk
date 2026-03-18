// 동물 목록 — 검색/필터, 상태별

import React, { useState } from 'react';
import { useDrilldown } from '@web/hooks/useDrilldown';
import { Badge, severityToBadgeVariant } from '@web/components/common/Badge';

interface AnimalItem {
  readonly animalId: string;
  readonly earTag: string;
  readonly breed: string;
  readonly status: string;
  readonly severity?: string;
  readonly latestTemperature: number | null;
}

interface Props {
  readonly animals: readonly AnimalItem[];
}

const STATUS_LABELS: Record<string, string> = {
  normal: '정상',
  estrus: '발정',
  health_risk: '건강이상',
  calving_soon: '분만임박',
};

export function AnimalList({ animals }: Props): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { navigateToDetail } = useDrilldown();

  const filtered = animals.filter((a) => {
    if (search && !a.earTag.includes(search)) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="귀표번호 검색..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="all">전체</option>
          <option value="normal">정상</option>
          <option value="estrus">발정</option>
          <option value="health_risk">건강이상</option>
          <option value="calving_soon">분만임박</option>
        </select>
      </div>

      <div className="space-y-2">
        {filtered.map((animal) => (
          <button
            key={animal.animalId}
            type="button"
            onClick={() => navigateToDetail(animal.animalId, animal.earTag)}
            className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white p-3 text-left hover:border-blue-300 hover:shadow-sm"
          >
            <div>
              <p className="text-sm font-medium text-gray-900">#{animal.earTag}</p>
              <p className="text-xs text-gray-500">{animal.breed}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                label={STATUS_LABELS[animal.status] ?? animal.status}
                variant={animal.severity ? severityToBadgeVariant(animal.severity) : 'normal'}
              />
              {animal.latestTemperature !== null && (
                <span className="text-xs text-gray-400">{animal.latestTemperature}°C</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
