// 반경별 역학 위험 분석 페이지
// 동심원 위험 지도 (Leaflet) + 반경별 요약 카드

import React, { useEffect, useState, useCallback } from 'react';
import { apiGet } from '@web/api/client';
import { useAuthStore } from '@web/stores/auth.store';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// ===========================
// 타입
// ===========================

interface NearbyFarm {
  readonly farmId: string;
  readonly farmName: string;
  readonly distanceKm: number;
  readonly headCount: number;
  readonly hasSensor: boolean;
  readonly feverCount: number;
  readonly lat: number;
  readonly lng: number;
}

interface RadiusZone {
  readonly radiusKm: number;
  readonly radiusLabel: string;
  readonly farmCount: number;
  readonly totalHeadCount: number;
  readonly sensorRate: number;
  readonly feverAnimalCount: number;
  readonly feverFarmCount: number;
  readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
  readonly farms: readonly NearbyFarm[];
}

interface RadiusAnalysisData {
  readonly centerFarmId: string;
  readonly centerFarmName: string;
  readonly centerLat: number;
  readonly centerLng: number;
  readonly zones: readonly RadiusZone[];
  readonly totalFarmsInMaxRadius: number;
  readonly analyzedAt: string;
}

// ===========================
// 스타일 상수
// ===========================

const RISK_COLORS: Readonly<Record<string, string>> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

const RISK_LABELS: Readonly<Record<string, string>> = {
  low: '안전',
  medium: '주의',
  high: '경보',
  critical: '위험',
};

// ===========================
// 반경 선택 슬라이더
// ===========================

const RADIUS_OPTIONS = [0.5, 1, 3, 5, 10] as const;

// ===========================
// 메인 컴포넌트
// ===========================

export default function RadiusAnalysisPage(): React.JSX.Element {
  const farmId = useAuthStore((s) => s.user?.farmIds?.[0]);
  const [data, setData] = useState<RadiusAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRadius, setSelectedRadius] = useState<number>(5);
  const [selectedZone, setSelectedZone] = useState<RadiusZone | null>(null);

  const loadData = useCallback(() => {
    if (!farmId) return;
    setLoading(true);
    apiGet<RadiusAnalysisData>(`/epidemiology/radius/${farmId}`)
      .then((d) => {
        setData(d);
        const zone = d.zones.find((z) => z.radiusKm === selectedRadius) ?? d.zones[d.zones.length - 1];
        setSelectedZone(zone ?? null);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [farmId, selectedRadius]);

  useEffect(() => {
    loadData();
  }, [farmId]);

  useEffect(() => {
    if (data) {
      const zone = data.zones.find((z) => z.radiusKm === selectedRadius) ?? null;
      setSelectedZone(zone);
    }
  }, [data, selectedRadius]);

  const center: [number, number] = data
    ? [data.centerLat, data.centerLng]
    : [37.5665, 126.9780];  // 서울 기본값

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: 'var(--ct-text)' }}>
        🗺️ 반경별 역학 위험 분석
      </h1>
      <p style={{ fontSize: 12, color: 'var(--ct-text-muted)', margin: '0 0 20px' }}>
        우리 농장 기준 각 반경 내 농장·두수·발열 현황 실시간 분석
      </p>

      {/* 반경 선택 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {RADIUS_OPTIONS.map((r) => {
          const zone = data?.zones.find((z) => z.radiusKm === r);
          const isSelected = selectedRadius === r;
          const riskColor = zone ? RISK_COLORS[zone.riskLevel] : 'var(--ct-border)';
          return (
            <button
              key={r}
              type="button"
              onClick={() => setSelectedRadius(r)}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: isSelected ? 700 : 400,
                background: isSelected ? riskColor : 'var(--ct-card)',
                border: `2px solid ${isSelected ? riskColor : 'var(--ct-border)'}`,
                color: isSelected ? '#fff' : 'var(--ct-text)',
                transition: 'all 0.15s',
              }}
            >
              {r < 1 ? `${r * 1000}m` : `${r}km`}
              {zone && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.8 }}>{zone.feverFarmCount > 0 ? `⚠️${zone.feverFarmCount}` : '✓'}</span>}
            </button>
          );
        })}
        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 8, fontSize: 12, cursor: 'pointer', background: 'var(--ct-primary)', color: '#fff', border: 'none', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '분석 중...' : '🔄 갱신'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
        {/* 지도 */}
        <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--ct-border)', height: 500 }}>
          <MapContainer center={center} zoom={11} style={{ width: '100%', height: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap contributors'
            />

            {/* 중심 농장 */}
            {data && (
              <CircleMarker
                center={[data.centerLat, data.centerLng]}
                radius={14}
                pathOptions={{ fillColor: '#3b82f6', color: '#1d4ed8', weight: 3, fillOpacity: 1 }}
              >
                <Tooltip permanent>{data.centerFarmName}</Tooltip>
              </CircleMarker>
            )}

            {/* 선택 반경 내 농장들 */}
            {selectedZone?.farms.map((farm) => (
              <CircleMarker
                key={farm.farmId}
                center={[farm.lat, farm.lng]}
                radius={farm.feverCount > 0 ? 10 : 7}
                pathOptions={{
                  fillColor: farm.feverCount > 0 ? '#ef4444' : '#22c55e',
                  color: farm.feverCount > 0 ? '#b91c1c' : '#15803d',
                  weight: 2,
                  fillOpacity: 0.8,
                }}
              >
                <Popup>
                  <div style={{ fontSize: 13 }}>
                    <strong>{farm.farmName}</strong><br />
                    거리: {farm.distanceKm}km<br />
                    두수: {farm.headCount.toLocaleString()}두<br />
                    {farm.feverCount > 0 && <span style={{ color: '#ef4444' }}>⚠️ 발열 {farm.feverCount}두</span>}
                    {farm.hasSensor && <span style={{ color: '#22c55e' }}> 📡 센서</span>}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* 사이드 패널 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 선택 반경 요약 */}
          {selectedZone ? (
            <div style={{ background: 'var(--ct-card)', border: `2px solid ${RISK_COLORS[selectedZone.riskLevel]}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{selectedZone.radiusLabel} 반경</h3>
                <span style={{
                  background: RISK_COLORS[selectedZone.riskLevel], color: '#fff',
                  padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                }}>
                  {RISK_LABELS[selectedZone.riskLevel]}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <StatCard label="농장 수" value={`${selectedZone.farmCount}개`} />
                <StatCard label="총 두수" value={selectedZone.totalHeadCount.toLocaleString()} />
                <StatCard label="발열 농장" value={`${selectedZone.feverFarmCount}개`} danger={selectedZone.feverFarmCount > 0} />
                <StatCard label="발열 개체" value={`${selectedZone.feverAnimalCount}두`} danger={selectedZone.feverAnimalCount > 0} />
              </div>
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(0,0,0,0.05)', fontSize: 11, color: 'var(--ct-text-muted)' }}>
                센서 보급률: {(selectedZone.sensorRate * 100).toFixed(0)}% ({selectedZone.farmCount > 0 ? `${Math.round(selectedZone.sensorRate * selectedZone.farmCount)}/${selectedZone.farmCount}개 농장` : '-'})
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--ct-text-muted)', fontSize: 13 }}>
              {loading ? '분석 중...' : '데이터 없음'}
            </div>
          )}

          {/* 전 반경 요약 */}
          {data?.zones.map((zone) => (
            <div
              key={zone.radiusKm}
              onClick={() => setSelectedRadius(zone.radiusKm)}
              style={{
                background: 'var(--ct-card)', border: `1px solid ${selectedRadius === zone.radiusKm ? RISK_COLORS[zone.riskLevel] : 'var(--ct-border)'}`,
                borderRadius: 10, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: RISK_COLORS[zone.riskLevel], flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{zone.radiusLabel}</span>
              <span style={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>{zone.farmCount}개 농장</span>
              {zone.feverFarmCount > 0 && (
                <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 700 }}>⚠️ {zone.feverFarmCount}</span>
              )}
            </div>
          ))}

          {data && (
            <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', textAlign: 'right' }}>
              분석: {new Date(data.analyzedAt).toLocaleString('ko-KR')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, danger }: { label: string; value: string; danger?: boolean }): React.JSX.Element {
  return (
    <div style={{ padding: '8px 10px', borderRadius: 8, background: danger ? 'rgba(239,68,68,0.1)' : 'rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: danger ? '#ef4444' : 'var(--ct-text)' }}>{value}</div>
    </div>
  );
}
