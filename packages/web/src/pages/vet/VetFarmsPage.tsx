// /vet/farms — 수의사 접근 가능 목장 목록 (1단계)
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { vetApi } from '@web/api/vet.api';
import { VetCard } from './vet-ui';

export default function VetFarmsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data: farms, isLoading, isError } = useQuery({
    queryKey: ['vet', 'farms'],
    queryFn: () => vetApi.listFarms(),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return farms ?? [];
    return (farms ?? []).filter(
      (f) => f.farm_name.toLowerCase().includes(q) || (f.owner_name ?? '').toLowerCase().includes(q),
    );
  }, [farms, search]);

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-1">
      <header className="space-y-1">
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>목장 진료 접근</h1>
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>진료할 목장을 선택하세요</p>
      </header>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="목장명 또는 목장주 검색"
        aria-label="목장 검색"
        className="w-full rounded-lg px-3 py-3 text-base"
        style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)' }}
      />

      {isLoading && <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>불러오는 중…</p>}
      {isError && <p className="text-sm" style={{ color: 'var(--ct-danger, #ef4444)' }}>목장 목록을 불러오지 못했습니다.</p>}

      <div className="space-y-2">
        {filtered.map((f) => (
          <button
            key={f.farm_id}
            onClick={() => navigate(`/vet/farms/${f.farm_id}/animals`)}
            className="w-full text-left"
          >
            <VetCard className="transition active:scale-[0.99]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold" style={{ color: 'var(--ct-text)' }}>{f.farm_name}</div>
                  <div className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                    {f.owner_name ?? '목장주 미상'}{f.address ? ` · ${f.address}` : ''}
                  </div>
                </div>
                <div className="text-right text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                  {f.current_head_count != null ? `${f.current_head_count}두` : ''} →
                </div>
              </div>
            </VetCard>
          </button>
        ))}
        {!isLoading && filtered.length === 0 && (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--ct-text-secondary)' }}>표시할 목장이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
