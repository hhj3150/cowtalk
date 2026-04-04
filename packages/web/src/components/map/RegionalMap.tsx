// 지역 인텔리전스 지도 — Leaflet / CartoDB Dark Matter
// Google Maps API → Leaflet 마이그레이션 (API 키 불필요)

import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { FarmMapMarker } from '@web/api/regional.api';

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
  readonly showProvinces?: boolean;
  readonly provinceRisks?: Readonly<Record<string, string>>;
}

export interface MapFilters {
  readonly statuses?: readonly string[];
}

// ── 상수 ──

const DEFAULT_CENTER: [number, number] = [36.0, 127.5];
const DEFAULT_ZOOM = 7;

const STATUS_COLORS: Readonly<Record<string, string>> = {
  normal: '#22c55e',
  warning: '#eab308',
  danger: '#f97316',
  critical: '#ef4444',
};

const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const CARTO_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// ── 마커 크기 (두수 비례, px) ──

function markerRadius(totalAnimals: number): number {
  if (totalAnimals >= 100) return 18;
  if (totalAnimals >= 50) return 14;
  if (totalAnimals >= 10) return 10;
  return 7;
}

// ── 지도 뷰 제어 ──

function MapController({
  markers,
  selectedFarmId,
  center,
  zoom,
}: {
  readonly markers: readonly FarmMapMarker[];
  readonly selectedFarmId?: string | null;
  readonly center?: [number, number];
  readonly zoom?: number;
}): null {
  const map = useMap();

  React.useEffect(() => {
    if (center) {
      map.setView(center, zoom ?? DEFAULT_ZOOM);
      return;
    }
    if (selectedFarmId) {
      const sel = markers.find((m) => m.farmId === selectedFarmId);
      if (sel?.lat && sel.lng) {
        map.setView([sel.lat, sel.lng], 11);
        return;
      }
    }
    const valid = markers.filter((m) => m.lat && m.lng);
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView([valid[0]!.lat, valid[0]!.lng], 11);
      return;
    }
    const bounds = valid.map((m) => [m.lat, m.lng] as [number, number]);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, markers, selectedFarmId, center, zoom]);

  return null;
}

// ── 범례 컴포넌트 ──

function MapLegend({
  collapsed,
  onToggle,
}: {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      right: 12,
      zIndex: 1000,
      background: 'rgba(15, 23, 42, 0.92)',
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
            { color: '#ef4444', label: '심각' },
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
  center,
  zoom = DEFAULT_ZOOM,
  onMarkerClick,
  darkMode = true,
  height = '500px',
  selectedFarmId,
  filters,
}: Props): React.JSX.Element {
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  const filteredMarkers = useMemo(() => {
    if (!filters?.statuses || filters.statuses.length === 0) return markers;
    return markers.filter((m) => filters.statuses!.includes(m.status));
  }, [markers, filters]);

  const tileUrl = darkMode ? CARTO_DARK : CARTO_LIGHT;

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <MapContainer
        center={center ?? DEFAULT_CENTER}
        zoom={zoom}
        style={{ height: '100%', width: '100%', borderRadius: 14 }}
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer url={tileUrl} attribution={CARTO_ATTRIBUTION} subdomains="abcd" maxZoom={20} />
        <MapController
          markers={filteredMarkers}
          selectedFarmId={selectedFarmId}
          center={center}
          zoom={zoom}
        />

        {filteredMarkers.map((m) => {
          if (!m.lat || !m.lng) return null;
          const color = STATUS_COLORS[m.status] ?? '#6b7280';
          const radius = markerRadius(m.totalAnimals);
          const isSelected = m.farmId === selectedFarmId;

          return (
            <CircleMarker
              key={m.farmId}
              center={[m.lat, m.lng]}
              radius={isSelected ? Math.round(radius * 1.4) : radius}
              pathOptions={{
                fillColor: color,
                fillOpacity: 0.7,
                color: isSelected ? '#00d67e' : 'rgba(255,255,255,0.6)',
                weight: isSelected ? 3 : 1.5,
              }}
              eventHandlers={{
                click: () => onMarkerClick?.(m.farmId),
              }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                <div style={{ fontSize: 12, lineHeight: 1.5, color: '#1e293b', minWidth: 130 }}>
                  <p style={{ fontWeight: 700, margin: '0 0 4px', fontSize: 13 }}>{m.name}</p>
                  <p style={{ margin: 0 }}>{m.totalAnimals}두</p>
                  {m.activeAlerts > 0 && (
                    <p style={{ margin: '2px 0 0', color: '#dc2626', fontWeight: 600 }}>알림 {m.activeAlerts}건</p>
                  )}
                  {m.healthScore !== null && (
                    <p style={{ margin: '2px 0 0', color: '#6b7280' }}>건강점수: {m.healthScore}</p>
                  )}
                  <p style={{ margin: '4px 0 0', color: '#3b82f6', fontSize: 10 }}>클릭하여 상세 보기</p>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* 범례 오버레이 */}
      <MapLegend collapsed={legendCollapsed} onToggle={() => setLegendCollapsed(!legendCollapsed)} />
    </div>
  );
}
