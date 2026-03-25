// 지역 인텔리전스 페이지 — 살아있는 지도 + 실시간 갱신 + 필터

import React, { useState, useMemo } from 'react';
import { useRegionalMap, useRegionalSummary } from '@web/hooks/useRegionalMap';
import { RegionalMap } from '@web/components/map/RegionalMap';
import type { MapFilters } from '@web/components/map/RegionalMap';
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

const STATUS_OPTIONS = [
  { value: 'critical', label: '심각', color: '#ef4444' },
  { value: 'danger', label: '위험', color: '#f97316' },
  { value: 'warning', label: '주의', color: '#eab308' },
  { value: 'normal', label: '정상', color: '#22c55e' },
] as const;

export default function RegionalMapPage(): React.JSX.Element {
  const [mode, setMode] = useState<MapMode>('status');
  const [selectedFarm, setSelectedFarm] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(true); // 기본 다크 모드
  const [statusFilter, setStatusFilter] = useState<readonly string[]>([]);
  const { data: mapData, isLoading, error, refetch, dataUpdatedAt } = useRegionalMap(mode);
  const { data: summary } = useRegionalSummary();

  const selectedMarker = mapData?.markers.find((m) => m.farmId === selectedFarm);

  // 필터 객체
  const filters: MapFilters = useMemo(() => ({
    statuses: statusFilter.length > 0 ? statusFilter : undefined,
  }), [statusFilter]);

  // 마지막 갱신 시간
  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

  // 상태 필터 토글
  const toggleStatus = (status: string) => {
    setStatusFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  };

  if (isLoading) return <LoadingSkeleton lines={8} />;
  if (error) return <ErrorFallback error={error as Error} onRetry={() => { refetch(); }} />;

  return (
    <div data-theme="dark" style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)', minHeight: '100vh' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>🗺️ 지역 인텔리전스</h1>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: '#16a34a', color: '#fff', borderRadius: 12, padding: '2px 10px',
            fontSize: 11, fontWeight: 700,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'live-pulse 2s infinite' }} />
            Live
          </span>
          <span style={{ fontSize: 11, color: 'var(--ct-text-secondary)' }}>{lastUpdate}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ExportButton target="regional" />
          <button
            type="button"
            onClick={() => setDarkMode(!darkMode)}
            style={{
              background: 'var(--ct-card)', border: '1px solid var(--ct-border)',
              borderRadius: 6, padding: '4px 10px', fontSize: 11, color: 'var(--ct-text)', cursor: 'pointer',
            }}
          >
            {darkMode ? '☀️ 라이트' : '🌙 다크'}
          </button>
        </div>
      </div>

      {/* 모드 선택 + 필터 */}
      <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* 모드 탭 */}
        {(Object.entries(MODE_LABELS) as [MapMode, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: mode === key ? 'var(--ct-primary)' : 'var(--ct-card)',
              color: mode === key ? '#fff' : 'var(--ct-text-secondary)',
              border: `1px solid ${mode === key ? 'var(--ct-primary)' : 'var(--ct-border)'}`,
            }}
          >
            {label}
          </button>
        ))}

        <span style={{ width: 1, height: 20, background: 'var(--ct-border)', margin: '0 4px' }} />

        {/* 위험 등급 필터 */}
        {STATUS_OPTIONS.map((opt) => {
          const active = statusFilter.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleStatus(opt.value)}
              style={{
                padding: '3px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                background: active ? opt.color : 'transparent',
                color: active ? '#fff' : opt.color,
                border: `1px solid ${opt.color}`,
                opacity: active ? 1 : 0.6,
              }}
            >
              {opt.label}
            </button>
          );
        })}
        {statusFilter.length > 0 && (
          <button
            type="button"
            onClick={() => setStatusFilter([])}
            style={{ fontSize: 10, color: 'var(--ct-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            초기화
          </button>
        )}
      </div>

      {/* KPI */}
      {(() => {
        const s = summary as unknown;
        const totalFarms = Array.isArray(s)
          ? (s as readonly { farmCount?: number }[]).reduce((sum, r) => sum + (r.farmCount ?? 0), 0)
          : (s as { totalFarms?: number })?.totalFarms ?? 0;
        const markers = mapData?.markers ?? [];
        const totalAnimals = markers.reduce((sum, m) => sum + m.totalAnimals, 0);
        const criticalFarms = markers.filter((m) => m.status === 'critical' || m.status === 'danger').length;
        const activeAlerts = markers.reduce((sum, m) => sum + m.activeAlerts, 0);
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '0 16px 8px' }}>
            <KpiCard label="감시 농장" value={totalFarms} unit="개" drilldownType="all" />
            <KpiCard label="감시 두수" value={totalAnimals} unit="두" />
            <KpiCard label="위험 농장" value={criticalFarms} unit="개" severity={criticalFarms > 5 ? 'high' : 'low'} drilldownType="health_risk" />
            <KpiCard label="활성 알림" value={activeAlerts} unit="건" severity={activeAlerts > 20 ? 'high' : 'low'} />
          </div>
        );
      })()}

      {/* 지도 */}
      <div style={{ position: 'relative', padding: '0 16px' }}>
        {mapData && (
          <RegionalMap
            markers={mapData.markers}
            onMarkerClick={setSelectedFarm}
            darkMode={darkMode}
            height="calc(100vh - 280px)"
            selectedFarmId={selectedFarm}
            filters={filters}
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
