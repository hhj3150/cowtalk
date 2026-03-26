// 목장 관리 미니맵 — Leaflet 기반 농장 위치 표시

import React, { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import type { FarmRecord } from '@web/api/farm-management.api';
import 'leaflet/dist/leaflet.css';

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
      <MapContainer
        center={KOREA_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: 400, width: '100%', background: '#1a1a2e' }}
        scrollWheelZoom
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        {markers.map((m) => (
          <CircleMarker
            key={m.farmId}
            center={[m.lat, m.lng]}
            radius={m.headCount >= 100 ? 10 : m.headCount >= 50 ? 8 : 6}
            pathOptions={{
              color: STATUS_COLORS[m.status] ?? '#6b7280',
              fillColor: STATUS_COLORS[m.status] ?? '#6b7280',
              fillOpacity: 0.7,
              weight: 2,
            }}
            eventHandlers={{
              click: () => onFarmClick?.(m.farmId),
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <span className="text-xs font-medium">
                {m.name} ({String(m.headCount)}두)
              </span>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
