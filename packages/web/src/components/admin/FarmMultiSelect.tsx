// 목장 다중 선택 — 계정 발급/배정 편집에서 "이 계정이 볼 수 있는 목장" 지정
// 검색 + 체크박스 목록. 선택된 목장은 상단에 칩으로 표시.

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';

interface FarmOption {
  readonly farmId: string;
  readonly name: string;
  readonly ownerName: string | null;
  readonly currentHeadCount: number;
  readonly regionProvince: string | null;
}

interface Props {
  readonly selected: readonly string[];
  readonly onChange: (farmIds: readonly string[]) => void;
}

export function FarmMultiSelect({ selected, onChange }: Props): React.JSX.Element {
  const [search, setSearch] = useState('');

  const { data: farmList, isLoading } = useQuery({
    queryKey: ['admin', 'farm-options'],
    queryFn: () => apiGet<readonly FarmOption[]>('/farms', { limit: 300 }),
    staleTime: 5 * 60 * 1000,
  });

  const farms = useMemo(() => farmList ?? [], [farmList]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return farms;
    return farms.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.ownerName ?? '').toLowerCase().includes(q) ||
        (f.regionProvince ?? '').toLowerCase().includes(q),
    );
  }, [farms, search]);

  const toggle = (farmId: string): void => {
    onChange(
      selectedSet.has(farmId) ? selected.filter((id) => id !== farmId) : [...selected, farmId],
    );
  };

  const selectedFarms = farms.filter((f) => selectedSet.has(f.farmId));

  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-700">
          담당 목장 배정 <span className="text-blue-600">{selected.length}개 선택</span>
        </span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-xs text-gray-400 hover:text-red-500">
            전체 해제
          </button>
        )}
      </div>

      {selectedFarms.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {selectedFarms.map((f) => (
            <span key={f.farmId} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
              {f.name}
              <button type="button" aria-label={`${f.name} 배정 해제`} onClick={() => toggle(f.farmId)} className="font-bold hover:text-red-500">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="목장명·목장주·지역으로 검색…"
        aria-label="목장 검색"
        className="mb-2 w-full rounded border px-3 py-1.5 text-sm"
      />

      <div className="max-h-48 overflow-y-auto rounded border bg-white">
        {isLoading ? (
          <div className="p-3 text-center text-xs text-gray-400">목장 목록 로딩 중…</div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-center text-xs text-gray-400">검색 결과가 없습니다</div>
        ) : (
          filtered.map((f) => (
            <label key={f.farmId} className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-sm last:border-0 hover:bg-blue-50">
              <input
                type="checkbox"
                checked={selectedSet.has(f.farmId)}
                onChange={() => toggle(f.farmId)}
              />
              <span className="flex-1">
                {f.name}
                <span className="ml-2 text-xs text-gray-400">
                  {f.regionProvince ?? ''} {f.ownerName ? `· ${f.ownerName}` : ''} · {f.currentHeadCount}두
                </span>
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
