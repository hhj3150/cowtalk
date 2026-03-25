// 지역 인텔리전스 지도 — react-leaflet 기반
// 비례 마커 + 위험도 펄스 + 다크모드 + 범례 + Tooltip

import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Circle } from 'react-leaflet';
import type { FarmMapMarker } from '@web/api/regional.api';
import { TILE_URL as CARTO_LIGHT, TILE_ATTRIBUTION } from '@web/constants/map';
import 'leaflet/dist/leaflet.css';

// ── 타입 ──

interface Props {
  readonly markers: readonly FarmMapMarker[];
  readonly center?: [number, number];
  readonly zoom?: number;
  readonly onMarkerClick?: (farmId: string) => void;
  readonly darkMode?: boolean;
  readonly height?: string;
  readonly selectedFarmId?: string | null;
  readonly filters?: MapFilters;
}

export interface MapFilters {
  readonly statuses?: readonly string[];
}

// ── 상수 ──

const DEFAULT_CENTER: [number, number] = [36.0, 127.5];
const DEFAULT_ZOOM = 7;

const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const OSM_FALLBACK = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const STATUS_COLORS: Readonly<Record<string, string>> = {
  normal: '#22c55e',
  warning: '#eab308',
  danger: '#f97316',
  critical: '#ef4444',
};

const GLOW_CLASSES: Readonly<Record<string, string>> = {
  critical: 'ct-marker-glow-critical ct-pulse',
  danger: 'ct-marker-glow-warning',
  warning: 'ct-marker-glow-caution',
};

// ── 마커 크기 (두수 비례) ──

function markerRadius(totalAnimals: number): number {
  if (totalAnimals >= 100) return 18;
  if (totalAnimals >= 50) return 14;
  if (totalAnimals >= 10) return 10;
  return 6;
}

// ── 반경 원 옵션 ──

const RADIUS_OPTIONS = [500, 1000, 3000] as const;

// ── 범례 컴포넌트 ──

function MapLegend({ collapsed, onToggle }: { readonly collapsed: boolean; readonly onToggle: () => void }): React.JSX.Element {
  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      right: 12,
      zIndex: 1000,
      background: 'rgba(15, 23, 42, 0.9)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
      padding: collapsed ? '6px 10px' : '12px 14px',
      fontSize: 11,
      color: '#e2e8f0',
      backdropFilter: 'blur(8px)',
      minWidth: collapsed ? undefined : 140,
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 11, padding: 0 }}
      >
        {collapsed ? '📊 범례 ▸' : '📊 범례 ▾'}
      </button>
      {!collapsed && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { color: '#22c55e', label: '정상' },
            { color: '#eab308', label: '주의' },
            { color: '#f97316', label: '위험' },
            { color: '#ef4444', label: '심각 (펄스)' },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: item.color, display: 'inline-block',
                boxShadow: item.color === '#ef4444' ? `0 0 6px ${item.color}` : undefined,
              }} />
              <span>{item.label}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 5, marginTop: 2 }}>
            <span style={{ color: '#94a3b8' }}>● 크기 = 두수 비례</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ──

export function RegionalMap({
  markers,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  onMarkerClick,
  darkMode = false,
  height = '500px',
  selectedFarmId,
  filters,
}: Props): React.JSX.Element {
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const [radiusFarmId, setRadiusFarmId] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);

  // 필터 적용
  const filteredMarkers = useMemo(() => {
    if (!filters?.statuses || filters.statuses.length === 0) return markers;
    return markers.filter((m) => filters.statuses!.includes(m.status));
  }, [markers, filters]);

  // 타일 URL 결정
  const tileUrl = tileError
    ? OSM_FALLBACK
    : (darkMode ? CARTO_DARK : CARTO_LIGHT);

  // 반경 표시 대상 농장
  const radiusFarm = radiusFarmId
    ? filteredMarkers.find((m) => m.farmId === radiusFarmId)
    : null;

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%', borderRadius: 14, background: '#0f172a' }}
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer
          url={tileUrl}
          attribution={TILE_ATTRIBUTION}
          eventHandlers={{
            tileerror: () => {
              if (!tileError) setTileError(true);
            },
          }}
        />

        {/* 반경 원 표시 */}
        {radiusFarm && RADIUS_OPTIONS.map((r) => (
          <Circle
            key={r}
            center={[radiusFarm.lat, radiusFarm.lng]}
            radius={r}
            pathOptions={{
              color: r <= 1000 ? '#ef4444' : '#f97316',
              fillColor: r <= 1000 ? '#ef4444' : '#f97316',
              fillOpacity: 0.08,
              weight: 1,
              dashArray: '4 4',
            }}
          />
        ))}

        {/* 농장 마커 */}
        {filteredMarkers.map((m) => {
          if (!m.lat || !m.lng) return null;
          const color = STATUS_COLORS[m.status] ?? '#6b7280';
          const radius = markerRadius(m.totalAnimals);
          const isSelected = m.farmId === selectedFarmId;
          const glowClass = GLOW_CLASSES[m.status] ?? '';

          return (
            <CircleMarker
              key={m.farmId}
              center={[m.lat, m.lng]}
              radius={isSelected ? radius * 1.4 : radius}
              pathOptions={{
                color: isSelected ? '#00d67e' : 'rgba(255,255,255,0.6)',
                fillColor: color,
                fillOpacity: 0.85,
                weight: isSelected ? 3 : 1.5,
                className: isSelected ? 'ct-marker-glow-selected' : glowClass,
              }}
              eventHandlers={{
                click: () => {
                  onMarkerClick?.(m.farmId);
                  setRadiusFarmId((prev) => prev === m.farmId ? null : m.farmId);
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -radius]} opacity={0.95}>
                <div style={{ minWidth: 140, fontSize: 12 }}>
                  <p style={{ fontWeight: 700, margin: '0 0 4px' }}>{m.name}</p>
                  <p style={{ margin: 0, color: '#6b7280' }}>{m.totalAnimals}두</p>
                  {m.activeAlerts > 0 && (
                    <p style={{ margin: '2px 0 0', color: '#dc2626' }}>알림 {m.activeAlerts}건</p>
                  )}
                  {m.healthScore !== null && (
                    <p style={{ margin: '2px 0 0', color: '#6b7280' }}>건강점수: {m.healthScore}</p>
                  )}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* 범례 */}
      <MapLegend collapsed={legendCollapsed} onToggle={() => setLegendCollapsed(!legendCollapsed)} />
    </div>
  );
}
