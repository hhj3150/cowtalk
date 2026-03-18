// 혈통 트리 시각화 — 3대

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import * as breedingApi from '@web/api/breeding.api';
import type { PedigreeNode } from '@web/api/breeding.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly animalId: string;
}

function PedigreeCard({ node, label }: { node: PedigreeNode | null; label: string }): React.JSX.Element {
  if (!node) {
    return (
      <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-2 text-center">
        <p className="text-[10px] text-gray-400">{label}</p>
        <p className="text-xs text-gray-300">정보 없음</p>
      </div>
    );
  }
  return (
    <div className="rounded border border-gray-200 bg-white p-2 text-center shadow-sm">
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className="text-xs font-medium text-gray-900">{node.name ?? '미등록'}</p>
      {node.registrationNumber && (
        <p className="text-[10px] text-gray-500">{node.registrationNumber}</p>
      )}
    </div>
  );
}

export function PedigreeTree({ animalId }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['breeding', 'pedigree', animalId],
    queryFn: () => breedingApi.getPedigree(animalId),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={4} />;
  if (!data) return <div className="text-xs text-gray-400">혈통 정보가 없습니다.</div>;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-900">혈통 (3대)</h4>
      <div className="grid gap-2">
        {/* 본 개체 */}
        <div className="flex justify-center">
          <PedigreeCard node={data} label="본 개체" />
        </div>

        {/* 부모 */}
        <div className="grid grid-cols-2 gap-2">
          <PedigreeCard node={data.sire} label="부(Sire)" />
          <PedigreeCard node={data.dam} label="모(Dam)" />
        </div>

        {/* 조부모 */}
        <div className="grid grid-cols-4 gap-1">
          <PedigreeCard node={data.sire?.sire ?? null} label="조부" />
          <PedigreeCard node={data.sire?.dam ?? null} label="조모" />
          <PedigreeCard node={data.dam?.sire ?? null} label="외조부" />
          <PedigreeCard node={data.dam?.dam ?? null} label="외조모" />
        </div>
      </div>
    </div>
  );
}
