// 지역 인텔리전스 페이지 — Leaflet 지도 + 농장 마커 + 드릴다운

import React, { useState } from 'react';
import { useRegionalMap, useRegionalSummary } from '@web/hooks/useRegionalMap';
import { RegionalMap } from '@web/components/map/RegionalMap';
import { FarmDrawer } from '@web/components/map/FarmDrawer';
import { KpiCard } from '@web/components/data/KpiCard';
import { ExportButton } from '@web/components/data/ExportButton';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { ErrorFallback } from '@web/components/common/ErrorFallback';

type MapMode = 'status' | 'estrus' | 'health' | 'sensor';

const MODE_LABELS: Record<MapMode, string> = {
  status: '농장 상태',
  estrus: '발정 활동',
  health: '건강 위험',
  sensor: '센서 활성도',
};

export default function RegionalMapPage(): React.JSX.Element {
  const [mode, setMode] = useState<MapMode>('status');
  const [selectedFarm, setSelectedFarm] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const { data: mapData, isLoading, error, refetch } = useRegionalMap(mode);
  const { data: summary } = useRegionalSummary();

  if (isLoading) return <LoadingSkeleton lines={8} />;
  if (error) return <ErrorFallback error={error as Error} onRetry={() => { refetch(); }} />;

  const selectedMarker = mapData?.markers.find((m) => m.farmId === selectedFarm);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">지역 인텔리전스</h1>
        <div className="flex items-center gap-2">
          <ExportButton target="regional" />
          <button
            type="button"
            onClick={() => setDarkMode(!darkMode)}
            className="rounded-md border px-3 py-1.5 text-xs"
          >
            {darkMode ? '라이트' : '다크'}
          </button>
        </div>
      </div>

      {/* 모드 선택 */}
      <div className="flex gap-1">
        {(Object.entries(MODE_LABELS) as [MapMode, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              mode === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* KPI */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="총 농장" value={summary.totalFarms} unit="개" drilldownType="all" />
          <KpiCard label="총 두수" value={summary.totalAnimals} unit="두" />
          <KpiCard label="활성 알림" value={summary.activeAlerts} unit="건" severity={summary.activeAlerts > 5 ? 'high' : 'low'} drilldownType="health_risk" />
          <KpiCard label="건강 점수" value={summary.healthScore ?? '-'} unit="점" />
        </div>
      )}

      {/* 지도 */}
      <div className="relative">
        {mapData && (
          <RegionalMap
            markers={mapData.markers}
            onMarkerClick={setSelectedFarm}
            darkMode={darkMode}
            height="500px"
          />
        )}

        {/* 농장 드로어 */}
        {selectedMarker && (
          <FarmDrawer
            farmId={selectedMarker.farmId}
            farmName={selectedMarker.name}
            totalAnimals={selectedMarker.totalAnimals}
            activeAlerts={selectedMarker.activeAlerts}
            healthScore={selectedMarker.healthScore}
            isOpen={Boolean(selectedFarm)}
            onClose={() => setSelectedFarm(null)}
          />
        )}
      </div>
    </div>
  );
}
