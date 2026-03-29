// 전국 위험지도 미니맵 — 메인 대시보드 & 전국 현황 페이지 공용
// Leaflet 시도 원 마커 + 시도별 리스트 + 전국 요약

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Circle as LCircle, Popup } from 'react-leaflet';
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

// ===========================
// API
// ===========================

async function fetchNational(): Promise<NationalData> {
  return apiGet<NationalData>('/quarantine/national-situation');
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

function provinceRadius(farmCount: number): number {
  return Math.max(8000, Math.min(30000, farmCount * 2000));
}

// ===========================
// Props
// ===========================

interface NationalMiniMapProps {
  /** 시도 클릭 시 콜백 */
  readonly onProvinceSelect: (province: string) => void;
  /** 지도 높이 (px) */
  readonly mapHeight?: number;
  /** 전국 요약 카드 표시 여부 */
  readonly showSummary?: boolean;
  /** 광역 경보 배너 표시 여부 */
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

  const summary = data?.nationalSummary;
  const provinces = data?.provinces ?? [];

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
        {/* Leaflet 지도 */}
        <div
          className="lg:col-span-2 rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--ct-border)' }}
        >
          <div className="px-3 py-2" style={{ background: 'var(--ct-card)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--ct-text)' }}>
              🗺️ 시도별 위험 등급
            </p>
            <p className="text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>
              원 클릭 시 해당 시도 농장 드릴다운
            </p>
          </div>
          <div style={{ height: mapHeight }}>
            <MapContainer
              center={[36.5, 127.5]}
              zoom={7}
              style={{ height: '100%', width: '100%' }}
              zoomControl={true}
              attributionControl={false}
            >
              <TileLayer url={CARTO_DARK} attribution={CARTO_ATTRIBUTION} subdomains="abcd" maxZoom={20} />
              {provinces.map((p) => {
                const color = RISK_COLOR[p.riskLevel];
                return (
                  <LCircle
                    key={p.province}
                    center={[p.centerLat, p.centerLng]}
                    radius={provinceRadius(p.farmCount)}
                    pathOptions={{
                      fillColor: color,
                      fillOpacity: 0.6,
                      color,
                      weight: 2,
                    }}
                    eventHandlers={{
                      click: () => onProvinceSelect(p.province),
                    }}
                  >
                    <Popup>
                      <div style={{ fontSize: 11, lineHeight: 1.5, color: '#1e293b' }}>
                        <p style={{ fontWeight: 700, margin: '0 0 2px', fontSize: 12 }}>{p.province}</p>
                        <p style={{ margin: 0 }}>농장 {p.farmCount}개 | {p.totalAnimals.toLocaleString()}두</p>
                        <p style={{ margin: 0 }}>발열 {p.feverAnimals}두 ({(p.feverRate * 100).toFixed(1)}%)</p>
                        <p style={{ margin: 0 }}>등급: <strong>{p.riskLevel.toUpperCase()}</strong></p>
                      </div>
                    </Popup>
                  </LCircle>
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
