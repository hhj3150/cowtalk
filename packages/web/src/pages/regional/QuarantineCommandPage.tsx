// 방역 지휘센터 — 조기 경보 + 역학 + 접촉 추적 + 클러스터

import React from 'react';
import { useRegionalMap } from '@web/hooks/useRegionalMap';
import { KpiCard } from '@web/components/data/KpiCard';
import { RegionalMap } from '@web/components/map/RegionalMap';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { ErrorFallback } from '@web/components/common/ErrorFallback';

export default function QuarantineCommandPage(): React.JSX.Element {
  const { data, isLoading, error, refetch } = useRegionalMap('health');

  if (isLoading) return <LoadingSkeleton lines={8} />;
  if (error) return <ErrorFallback error={error as Error} onRetry={() => { refetch(); }} />;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">방역 지휘센터</h1>

      {/* 조기 경보 게이지 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="체온 이상" value={0} unit="두" severity="high" drilldownType="health_risk" />
        <KpiCard label="집단감염 의심" value={0} unit="건" severity="critical" />
        <KpiCard label="의심 농장" value={0} unit="개" severity="medium" drilldownType="health_risk" />
        <KpiCard label="경보 수준" value="정상" severity="low" />
      </div>

      {/* 조기 경보 게이지 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">조기 경보 수준</h2>
        <div className="flex items-center gap-4">
          <div className="h-4 flex-1 rounded-full bg-gray-100">
            <div className="h-4 rounded-full bg-green-500 transition-all" style={{ width: '15%' }} />
          </div>
          <span className="text-sm font-bold text-green-600">15/100</span>
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-gray-400">
          <span>정상</span>
          <span>주의</span>
          <span>경계</span>
          <span>심각</span>
        </div>
      </div>

      {/* 클러스터 지도 */}
      {data && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">질병 클러스터 지도</h2>
          <RegionalMap markers={data.markers} darkMode height="400px" />
        </div>
      )}

      {/* 접촉 추적 요약 */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">접촉 추적 (3단계, 21일)</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded bg-red-50 p-3 text-center">
            <p className="text-2xl font-bold text-red-700">0</p>
            <p className="text-xs text-red-500">1차 접촉</p>
          </div>
          <div className="rounded bg-orange-50 p-3 text-center">
            <p className="text-2xl font-bold text-orange-700">0</p>
            <p className="text-xs text-orange-500">2차 접촉</p>
          </div>
          <div className="rounded bg-yellow-50 p-3 text-center">
            <p className="text-2xl font-bold text-yellow-700">0</p>
            <p className="text-xs text-yellow-500">3차 접촉</p>
          </div>
        </div>
      </div>

      {/* 역학 곡선 - placeholder */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">유행 곡선 + R₀ 추정</h2>
        <p className="text-xs text-gray-400">현재 활성 유행이 없습니다. 이상 징후 발생 시 자동 생성됩니다.</p>
      </div>
    </div>
  );
}
