// 목장 관리 미니맵 — Google Maps 기반 농장 위치 표시

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Circle as GCircle, InfoWindow } from '@react-google-maps/api';
import type { FarmRecord } from '@web/api/farm-management.api';

interface Props {
  readonly farms: readonly FarmRecord[];
  readonly onFarmClick?: (farmId: string) => void;
}

const KOREA_CENTER = { lat: 36.0, lng: 127.5 };
const DEFAULT_ZOOM = 7;

const STATUS_COLORS: Readonly<Record<string, string>> = {
  active: '#22c55e',
  inactive: '#6b7280',
  quarantine: '#ef4444',
  suspended: '#f59e0b',
};

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || 'AIzaSyBvdUMuz7NNTfA6PEl4Cqa8Iw4QqDije7M';

const DARK_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8892b0' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
  { featureType: 'road', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

interface MarkerData {
  readonly farmId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly headCount: number;
  readonly status: string;
}

function markerRadius(headCount: number): number {
  if (headCount >= 100) return 1400;
  if (headCount >= 50) return 1000;
  return 600;
}

export function FarmMiniMap({ farms, onFarmClick }: Props): React.JSX.Element {
  const [infoFarm, setInfoFarm] = useState<MarkerData | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    language: 'ko',
    region: 'KR',
  });

  const [hasTimedOut, setHasTimedOut] = useState(false);
  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setHasTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

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
      <div style={{ height: 400, width: '100%' }}>
        {hasTimedOut ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#ef4444', fontSize: 13 }}>
            지도 로드 실패 (타임아웃)
          </div>
        ) : !isLoaded ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: '#94a3b8', fontSize: 13 }}>
            지도 로딩 중...
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ height: '100%', width: '100%' }}
            center={KOREA_CENTER}
            zoom={DEFAULT_ZOOM}
            options={{
              disableDefaultUI: true,
              zoomControl: true,
              styles: DARK_STYLES,
              backgroundColor: '#0f172a',
            }}
            onLoad={(map) => { mapRef.current = map; }}
          >
            {markers.map((m) => {
              const color = STATUS_COLORS[m.status] ?? '#6b7280';
              const radius = markerRadius(m.headCount);

              return (
                <GCircle
                  key={m.farmId}
                  center={{ lat: m.lat, lng: m.lng }}
                  radius={radius}
                  options={{
                    fillColor: color,
                    fillOpacity: 0.7,
                    strokeColor: 'rgba(255,255,255,0.6)',
                    strokeWeight: 1.5,
                    clickable: true,
                    zIndex: m.status === 'quarantine' ? 5 : 1,
                  }}
                  onClick={() => {
                    onFarmClick?.(m.farmId);
                    setInfoFarm(m);
                  }}
                />
              );
            })}

            {infoFarm && (
              <InfoWindow
                position={{ lat: infoFarm.lat, lng: infoFarm.lng }}
                onCloseClick={() => setInfoFarm(null)}
              >
                <div style={{ fontSize: 12, lineHeight: 1.5, color: '#1e293b' }}>
                  <p style={{ fontWeight: 700, margin: '0 0 4px', fontSize: 13 }}>{infoFarm.name}</p>
                  <p style={{ margin: 0 }}>{infoFarm.headCount}두</p>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </div>
    </div>
  );
}
