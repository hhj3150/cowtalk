// 농장 사이드패널 — 농장 정보 + 동물 목록 + 드릴다운

import React from 'react';
import { useDrilldown } from '@web/hooks/useDrilldown';

interface Props {
  readonly farmId: string;
  readonly farmName: string;
  readonly totalAnimals: number;
  readonly activeAlerts: number;
  readonly healthScore: number | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function FarmDrawer({
  farmId,
  farmName,
  totalAnimals,
  activeAlerts,
  healthScore,
  isOpen,
  onClose,
}: Props): React.JSX.Element | null {
  const { navigateToFarm } = useDrilldown();

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-0 z-20 h-full w-80 border-l border-gray-200 bg-white shadow-lg overflow-y-auto">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold">{farmName}</h3>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-gray-50 p-2">
            <p className="text-lg font-bold text-gray-900">{totalAnimals}</p>
            <p className="text-[10px] text-gray-500">총두수</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-2">
            <p className="text-lg font-bold text-red-600">{activeAlerts}</p>
            <p className="text-[10px] text-gray-500">알림</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-2">
            <p className="text-lg font-bold text-blue-600">{healthScore ?? '-'}</p>
            <p className="text-[10px] text-gray-500">건강점수</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigateToFarm(farmId, farmName)}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          농장 상세 → 동물 목록
        </button>
      </div>
    </div>
  );
}
