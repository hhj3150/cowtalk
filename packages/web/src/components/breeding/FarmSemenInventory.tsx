// 목장 보유 정액 관리 패널
// 목장 설정 또는 번식 관리 페이지에서 사용
// 보유 정액 목록 + 수량 표시 + 추가 기능

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFarmInventory, addFarmInventory, getSemenCatalog } from '@web/api/breeding.api';
import type { FarmSemenItem, SemenRecord } from '@web/api/breeding.api';

interface Props {
  readonly farmId: string;
}

export function FarmSemenInventory({ farmId }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [addQuantity, setAddQuantity] = useState(10);

  const { data: inventory, isLoading } = useQuery<readonly FarmSemenItem[]>({
    queryKey: ['farm-inventory', farmId],
    queryFn: () => getFarmInventory(farmId),
    staleTime: 30_000,
  });

  const { data: catalog } = useQuery<readonly SemenRecord[]>({
    queryKey: ['semen-catalog'],
    queryFn: () => getSemenCatalog(),
    enabled: showAdd,
    staleTime: 5 * 60 * 1000,
  });

  const addMutation = useMutation({
    mutationFn: () => addFarmInventory(farmId, { semenId: selectedCatalogId, quantity: addQuantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['farm-inventory', farmId] });
      setShowAdd(false);
      setSelectedCatalogId('');
      setAddQuantity(10);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: 'var(--ct-border)' }} />
        ))}
      </div>
    );
  }

  const items: readonly FarmSemenItem[] = inventory ?? [];

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>
          🧪 보유 정액 재고 ({items.length}종)
        </p>
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: 'var(--ct-primary)', color: '#fff' }}
        >
          {showAdd ? '취소' : '+ 정액 추가'}
        </button>
      </div>

      {/* 추가 폼 */}
      {showAdd && (
        <div
          className="rounded-lg p-3 space-y-2"
          style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)' }}
        >
          <select
            value={selectedCatalogId}
            onChange={(e) => setSelectedCatalogId(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-xs"
            style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
          >
            <option value="">정액 선택...</option>
            {(catalog ?? []).map((c) => (
              <option key={c.semenId} value={c.semenId}>
                {c.sireName} ({c.breed}) — {c.registrationNumber}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={addQuantity}
              onChange={(e) => setAddQuantity(Number(e.target.value))}
              className="w-24 rounded-lg border px-3 py-2 text-xs text-center"
              style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
            />
            <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>스트로</span>
            <button
              type="button"
              onClick={() => addMutation.mutate()}
              disabled={!selectedCatalogId || addMutation.isPending}
              className="ml-auto text-xs px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50"
              style={{ background: '#3b82f6' }}
            >
              {addMutation.isPending ? '추가 중...' : '추가'}
            </button>
          </div>
        </div>
      )}

      {/* 재고 목록 */}
      {items.length === 0 ? (
        <div className="text-center py-6" style={{ color: 'var(--ct-text-secondary)' }}>
          <p className="text-2xl mb-2">🧪</p>
          <p className="text-xs">등록된 보유 정액이 없습니다</p>
          <p className="text-xs mt-1">위의 "+ 정액 추가" 버튼으로 등록해주세요</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.inventoryId}
              className="flex items-center justify-between rounded-lg px-3 py-2.5"
              style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)' }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate" style={{ color: 'var(--ct-text)' }}>
                  {item.bullName}
                </p>
                <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                  {item.breed} · {item.bullRegistration ?? ''} {item.supplier ? `· ${item.supplier}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                <p className="text-sm font-bold" style={{ color: item.quantity <= 2 ? '#ef4444' : 'var(--ct-text)' }}>
                  {item.quantity}<span className="text-xs font-normal">스트로</span>
                </p>
                {item.quantity <= 2 && (
                  <p className="text-[10px] text-red-500">재고 부족</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
