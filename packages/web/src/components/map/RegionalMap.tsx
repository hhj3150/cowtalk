// 지역 인텔리전스 지도 — Google Maps API 기반
// 비례 마커 + 위험도 색상 + 다크모드 + 범례 + InfoWindow

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Circle as GCircle, InfoWindow } from '@react-google-maps/api';
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

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || 'AIzaSyBvdUMuz7NNTfA6PEl4Cqa8Iw4QqDije7M';

const DEFAULT_CENTER = { lat: 36.0, lng: 127.5 };
const DEFAULT_ZOOM = 7;

const STATUS_COLORS: Readonly<Record<string, string>> = {
  normal: '#22c55e',
  warning: '#eab308',
  danger: '#f97316',
  critical: '#ef4444',
};

// 다크모드 스타일
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8892b0' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d3748' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a5568' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// ── 마커 크기 (두수 비례) ──

function markerRadius(totalAnimals: number): number {
  if (totalAnimals >= 100) return 1800;
  if (totalAnimals >= 50) return 1400;
  if (totalAnimals >= 10) return 1000;
  return 600;
}

// ── 범례 컴포넌트 ──

function MapLegend({ collapsed, onToggle }: { readonly collapsed: boolean; readonly onToggle: () => void }): React.JSX.Element {
  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      right: 12,
      zIndex: 10,
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
  const [infoFarm, setInfoFarm] = useState<FarmMapMarker | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    language: 'ko',
    region: 'KR',
  });

  const [hasTimedOut, setHasTimedOut] = useState(false);
  useEffect(() => {
    if (isLoaded || loadError) return;
    const timer = setTimeout(() => setHasTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [isLoaded, loadError]);

  const mapCenter = useMemo(() =>
    center ? { lat: center[0], lng: center[1] } : DEFAULT_CENTER,
    [center],
  );

  const filteredMarkers = useMemo(() => {
    if (!filters?.statuses || filters.statuses.length === 0) return markers;
    return markers.filter((m) => filters.statuses!.includes(m.status));
  }, [markers, filters]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const mapOptions: google.maps.MapOptions = useMemo(() => ({
    disableDefaultUI: true,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: darkMode ? DARK_MAP_STYLES : undefined,
    backgroundColor: '#0f172a',
  }), [darkMode]);

  if (loadError || hasTimedOut) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', borderRadius: 14, color: '#ef4444', fontSize: 13 }}>
        지도 로드 실패{loadError ? `: ${loadError.message}` : ' (타임아웃)'}
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1e293b', borderRadius: 14, color: '#94a3b8', fontSize: 13 }}>
        Google Maps 로딩 중...
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <GoogleMap
        mapContainerStyle={{ height: '100%', width: '100%', borderRadius: 14 }}
        center={mapCenter}
        zoom={zoom}
        options={mapOptions}
        onLoad={onMapLoad}
      >
        {/* 농장 마커 (Circle) */}
        {filteredMarkers.map((m) => {
          if (!m.lat || !m.lng) return null;
          const color = STATUS_COLORS[m.status] ?? '#6b7280';
          const radius = markerRadius(m.totalAnimals);
          const isSelected = m.farmId === selectedFarmId;

          return (
            <GCircle
              key={m.farmId}
              center={{ lat: m.lat, lng: m.lng }}
              radius={isSelected ? radius * 1.4 : radius}
              options={{
                fillColor: color,
                fillOpacity: 0.7,
                strokeColor: isSelected ? '#00d67e' : 'rgba(255,255,255,0.6)',
                strokeWeight: isSelected ? 3 : 1.5,
                clickable: true,
                zIndex: isSelected ? 10 : m.status === 'critical' ? 5 : 1,
              }}
              onClick={() => {
                onMarkerClick?.(m.farmId);
                setInfoFarm(m);
              }}
            />
          );
        })}

        {/* InfoWindow (농장 클릭 시 정보 표시) */}
        {infoFarm && (
          <InfoWindow
            position={{ lat: infoFarm.lat, lng: infoFarm.lng }}
            onCloseClick={() => setInfoFarm(null)}
            options={{ maxWidth: 200 }}
          >
            <div style={{ fontSize: 12, lineHeight: 1.5, color: '#1e293b' }}>
              <p style={{ fontWeight: 700, margin: '0 0 4px', fontSize: 13 }}>{infoFarm.name}</p>
              <p style={{ margin: 0 }}>{infoFarm.totalAnimals}두</p>
              {infoFarm.activeAlerts > 0 && (
                <p style={{ margin: '2px 0 0', color: '#dc2626', fontWeight: 600 }}>알림 {infoFarm.activeAlerts}건</p>
              )}
              {infoFarm.healthScore !== null && (
                <p style={{ margin: '2px 0 0', color: '#6b7280' }}>건강점수: {infoFarm.healthScore}</p>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* 범례 */}
      <MapLegend collapsed={legendCollapsed} onToggle={() => setLegendCollapsed(!legendCollapsed)} />
    </div>
  );
}
