// 전국 방역 상황 종합
// 시도별 위험 등급 지도 + 드릴다운 + 광역 경보 배너

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer } from 'recharts';
import { RiskLevelBadge } from '@web/components/epidemiology/RiskLevelBadge';
import type { RiskLevel } from '@web/components/epidemiology/RiskLevelBadge';

// ===========================
// 타입
// ===========================

interface ProvinceStats {
  province: string;
  centerLat: number;
  centerLng: number;
  farmCount: number;
  totalAnimals: number;
  monitoredAnimals: number;
  feverAnimals: number;
  feverRate: number;
  clusterFarms: number;
  legalSuspects: number;
  riskLevel: RiskLevel;
}

interface DistrictStats {
  district: string;
  province: string;
  farmCount: number;
  totalAnimals: number;
  feverAnimals: number;
  feverRate: number;
  riskLevel: RiskLevel;
}

interface NationalData {
  provinces: ProvinceStats[];
  nationalSummary: {
    totalFarms: number;
    totalAnimals: number;
    monitoredAnimals: number;
    feverAnimals: number;
    nationalFeverRate: number;
    highRiskProvinces: number;
    broadAlertActive: boolean;
    broadAlertMessage: string | null;
  };
  weeklyFeverTrend: { week: string; feverRate: number }[];
}

// ===========================
// API 훅
// ===========================

async function fetchNational(): Promise<NationalData> {
  const res = await fetch('/api/quarantine/national-situation');
  if (!res.ok) throw new Error('전국 현황 조회 실패');
  const json = await res.json() as { success: boolean; data: NationalData };
  return json.data;
}

async function fetchProvince(province: string): Promise<DistrictStats[]> {
  const res = await fetch(`/api/quarantine/national-situation/${encodeURIComponent(province)}`);
  if (!res.ok) throw new Error('시도 상세 조회 실패');
  const json = await res.json() as { success: boolean; data: DistrictStats[] };
  return json.data;
}

// ===========================
// 위험 등급 → 지도 색상
// ===========================

const RISK_COLOR: Record<RiskLevel, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

// ===========================
// 메인 컴포넌트
// ===========================

export default function NationalSituation(): React.JSX.Element {
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['quarantine', 'national-situation'],
    queryFn: fetchNational,
    refetchInterval: 120_000,
  });

  const { data: districtData, isLoading: districtLoading } = useQuery({
    queryKey: ['quarantine', 'national-situation', selectedProvince],
    queryFn: () => fetchProvince(selectedProvince!),
    enabled: !!selectedProvince,
  });

  const summary = data?.nationalSummary;
  const trendData = (data?.weeklyFeverTrend ?? []).map((d) => ({
    ...d,
    rate: (d.feverRate * 100).toFixed(2),
  }));

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>
          🇰🇷 전국 방역 상황 종합
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
          시도별 위험 등급 — 시도 클릭 시 시군구 드릴다운
        </p>
      </div>

      {/* 광역 경보 배너 */}
      {summary?.broadAlertActive && (
        <div className="rounded-xl bg-red-600 p-4 text-white animate-pulse">
          <p className="font-bold text-sm">🚨 광역 방역 경보 발령</p>
          <p className="text-sm mt-0.5 opacity-90">{summary.broadAlertMessage}</p>
        </div>
      )}

      {/* 전국 요약 카드 4개 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '감시 농장', value: summary?.totalFarms.toLocaleString() ?? '—', icon: '🏠' },
          { label: '감시 두수', value: summary?.totalAnimals.toLocaleString() ?? '—', icon: '🐄' },
          { label: '발열 두수', value: summary?.feverAnimals.toLocaleString() ?? '—', icon: '🌡️' },
          { label: '발열률', value: summary ? `${(summary.nationalFeverRate * 100).toFixed(2)}%` : '—', icon: '📊' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border p-4"
            style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
          >
            <span className="text-xl">{item.icon}</span>
            <p className="text-xl font-bold mt-2" style={{ color: 'var(--ct-text)' }}>{item.value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>{item.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 전국 지도 */}
        <div
          className="lg:col-span-2 rounded-xl border overflow-hidden"
          style={{ borderColor: 'var(--ct-border)' }}
        >
          <div className="p-3" style={{ background: 'var(--ct-card)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
              🗺️ 시도별 위험 등급 지도
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
              원 크기 = 농장 수, 색상 = 위험 등급
            </p>
          </div>
          <MapContainer
            center={[36.5, 127.5]}
            zoom={7}
            style={{ height: '400px', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            {(data?.provinces ?? []).map((p) => (
              <CircleMarker
                key={p.province}
                center={[p.centerLat, p.centerLng]}
                radius={Math.max(10, Math.min(30, p.farmCount / 5))}
                fillColor={RISK_COLOR[p.riskLevel]}
                color={RISK_COLOR[p.riskLevel]}
                fillOpacity={0.7}
                opacity={1}
                weight={2}
                eventHandlers={{ click: () => setSelectedProvince(p.province) }}
              >
                <Tooltip>
                  <div className="text-sm">
                    <strong>{p.province}</strong><br />
                    농장 {p.farmCount}개 | {p.totalAnimals.toLocaleString()}두<br />
                    발열 {p.feverAnimals}두 ({(p.feverRate * 100).toFixed(1)}%)<br />
                    등급: <strong>{p.riskLevel.toUpperCase()}</strong>
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* 시도별 통계 테이블 + 드릴다운 */}
        <div
          className="rounded-xl border p-4 flex flex-col"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ct-text)' }}>
            {selectedProvince ? `${selectedProvince} 시군구 현황` : '시도별 현황'}
          </h3>

          {selectedProvince && (
            <button
              onClick={() => setSelectedProvince(null)}
              className="text-xs mb-3 self-start px-2 py-1 rounded border"
              style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text-secondary)' }}
            >
              ← 전체 보기
            </button>
          )}

          {isLoading || districtLoading ? (
            <div className="space-y-2 flex-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--ct-border)' }} />
              ))}
            </div>
          ) : selectedProvince && districtData ? (
            <div className="space-y-1.5 flex-1 overflow-y-auto">
              {districtData.map((d) => (
                <div
                  key={d.district}
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: 'var(--ct-bg)' }}
                >
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>{d.district}</p>
                    <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                      {d.farmCount}농장 · {d.totalAnimals}두
                    </p>
                  </div>
                  <RiskLevelBadge level={d.riskLevel} size="sm" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5 flex-1 overflow-y-auto">
              {(data?.provinces ?? []).map((p) => (
                <button
                  key={p.province}
                  onClick={() => setSelectedProvince(p.province)}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors"
                  style={{ background: 'var(--ct-bg)' }}
                >
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>{p.province}</p>
                    <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                      {p.farmCount}농장 · {p.feverAnimals}두 발열
                    </p>
                  </div>
                  <RiskLevelBadge level={p.riskLevel} size="sm" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 전국 발열률 주간 추이 */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
      >
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ct-text)' }}>
          📉 전국 발열률 주간 추이 (%)
        </h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} unit="%" />
            <ChartTooltip formatter={(v) => `${v}%`} />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="발열률"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
