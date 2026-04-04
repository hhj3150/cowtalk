// 목장 관리 미니맵 — Leaflet / CartoDB Dark Matter
// Google Maps API → Leaflet 마이그레이션 (API 키 불필요)

import React, { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { FarmRecord } from '@web/api/farm-management.api';

interface Props {
  readonly farms: readonly FarmRecord[];
  readonly onFarmClick?: (farmId: string) => void;
}

const KOREA_CENTER: [number, number] = [36.0, 127.5];
const DEFAULT_ZOOM = 7;

const STATUS_COLORS: Readonly<Record<string, string>> = {
  active: '#22c55e',
  inactive: '#6b7280',
  quarantine: '#ef4444',
  suspended: '#f59e0b',
};

const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

interface MarkerData {
  readonly farmId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly headCount: number;
  readonly status: string;
}

function markerRadius(headCount: number): number {
  if (headCount >= 100) return 14;
  if (headCount >= 50) return 10;
  return 7;
}

// ── 지도 뷰 제어 ──

function MapController({ markers }: { readonly markers: readonly MarkerData[] }): null {
  const map = useMap();

  React.useEffect(() => {
    if (markers.length === 0) return;
    if (markers.length === 1) {
      map.setView([markers[0]!.lat, markers[0]!.lng], 11);
      return;
    }
    const bounds = markers.map((m) => [m.lat, m.lng] as [number, number]);
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, markers]);

  return null;
}

export function FarmMiniMap({ farms, onFarmClick }: Props): React.JSX.Element {
  const markers = useMemo(() =>
    farms
      .filter((f) => f.lat && f.lng)
      .map((f) => ({
        farmId: f.farmId,
        name: f.name,
        lat: Number(f.lat),
        lng: Number(f.lng),
        headCount: f.currentHeadCount ?? 0,
        status: f.status,
      })),
    [farms],
  );

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--ct-border)' }}>
      <div style={{ height: 400, width: '100%', background: '#0f172a' }}>
        <MapContainer
          center={KOREA_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          attributionControl={true}
        >
          <TileLayer url={CARTO_DARK} attribution={CARTO_ATTRIBUTION} subdomains="abcd" maxZoom={20} />
          <MapController markers={markers} />

          {markers.map((m) => {
            const color = STATUS_COLORS[m.status] ?? '#6b7280';
            const radius = markerRadius(m.headCount);

            return (
              <CircleMarker
                key={m.farmId}
                center={[m.lat, m.lng]}
                radius={radius}
                pathOptions={{
                  fillColor: color,
                  fillOpacity: 0.7,
                  color: 'rgba(255,255,255,0.6)',
                  weight: 1.5,
                }}
                eventHandlers={{
                  click: () => onFarmClick?.(m.farmId),
                }}
              >
                <Tooltip>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: '#1e293b' }}>
                    <p style={{ fontWeight: 700, margin: '0 0 4px', fontSize: 13 }}>{m.name}</p>
                    <p style={{ margin: 0 }}>{m.headCount}두</p>
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
