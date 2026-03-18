// 육종/번식 프로그램 페이지

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as breedingApi from '@web/api/breeding.api';
import { PedigreeTree } from '@web/components/breeding/PedigreeTree';
import { SemenRecommendation } from '@web/components/breeding/SemenRecommendation';
import { InbreedingGauge } from '@web/components/breeding/InbreedingGauge';
import { DataTable, type Column } from '@web/components/data/DataTable';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { EmptyState } from '@web/components/common/EmptyState';

type Tab = 'catalog' | 'recommend' | 'pedigree';

const semenColumns: readonly Column<Record<string, unknown>>[] = [
  { key: 'sireName', label: '종모우', sortable: true },
  { key: 'breed', label: '품종', sortable: true },
  { key: 'a2Status', label: 'A2 유전자형', sortable: true },
  { key: 'milkYieldEbv', label: '유량 EBV', sortable: true },
  { key: 'stockCount', label: '재고', sortable: true },
];

export default function BreedingProgramPage(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('catalog');
  const [selectedAnimalId, setSelectedAnimalId] = useState<string>('');

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">육종 프로그램</h1>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'catalog' as Tab, label: '정액 카탈로그' },
          { key: 'recommend' as Tab, label: '교배 추천' },
          { key: 'pedigree' as Tab, label: '혈통 검색' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 정액 카탈로그 */}
      {tab === 'catalog' && <SemenCatalog />}

      {/* 교배 추천 */}
      {tab === 'recommend' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={selectedAnimalId}
              onChange={(e) => setSelectedAnimalId(e.target.value)}
              placeholder="동물 ID 입력..."
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {}}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              추천 조회
            </button>
          </div>
          {selectedAnimalId && (
            <div className="grid gap-4 lg:grid-cols-2">
              <SemenRecommendation animalId={selectedAnimalId} />
              <InbreedingGauge coefficient={0.021} />
            </div>
          )}
        </div>
      )}

      {/* 혈통 검색 */}
      {tab === 'pedigree' && (
        <div className="space-y-4">
          <input
            type="text"
            value={selectedAnimalId}
            onChange={(e) => setSelectedAnimalId(e.target.value)}
            placeholder="이력번호 또는 동물 ID..."
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {selectedAnimalId && (
            <PedigreeTree animalId={selectedAnimalId} />
          )}
        </div>
      )}
    </div>
  );
}

function SemenCatalog(): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['breeding', 'semen'],
    queryFn: () => breedingApi.getSemenCatalog(),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={5} />;
  if (!data?.length) return <EmptyState message="정액 카탈로그가 비어있습니다." />;

  return (
    <DataTable
      columns={semenColumns}
      data={data as unknown as readonly Record<string, unknown>[]}
      keyField="semenId"
      searchField="sireName"
      searchPlaceholder="종모우 검색..."
    />
  );
}
