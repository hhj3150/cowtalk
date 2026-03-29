// 전국 위험지도 미니맵 — 메인 대시보드 & 전국 현황 페이지 공용
// 개별 농장 마커 (실제 좌표) + 시도별 리스트 + 전국 요약

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip as LTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { RiskLevelBadge } from './RiskLevelBadge';
import type { RiskLevel } from './RiskLevelBadge';
import { apiGet } from '@web/api/client';

// ===========================
// 타입
// ===========================

export interface ProvinceStats {
  readonly province: string;
  readonly centerLat: number;
  readonly centerLng: number;
  readonly farmCount: number;
  readonly totalAnimals: number;
  readonly monitoredAnimals: number;
  readonly feverAnimals: number;
  readonly feverRate: number;
  readonly clusterFarms: number;
  readonly legalSuspects: number;
  readonly riskLevel: RiskLevel;
}

export interface NationalSummary {
  readonly totalFarms: number;
  readonly totalAnimals: number;
  readonly monitoredAnimals: number;
  readonly feverAnimals: number;
  readonly nationalFeverRate: number;
  readonly highRiskProvinces: number;
  readonly broadAlertActive: boolean;
  readonly broadAlertMessage: string | null;
}

export interface NationalData {
  readonly provinces: readonly ProvinceStats[];
  readonly nationalSummary: NationalSummary;
  readonly weeklyFeverTrend: readonly { week: string; feverRate: number }[];
}

interface MapFarm {
  readonly farmId: string;
  readonly farmName: string;
  readonly province: string;
  readonly district: string;
  readonly currentHeadCount: number;
  readonly feverCount: number;
  readonly riskLevel: RiskLevel;
  readonly lat: number;
  readonly lng: number;
}

// ===========================
// API
// ===========================

async function fetchNational(): Promise<NationalData> {
  return apiGet<NationalData>('/quarantine/national-situation');
}

async function fetchMapFarms(): Promise<readonly MapFarm[]> {
  return apiGet<readonly MapFarm[]>('/quarantine/map-farms');
}

// ===========================
// 상수
// ===========================

const RISK_COLOR: Readonly<Record<RiskLevel, string>> = {
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

const CARTO_DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// 농장 마커 크기: 두수 기반 (최소 4, 최대 12)
function farmMarkerRadius(headCount: number): number {
  return Math.max(4, Math.min(12, 4 + Math.sqrt(headCount) * 0.5));
}

// ===========================
// Props
// ===========================

interface NationalMiniMapProps {
  readonly onProvinceSelect: (province: string) => void;
  readonly mapHeight?: number;
  readonly showSummary?: boolean;
  readonly showBroadAlert?: boolean;
}

// ===========================
// 메인 컴포넌트
// ===========================

export function NationalMiniMap({
  onProvinceSelect,
  mapHeight = 320,
  showSummary = true,
  showBroadAlert = true,
}: NationalMiniMapProps): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['quarantine', 'national-situation'],
    queryFn: fetchNational,
    refetchInterval: 120_000,
  });

  const { data: mapFarms } = useQuery({
    queryKey: ['quarantine', 'map-farms'],
    queryFn: fetchMapFarms,
    refetchInterval: 120_000,
  });

  const summary = data?.nationalSummary;
  const provinces = data?.provinces ?? [];
  const farms = mapFarms ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-64 rounded-xl animate-pulse" style={{ background: 'var(--ct-border)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 광역 경보 배너 */}
      {showBroadAlert && summary?.broadAlertActive && (
        <div className="rounded-xl bg-red-600 p-3 text-white animate-pulse">
          <p className="font-bold text-xs">광역 방역 경보 발령</p>
          <p className="text-xs mt-0.5 opacity-90">{summary.broadAlertMessage}</p>
        </div>
      )}

      {/* 전국 요약 카드 */}
      {showSummary && summary && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: '감시 농장', value: summary.totalFarms.toLocaleString() },
            { label: '감시 두수', value: summary.totalAnimals.toLocaleString() },
            { label: '발열 두수', value: summary.feverAnimals.toLocaleString(), highlight: summary.feverAnimals > 0 },
            { label: '발열률', value: `${(summary.nationalFeverRate * 100).toFixed(2)}%`, highlight: summary.nationalFeverRate > 0.05 },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border p-2 text-center"
              style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
            >
              <p
                className="text-base font-bold"
                style={{ color: item.highlight ? '#ef4444' : 'var(--ct-text)' }}
              >
                {item.value}
              </p>
              <p className="text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>{item.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* 지도 + 시도 리스트 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Leaflet 지도 — 개별 농장 마커 */}
        <div
          className="lg:col-span-2 rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--ct-border)' }}
        >
          <div className="px-3 py-2 flex items-center justify-between" style={{ background: 'var(--ct-card)' }}>
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--ct-text)' }}>
                🗺️ 전국 목장 현황 ({farms.length}개)
              </p>
              <p className="text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>
                실제 좌표 기반 — 마커 클릭 시 농장 상세
              </p>
            </div>
            {/* 범례 */}
            <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>
              <span><span style={{ color: '#22c55e' }}>●</span> 안전</span>
              <span><span style={{ color: '#eab308' }}>●</span> 주의</span>
              <span><span style={{ color: '#f97316' }}>●</span> 경계</span>
              <span><span style={{ color: '#ef4444' }}>●</span> 심각</span>
            </div>
          </div>
          <div style={{ height: mapHeight }}>
            <MapContainer
              center={[36.2, 127.8]}
              zoom={7}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
              attributionControl={false}
            >
              <TileLayer url={CARTO_DARK} attribution={CARTO_ATTRIBUTION} subdomains="abcd" maxZoom={18} />
              {farms.map((farm) => {
                const color = RISK_COLOR[farm.riskLevel];
                const hasFever = farm.feverCount > 0;
                return (
                  <CircleMarker
                    key={farm.farmId}
                    center={[farm.lat, farm.lng]}
                    radius={farmMarkerRadius(farm.currentHeadCount)}
                    pathOptions={{
                      fillColor: color,
                      fillOpacity: hasFever ? 0.9 : 0.6,
                      color: hasFever ? '#fff' : color,
                      weight: hasFever ? 2 : 1,
                    }}
                  >
                    <LTooltip direction="top" offset={[0, -6]}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{farm.farmName}</span>
                    </LTooltip>
                    <Popup>
                      <div style={{ fontSize: 11, lineHeight: 1.6, color: '#1e293b', minWidth: 140 }}>
                        <p style={{ fontWeight: 700, margin: '0 0 4px', fontSize: 12 }}>{farm.farmName}</p>
                        <p style={{ margin: 0, color: '#64748b' }}>{farm.province} {farm.district}</p>
                        <p style={{ margin: '2px 0 0' }}>{farm.currentHeadCount}두</p>
                        {hasFever && (
                          <p style={{ margin: '2px 0 0', color: '#ef4444', fontWeight: 600 }}>
                            발열 {farm.feverCount}두
                          </p>
                        )}
                        <p style={{ margin: '2px 0 0' }}>
                          등급: <strong style={{ color }}>{farm.riskLevel.toUpperCase()}</strong>
                        </p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
        </div>

        {/* 시도별 리스트 */}
        <div
          className="rounded-xl border p-3 flex flex-col"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
          <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--ct-text)' }}>
            시도별 현황
          </h3>
          <div className="space-y-1 flex-1 overflow-y-auto" style={{ maxHeight: mapHeight - 40 }}>
            {provinces.map((p) => (
              <button
                key={p.province}
                onClick={() => onProvinceSelect(p.province)}
                className="w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors hover:opacity-80"
                style={{ background: 'var(--ct-bg)' }}
              >
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>{p.province}</p>
                  <p className="text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>
                    {p.farmCount}농장 · {p.feverAnimals > 0 ? (
                      <span style={{ color: '#ef4444' }}>발열 {p.feverAnimals}두</span>
                    ) : '정상'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <RiskLevelBadge level={p.riskLevel} size="sm" />
                  <span className="text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>›</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
