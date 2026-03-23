// Leaflet 지역 지도 — plain Leaflet (React 18 호환)

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { FarmMapMarker } from '@web/api/regional.api';
import 'leaflet/dist/leaflet.css';

interface Props {
  readonly markers: readonly FarmMapMarker[];
  readonly center?: [number, number];
  readonly zoom?: number;
  readonly onMarkerClick?: (farmId: string) => void;
  readonly darkMode?: boolean;
  readonly height?: string;
}

// 대한민국 중심 좌표
const DEFAULT_CENTER: [number, number] = [36.5, 127.5];
const DEFAULT_ZOOM = 7;

import { TILE_URL as CARTO_LIGHT, TILE_ATTRIBUTION } from '@web/constants/map';

const TILE_URLS = {
  light: CARTO_LIGHT,
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

const STATUS_COLORS: Record<string, string> = {
  normal: '#22c55e',
  warning: '#eab308',
  danger: '#f97316',
  critical: '#ef4444',
};

export function RegionalMap({
  markers,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  onMarkerClick,
  darkMode = false,
  height = '500px',
}: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // 지도 초기화
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(center, zoom);
    const tileUrl = darkMode ? TILE_URLS.dark : TILE_URLS.light;
    L.tileLayer(tileUrl, {
      attribution: TILE_ATTRIBUTION,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [center, zoom, darkMode]);

  // 마커 업데이트
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markerLayer = L.layerGroup().addTo(map);

    for (const m of markers) {
      if (!m.lat || !m.lng) continue;

      const color = STATUS_COLORS[m.status] ?? '#6b7280';
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const marker = L.marker([m.lat, m.lng], { icon }).addTo(markerLayer);

      const popupHtml = `
        <div style="min-width:150px">
          <p style="font-weight:600;margin:0 0 4px">${m.name}</p>
          <p style="font-size:12px;color:#6b7280;margin:0">${m.totalAnimals}두</p>
          ${m.activeAlerts > 0 ? `<p style="font-size:12px;color:#dc2626;margin:2px 0 0">알림 ${m.activeAlerts}건</p>` : ''}
          ${m.healthScore !== null ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0">건강점수: ${m.healthScore}</p>` : ''}
        </div>
      `;
      marker.bindPopup(popupHtml);

      if (onMarkerClick) {
        marker.on('click', () => onMarkerClick(m.farmId));
      }
    }

    return () => {
      markerLayer.clearLayers();
      map.removeLayer(markerLayer);
    };
  }, [markers, onMarkerClick]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%' }}
      className="rounded-lg"
    />
  );
}
