// 통합 대시보드 — 농장 필터 드롭다운

import React from 'react';

interface FarmOption {
  readonly id: string;
  readonly name: string;
}

interface Props {
  readonly farms: readonly FarmOption[];
  readonly selectedFarmId: string | null;
  readonly totalFarms: number;
  readonly onFarmChange: (farmId: string | null) => void;
}

export function FarmFilterDropdown({
  farms,
  selectedFarmId,
  totalFarms,
  onFarmChange,
}: Props): React.JSX.Element {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const value = e.target.value;
    onFarmChange(value === '' ? null : value);
  }

  return (
    <select
      value={selectedFarmId ?? ''}
      onChange={handleChange}
      className="ct-card rounded-lg px-3 py-2 text-sm font-medium transition-colors"
      style={{
        color: 'var(--ct-text)',
        border: '1px solid var(--ct-border)',
        borderRadius: '8px',
        outline: 'none',
        cursor: 'pointer',
        minWidth: '180px',
        background: 'var(--ct-card)',
      }}
    >
      <option value="">{`전체 (${totalFarms}개 농장)`}</option>
      {farms.map((farm) => (
        <option key={farm.id} value={farm.id}>
          {farm.name}
        </option>
      ))}
    </select>
  );
}
