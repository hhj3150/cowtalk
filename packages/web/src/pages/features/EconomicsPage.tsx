// 경제성/생산성 분석 페이지

import React, { useState } from 'react';
import { useFarmStore } from '@web/stores/farm.store';
import { useAuthStore } from '@web/stores/auth.store';
import { FarmProductivity } from '@web/components/economics/FarmProductivity';
import { FarmEconomicInput } from '@web/components/economics/FarmEconomicInput';
import { FarmBenchmark } from '@web/components/economics/FarmBenchmark';
import { ROICalculator } from '@web/components/economics/ROICalculator';
import { EmptyState } from '@web/components/common/EmptyState';

type Tab = 'productivity' | 'input' | 'benchmark' | 'roi';

export default function EconomicsPage(): React.JSX.Element {
  const farmId = useFarmStore((s) => s.selectedFarmId);
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const [tab, setTab] = useState<Tab>('productivity');
  const [showInput, setShowInput] = useState(false);

  if (!farmId) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-gray-900">경제성 분석</h1>
        <EmptyState message="농장을 선택해 주세요." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">경제성 분석</h1>
        <button
          type="button"
          onClick={() => setShowInput(!showInput)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          데이터 입력
        </button>
      </div>

      {showInput && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <FarmEconomicInput farmId={farmId} onClose={() => setShowInput(false)} />
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'productivity' as Tab, label: '생산성' },
          { key: 'benchmark' as Tab, label: '농장 비교' },
          { key: 'roi' as Tab, label: 'ROI 계산' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'productivity' && <FarmProductivity farmId={farmId} breedType="dairy" />}
      {tab === 'benchmark' && tenantId && <FarmBenchmark tenantId={tenantId} currentFarmId={farmId} />}
      {tab === 'roi' && <ROICalculator farmId={farmId} />}
    </div>
  );
}
