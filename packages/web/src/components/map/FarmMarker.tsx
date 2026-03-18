// 농장 마커 — 상태별 색상

import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { FarmMapMarker } from '@web/api/regional.api';

interface Props {
  readonly marker: FarmMapMarker;
  readonly onClick?: (farmId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  normal: '#22c55e',
  warning: '#eab308',
  danger: '#f97316',
  critical: '#ef4444',
};

function createIcon(status: string): L.DivIcon {
  const color = STATUS_COLORS[status] ?? '#6b7280';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export function FarmMarker({ marker, onClick }: Props): React.JSX.Element {
  const icon = createIcon(marker.status);

  return (
    <Marker
      position={[marker.lat, marker.lng]}
      icon={icon}
      eventHandlers={{
        click: () => onClick?.(marker.farmId),
      }}
    >
      <Popup>
        <div className="min-w-[150px]">
          <p className="font-medium">{marker.name}</p>
          <p className="text-xs text-gray-500">{marker.totalAnimals}두</p>
          {marker.activeAlerts > 0 && (
            <p className="text-xs text-red-600">알림 {marker.activeAlerts}건</p>
          )}
          {marker.healthScore !== null && (
            <p className="text-xs text-gray-500">건강점수: {marker.healthScore}</p>
          )}
          {onClick && (
            <button
              type="button"
              onClick={() => onClick(marker.farmId)}
              className="mt-1 text-xs text-blue-600 hover:underline"
            >
              상세 보기
            </button>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
