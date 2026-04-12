// 대시보드 농장 지도 위젯 — Leaflet / CartoDB Dark Matter
// Google Maps API → Leaflet 마이그레이션 (API 키 불필요)

import React, { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
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
  /** 헤더 합계 표시에 사용할 총 두수 (KPI와 정합성 유지) */
  readonly totalHeadOverride?: number;
}

// ── 상수 ──

const KOREA_CENTER: [number, number] = [36.0, 127.5];
const DEFAULT_ZOOM = 7;

const STATUS_COLORS: Readonly<Record<string, string>> = {
  normal: '#22c55e',
  caution: '#eab308',
  warning: '#f97316',
  critical: '#ef4444',
};

const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function markerRadius(headCount: number): number {
  if (headCount >= 200) return 20;
  if (headCount >= 100) return 16;
  if (headCount >= 50) return 12;
  return 8;
}

// ── 지도 뷰 제어 (MapContainer 내부 전용) ──

function MapController({
  markers,
  selectedFarmId,
}: {
  readonly markers: readonly FarmMarkerData[];
  readonly selectedFarmId?: string | null;
}): null {
  const map = useMap();

  React.useEffect(() => {
    if (markers.length === 0) return;
    if (selectedFarmId) {
      const sel = markers.find((m) => m.farmId === selectedFarmId);
      if (sel) {
        map.setView([sel.lat, sel.lng], 11);
        return;
      }
    }
    if (markers.length === 1) {
      const m = markers[0]!;
      map.setView([m.lat, m.lng], 13);
      return;
    }
    if (markers.length <= 20) {
      const bounds = markers.map((m) => [m.lat, m.lng] as [number, number]);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [map, markers, selectedFarmId]);

  return null;
}

// ── 메인 컴포넌트 ──

export function FarmMapWidget({ markers, selectedFarmId, onFarmClick, height = 520, totalHeadOverride }: Props): React.JSX.Element {
  const stats = useMemo(() => {
    const total = markers.length;
    const normal = markers.filter((m) => m.status === 'normal').length;
    const caution = markers.filter((m) => m.status === 'caution').length;
    const warning = markers.filter((m) => m.status === 'warning').length;
    const critical = markers.filter((m) => m.status === 'critical').length;
    // KPI와 정합성: totalHeadOverride가 주어지면 우선 사용 (currentHeadCount 캐시 불일치 방지)
    const totalHead = totalHeadOverride ?? markers.reduce((sum, m) => sum + m.headCount, 0);
    return { total, normal, caution, warning, critical, totalHead };
  }, [markers, totalHeadOverride]);

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

      {/* Leaflet 지도 */}
      <div style={{ height, width: '100%', background: '#0f172a' }}>
        <MapContainer
          center={KOREA_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
          attributionControl={true}
        >
          <TileLayer url={CARTO_DARK} attribution={CARTO_ATTRIBUTION} subdomains="abcd" maxZoom={20} />
          <MapController markers={markers} selectedFarmId={selectedFarmId} />

          {markers.map((m) => {
            const color = STATUS_COLORS[m.status] ?? '#6b7280';
            const radius = markerRadius(m.headCount);
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
                  click: () => onFarmClick?.(m.farmId),
                }}
              >
                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: '#1e293b', minWidth: 130 }}>
                    <p style={{ fontWeight: 700, margin: '0 0 4px', fontSize: 13 }}>{m.name}</p>
                    <p style={{ margin: 0 }}>{m.headCount}두 · 알람 {m.alertCount}건</p>
                    {m.healthAlarmCount > 0 && (
                      <p style={{ margin: '2px 0 0', color: '#dc2626', fontWeight: 600, fontSize: 11 }}>
                        건강알람 {m.healthAlarmCount}건 ({Math.round(m.healthAlarmRate * 100)}%)
                      </p>
                    )}
                    <p style={{ margin: '4px 0 0', color: '#3b82f6', fontSize: 10 }}>클릭하여 상세 보기</p>
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
