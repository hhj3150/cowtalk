// 드릴다운 2단계 — 농장 내 동물 목록

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import { useDrilldown } from '@web/hooks/useDrilldown';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { Badge } from '@web/components/common/Badge';

interface AnimalRow {
  readonly animalId: string;
  readonly earTag: string;
  readonly name: string;
  readonly breed: string;
  readonly status: string;
  readonly birthDate: string | null;
  readonly currentDeviceId: string | null;
}

interface AnimalsResponse {
  readonly animals?: readonly AnimalRow[];
}

interface Props {
  readonly farmId: string;
}

export function AnimalListLevel({ farmId }: Props): React.JSX.Element {
  const [search, setSearch] = useState('');
  const { navigateToAnimal } = useDrilldown();

  const { data, isLoading } = useQuery({
    queryKey: ['drilldown', 'animals', farmId],
    queryFn: () => apiGet<readonly AnimalRow[] | AnimalsResponse>('/animals', { farmId, limit: 100 }),
  });

  if (isLoading) return <LoadingSkeleton lines={6} />;

  const animals: readonly AnimalRow[] = Array.isArray(data) ? data : (data as AnimalsResponse)?.animals ?? [];

  const filtered = search
    ? animals.filter((a) =>
        a.earTag.toLowerCase().includes(search.toLowerCase()) ||
        a.name.toLowerCase().includes(search.toLowerCase()),
      )
    : animals;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>총 {animals.length}마리</span>
      </div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="이름 또는 귀표번호 검색..."
        className="mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
        style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)' }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--ct-primary)'; }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--ct-border)'; }}
      />
      <div className="space-y-2 max-h-[55vh] overflow-y-auto">
        {filtered.map((animal) => (
          <button
            key={animal.animalId}
            type="button"
            onClick={() => navigateToAnimal(animal.animalId, animal.earTag)}
            className="ct-card flex w-full items-center justify-between p-3 text-left transition-all hover:bg-[#FAFAF8]"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-primary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-border)'; }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                style={animal.currentDeviceId
                  ? { background: 'var(--ct-primary-light)', color: 'var(--ct-primary)' }
                  : { background: '#F5F5F3', color: 'var(--ct-text-secondary)' }
                }
              >
                {animal.currentDeviceId ? '📡' : '—'}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--ct-text)' }}>
                  {animal.earTag}
                  {animal.name && <span className="ml-1" style={{ color: 'var(--ct-text-secondary)' }}>({animal.name})</span>}
                </p>
                <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{animal.breed} · {animal.status}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {animal.currentDeviceId && (
                <Badge label="센서" variant="success" />
              )}
              <svg className="h-4 w-4" style={{ color: 'var(--ct-border)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: 'var(--ct-text-secondary)' }}>검색 결과가 없습니다.</p>
        )}
      </div>
    </div>
  );
}
