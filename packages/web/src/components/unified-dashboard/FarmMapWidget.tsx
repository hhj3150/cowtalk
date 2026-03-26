// 대시보드 농장 지도 위젯 — Google Maps API
// 500+ 농장 대응: 비례 마커 + 다크모드

import React, { useMemo, useState, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Circle as GCircle, InfoWindow } from '@react-google-maps/api';
import type { LiveAlarm } from '@cowtalk/shared';

// ── 타입 ──

interface FarmMarkerData {
  readonly farmId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly headCount: number;
  readonly healthAlarmCount: number;
  readonly alertCount: number;
  readonly healthAlarmRate: number;
  readonly status: 'normal' | 'caution' | 'warning' | 'critical';
}

interface Props {
  readonly markers: readonly FarmMarkerData[];
  readonly selectedFarmId?: string | null;
  readonly onFarmClick?: (farmId: string) => void;
  readonly height?: number;
}

// ── 상수 ──

const KOREA_CENTER = { lat: 36.0, lng: 127.5 };
const DEFAULT_ZOOM = 7;

const STATUS_COLORS: Readonly<Record<string, string>> = {
  normal: '#22c55e',
  caution: '#eab308',
  warning: '#f97316',
  critical: '#ef4444',
};

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string || 'AIzaSyBvdUMuz7NNTfA6PEI4Cqa8Iw4QqDije7M';

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

function markerRadius(headCount: number): number {
  if (headCount >= 200) return 1800;
  if (headCount >= 100) return 1400;
  if (headCount >= 50) return 1000;
  return 600;
}

// ── 메인 컴포넌트 ──

export function FarmMapWidget({ markers, selectedFarmId, onFarmClick, height = 420 }: Props): React.JSX.Element {
  const [infoFarm, setInfoFarm] = useState<FarmMarkerData | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    language: 'ko',
    region: 'KR',
  });

  // 선택된 농장으로 이동
  React.useEffect(() => {
    if (!mapRef.current || !selectedFarmId) return;
    const selected = markers.find((m) => m.farmId === selectedFarmId);
    if (selected) {
      mapRef.current.panTo({ lat: selected.lat, lng: selected.lng });
      mapRef.current.setZoom(11);
    }
  }, [selectedFarmId, markers]);

  const stats = useMemo(() => {
    const total = markers.length;
    const normal = markers.filter((m) => m.status === 'normal').length;
    const caution = markers.filter((m) => m.status === 'caution').length;
    const warning = markers.filter((m) => m.status === 'warning').length;
    const critical = markers.filter((m) => m.status === 'critical').length;
    const totalHead = markers.reduce((sum, m) => sum + m.headCount, 0);
    return { total, normal, caution, warning, critical, totalHead };
  }, [markers]);

  return (
    <div
      style={{
        background: 'var(--ct-card)',
        borderRadius: 14,
        border: '1px solid var(--ct-border)',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px 10px',
        borderBottom: '1px solid var(--ct-border)',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: 'rgba(255,255,255,0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
          }}>
            🗺️
          </span>
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ct-text)' }}>
            농장 분포 지도
          </span>
          <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
            {stats.total}개 농장 · {stats.totalHead.toLocaleString('ko-KR')}두
          </span>
        </div>

        {/* 범례 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Legend color="#22c55e" label={`정상 ${stats.normal}`} />
          <Legend color="#eab308" label={`주의 ${stats.caution}`} />
          <Legend color="#f97316" label={`경고 ${stats.warning}`} />
          <Legend color="#ef4444" label={`위험 ${stats.critical}`} />
        </div>
      </div>

      {/* Google Maps */}
      <div style={{ height, width: '100%' }}>
        {!isLoaded ? (
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
                  <p style={{ margin: 0 }}>{infoFarm.headCount}두 · 알람 {infoFarm.alertCount}건</p>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </div>
    </div>
  );
}

// ── 범례 아이템 ──

function Legend({ color, label }: { readonly color: string; readonly label: string }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        boxShadow: `0 0 4px ${color}50`,
      }} />
      <span style={{ fontSize: 10, color: 'var(--ct-text-secondary)' }}>{label}</span>
    </div>
  );
}

// ── 데이터 변환 헬퍼 ──

interface RawMapMarker {
  readonly farmId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly currentHeadCount?: number;
  readonly totalAnimals?: number;
  readonly status: string;
}

// ── 건강알람 이벤트 타입 (발정·분만 제외) ──

const HEALTH_ALARM_TYPES = new Set([
  'temperature_high',
  'temperature_low',
  'rumination_decrease',
  'rumination_warning',
  'activity_decrease',
  'drinking_decrease',
  'health_general',
  'health_warning',
  'clinical_condition',
  'ph_warning',
]);

/**
 * API 마커 + 라이브 알람 → 대시보드 맵 마커 변환
 * 건강알람 비율 기준 상태 결정:
 *   ≥15% → critical
 *   ≥10% → warning
 *   ≥2%  → caution
 *   <2%  → normal
 */
export function buildFarmMapMarkers(
  rawMarkers: readonly RawMapMarker[],
  alarms: readonly LiveAlarm[],
): readonly FarmMarkerData[] {
  const farmAlerts = new Map<string, { total: number; health: number }>();
  for (const alarm of alarms) {
    const fid = alarm.farmId ?? '';
    if (!fid) continue;
    const isHealth = HEALTH_ALARM_TYPES.has(alarm.eventType ?? '');
    const existing = farmAlerts.get(fid) ?? { total: 0, health: 0 };
    farmAlerts.set(fid, {
      total: existing.total + 1,
      health: existing.health + (isHealth ? 1 : 0),
    });
  }

  return rawMarkers
    .filter((m) => m.lat && m.lng)
    .map((m) => {
      const alerts = farmAlerts.get(m.farmId) ?? { total: 0, health: 0 };
      const headCount = m.currentHeadCount ?? m.totalAnimals ?? 0;
      const healthAlarmRate = headCount > 0 ? alerts.health / headCount : 0;

      let status: FarmMarkerData['status'] = 'normal';
      if (healthAlarmRate >= 0.15) status = 'critical';
      else if (healthAlarmRate >= 0.10) status = 'warning';
      else if (healthAlarmRate >= 0.02) status = 'caution';

      return {
        farmId: m.farmId,
        name: m.name,
        lat: m.lat,
        lng: m.lng,
        headCount,
        healthAlarmCount: alerts.health,
        alertCount: alerts.total,
        healthAlarmRate,
        status,
      };
    });
}
