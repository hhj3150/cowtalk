// 대시보드 농장 지도 위젯 — Leaflet + OpenStreetMap 다크 테마
// 500+ 농장 대응: 줌 레벨에 따른 그리드 클러스터링
// 줌 ≤9 → 클러스터, 줌 ≥10 → 개별 마커

import React, { useMemo, useState, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { LiveAlarm } from '@cowtalk/shared';
import { apiGet } from '@web/api/client';
import 'leaflet/dist/leaflet.css';

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

const KOREA_CENTER: [number, number] = [36.0, 127.5];
const DEFAULT_ZOOM = 7;

const STATUS_COLORS: Readonly<Record<string, string>> = {
  normal: '#22c55e',
  caution: '#eab308',
  warning: '#f97316',
  critical: '#ef4444',
};

const GLOW_CLASSES: Readonly<Record<string, string>> = {
  critical: 'ct-marker-glow-critical',
  warning: 'ct-marker-glow-warning',
  caution: 'ct-marker-glow-caution',
};

// ── 마커 크기 함수 ──

function markerRadius(headCount: number): number {
  if (headCount >= 200) return 12;
  if (headCount >= 100) return 10;
  if (headCount >= 50) return 8;
  return 6;
}

// ── 선택된 농장으로 이동 ──

function FlyToSelected({ markers, selectedFarmId }: {
  readonly markers: readonly FarmMarkerData[];
  readonly selectedFarmId?: string | null;
}): null {
  const map = useMap();

  React.useEffect(() => {
    if (!selectedFarmId) return;
    const selected = markers.find((m) => m.farmId === selectedFarmId);
    if (selected) {
      map.flyTo([selected.lat, selected.lng], 11, { duration: 0.8 });
    }
  }, [selectedFarmId, markers, map]);

  return null;
}

// ── 클러스터링 ──

const CLUSTER_ZOOM_THRESHOLD = 9; // 이 줌 이하에서 클러스터링 활성화

interface ClusterGroup {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly markers: readonly FarmMarkerData[];
  readonly totalHead: number;
  readonly worstStatus: FarmMarkerData['status'];
}

/** 그리드 기반 클러스터링 — 줌 레벨에 따라 그리드 셀 크기 결정 */
function clusterMarkers(
  markers: readonly FarmMarkerData[],
  zoom: number,
): readonly ClusterGroup[] {
  if (markers.length <= 20 || zoom > CLUSTER_ZOOM_THRESHOLD) return [];

  // 줌별 그리드 크기 (도 단위)
  const gridSize = zoom <= 6 ? 2.0 : zoom <= 7 ? 1.0 : zoom <= 8 ? 0.5 : 0.3;

  const grid = new Map<string, FarmMarkerData[]>();
  for (const m of markers) {
    const cellX = Math.floor(m.lng / gridSize);
    const cellY = Math.floor(m.lat / gridSize);
    const key = `${String(cellX)}_${String(cellY)}`;
    const existing = grid.get(key) ?? [];
    existing.push(m);
    grid.set(key, existing);
  }

  const STATUS_PRIORITY: Record<string, number> = { critical: 3, warning: 2, caution: 1, normal: 0 };

  const clusters: ClusterGroup[] = [];
  for (const [key, group] of grid) {
    if (group.length <= 1) continue; // 단독 마커는 클러스터 아님

    const avgLat = group.reduce((s, m) => s + m.lat, 0) / group.length;
    const avgLng = group.reduce((s, m) => s + m.lng, 0) / group.length;
    const totalHead = group.reduce((s, m) => s + m.headCount, 0);
    const worstStatus = group.reduce<FarmMarkerData['status']>(
      (worst, m) => (STATUS_PRIORITY[m.status] ?? 0) > (STATUS_PRIORITY[worst] ?? 0) ? m.status : worst,
      'normal',
    );

    clusters.push({ id: key, lat: avgLat, lng: avgLng, markers: group, totalHead, worstStatus });
  }

  return clusters;
}

/** 클러스터에 포함되지 않은 단독 마커 추출 */
function getUnclusteredMarkers(
  markers: readonly FarmMarkerData[],
  clusters: readonly ClusterGroup[],
): readonly FarmMarkerData[] {
  const clusteredIds = new Set<string>();
  for (const c of clusters) {
    for (const m of c.markers) {
      clusteredIds.add(m.farmId);
    }
  }
  return markers.filter((m) => !clusteredIds.has(m.farmId));
}

/** 줌 레벨 추적 */
function ZoomTracker({ onZoomChange }: { readonly onZoomChange: (zoom: number) => void }): null {
  useMapEvents({
    zoomend: (e) => onZoomChange(e.target.getZoom()),
  });
  return null;
}

// ── 메인 컴포넌트 ──

// ── 기상 데이터 타입 ──

interface WeatherInfo {
  readonly temperature: number;
  readonly humidity: number;
  readonly thi: number;
  readonly description: string;
  readonly heatStressLevel: string;
  readonly coldStressLevel: string;
}

export function FarmMapWidget({ markers, selectedFarmId, onFarmClick, height = 420 }: Props): React.JSX.Element {
  const [weatherMap, setWeatherMap] = useState<Map<string, WeatherInfo>>(new Map());
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  // 클러스터링 계산 (zoom 변경 시 재계산)
  const clusters = useMemo(() => clusterMarkers(markers, zoom), [markers, zoom]);
  const unclustered = useMemo(() => getUnclusteredMarkers(markers, clusters), [markers, clusters]);
  const isClusterMode = clusters.length > 0;

  // 마커 hover 시 기상 데이터 lazy fetch
  const fetchWeather = useCallback((farmId: string) => {
    if (weatherMap.has(farmId)) return;
    apiGet<WeatherInfo>(`/weather/farm/${farmId}`)
      .then((result) => {
        setWeatherMap((prev) => {
          const next = new Map(prev);
          next.set(farmId, result);
          return next;
        });
      })
      .catch(() => { /* 기상 API 미설정 시 무시 */ });
  }, [weatherMap]);

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

      {/* Leaflet 지도 */}
      <div style={{ height, width: '100%' }}>
        <MapContainer
          center={KOREA_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%', background: '#0f172a' }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />
          <FlyToSelected markers={markers} selectedFarmId={selectedFarmId} />
          <ZoomTracker onZoomChange={setZoom} />

          {/* 클러스터 마커 (줌 ≤9 & 마커 20개 초과) */}
          {clusters.map((c) => {
            const color = STATUS_COLORS[c.worstStatus] ?? '#6b7280';
            const clusterRadius = Math.min(8 + Math.sqrt(c.markers.length) * 3, 24);
            return (
              <CircleMarker
                key={`cluster-${c.id}`}
                center={[c.lat, c.lng]}
                radius={clusterRadius}
                pathOptions={{
                  color: 'rgba(255,255,255,0.8)',
                  fillColor: color,
                  fillOpacity: 0.9,
                  weight: 2,
                }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {c.markers.length}개 농장
                  </div>
                  <div style={{ color: '#64748b', fontSize: 11 }}>
                    {c.totalHead.toLocaleString('ko-KR')}두 · 줌인하여 상세 보기
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}

          {/* 개별 마커 (클러스터에 포함되지 않은 것 or 줌 ≥10) */}
          {(isClusterMode ? unclustered : markers).map((m) => {
            const color = STATUS_COLORS[m.status] ?? '#6b7280';
            const radius = markerRadius(m.headCount);
            const isSelected = m.farmId === selectedFarmId;
            const ratePercent = (m.healthAlarmRate * 100).toFixed(1);
            const statusLabel = m.status === 'critical' ? '위험' : m.status === 'warning' ? '경고' : m.status === 'caution' ? '주의' : '정상';

            const glowClass = isSelected
              ? 'ct-marker-glow-selected'
              : GLOW_CLASSES[m.status] ?? '';

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
                  className: glowClass,
                }}
                eventHandlers={{
                  click: () => onFarmClick?.(m.farmId),
                  mouseover: () => fetchWeather(m.farmId),
                }}
              >
                <Tooltip
                  direction="top"
                  offset={[0, -8]}
                  opacity={0.95}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
                    {m.name}
                  </div>
                  <div style={{ color: '#64748b', fontSize: 11 }}>
                    {m.headCount}두 · 건강알람 {ratePercent}% · {statusLabel}
                  </div>
                  {weatherMap.has(m.farmId) && (() => {
                    const w = weatherMap.get(m.farmId)!;
                    const thiColor = w.thi >= 78 ? '#ef4444' : w.thi >= 72 ? '#f97316' : w.thi >= 68 ? '#eab308' : '#22c55e';
                    return (
                      <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 4, paddingTop: 4, fontSize: 11 }}>
                        <span style={{ color: '#3b82f6' }}>🌡️ {w.temperature}°C</span>
                        {' · '}
                        <span>💧 {w.humidity}%</span>
                        {' · '}
                        <span style={{ color: thiColor, fontWeight: 600 }}>THI {w.thi}</span>
                        {w.description && <span style={{ color: '#94a3b8' }}> · {w.description}</span>}
                      </div>
                    );
                  })()}
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
