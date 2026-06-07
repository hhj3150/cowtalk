// /vet/farms/:farmId/animals — 목장 내 개체 목록 (1단계)
import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { vetApi } from '@web/api/vet.api';
import { VetCard } from './vet-ui';

export default function VetFarmAnimalsPage(): React.JSX.Element {
  const navigate = useNavigate();
  const { farmId = '' } = useParams();
  const [search, setSearch] = useState('');

  const { data: animals, isLoading, isError } = useQuery({
    queryKey: ['vet', 'animals', farmId],
    queryFn: () => vetApi.listAnimals(farmId),
    enabled: !!farmId,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return animals ?? [];
    return (animals ?? []).filter(
      (a) => a.ear_tag_number.toLowerCase().includes(q)
        || (a.name ?? '').toLowerCase().includes(q)
        || (a.trace_id ?? '').toLowerCase().includes(q),
    );
  }, [animals, search]);

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-1">
      <header className="space-y-1">
        <Link to="/vet/farms" className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>← 목장 목록</Link>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>개체 목록</h1>
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>진료할 개체를 선택하세요</p>
      </header>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="이표번호 / 이름 / 이력번호 검색"
        aria-label="개체 검색"
        className="w-full rounded-lg px-3 py-3 text-base"
        style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)' }}
      />

      {isLoading && <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>불러오는 중…</p>}
      {isError && <p className="text-sm" style={{ color: 'var(--ct-danger, #ef4444)' }}>개체 목록을 불러오지 못했습니다.</p>}

      <div className="space-y-2">
        {filtered.map((a) => (
          <button
            key={a.animal_id}
            onClick={() => navigate(`/vet/farms/${farmId}/animals/${a.animal_id}/chart`)}
            className="w-full text-left"
          >
            <VetCard className="transition active:scale-[0.99]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold" style={{ color: 'var(--ct-text)' }}>
                    {a.ear_tag_number}{a.name ? ` · ${a.name}` : ''}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                    {a.breed} · {a.sex === 'female' ? '암' : a.sex === 'male' ? '수' : a.sex} · {a.parity}산
                    {a.days_in_milk != null ? ` · 착유 ${a.days_in_milk}일` : ''}
                  </div>
                </div>
                <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>진료 →</span>
              </div>
            </VetCard>
          </button>
        ))}
        {!isLoading && filtered.length === 0 && (
          <p className="py-6 text-center text-sm" style={{ color: 'var(--ct-text-secondary)' }}>표시할 개체가 없습니다.</p>
        )}
      </div>
    </div>
  );
}
