// 전염병 위험도 지도 위젯
// 농장 위치 + 클러스터 영역 표시 + 위험도별 색상

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEpidemicClusters, getEpidemicRiskMap } from '@web/api/epidemic.api';
import type { ClusterResponse, FarmRiskResponse } from '@web/api/epidemic.api';

interface Props {
  readonly onClusterClick?: (clusterId: string) => void;
}

export function EpidemicMapWidget({ onClusterClick }: Props): React.JSX.Element {
  const { data: clusters } = useQuery({
    queryKey: ['epidemic-clusters'],
    queryFn: () => getEpidemicClusters(),
    refetchInterval: 120_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: riskMap } = useQuery({
    queryKey: ['epidemic-risk-map'],
    queryFn: getEpidemicRiskMap,
    refetchInterval: 120_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);

  const clusterList = clusters ?? [];
  const highRiskFarms = riskMap?.riskMap?.filter((f) => f.riskScore >= 60) ?? [];

  return (
    <div
      style={{
        background: 'var(--ct-card)',
        borderRadius: 12,
        padding: 16,
        border: '1px solid var(--ct-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--ct-text)' }}>
          방역 현황 지도
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <LegendDot color="#ef4444" label="발병" />
          <LegendDot color="#f97316" label="경고" />
          <LegendDot color="#eab308" label="주의" />
          <LegendDot color="#22c55e" label="정상" />
        </div>
      </div>

      {/* 클러스터 목록 */}
      {clusterList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--ct-text-muted)', fontSize: 13 }}>
          현재 감지된 질병 클러스터가 없습니다.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clusterList.map((cluster) => (
            <ClusterCard
              key={cluster.clusterId}
              cluster={cluster}
              isSelected={selectedCluster === cluster.clusterId}
              onClick={() => {
                setSelectedCluster(cluster.clusterId);
                onClusterClick?.(cluster.clusterId);
              }}
            />
          ))}
        </div>
      )}

      {/* 고위험 농장 목록 */}
      {highRiskFarms.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text-secondary)', marginBottom: 6 }}>
            인접 고위험 농장 ({highRiskFarms.length}개)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {highRiskFarms.slice(0, 5).map((farm) => (
              <RiskFarmRow key={farm.farmId} farm={farm} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================================
// 서브 컴포넌트
// ======================================================================

function ClusterCard({
  cluster,
  isSelected,
  onClick,
}: {
  readonly cluster: ClusterResponse;
  readonly isSelected: boolean;
  readonly onClick: () => void;
}): React.JSX.Element {
  const levelColors: Record<string, string> = {
    outbreak: '#ef4444',
    warning: '#f97316',
    watch: '#eab308',
  };

  const color = levelColors[cluster.level] ?? '#6b7280';
  const trendLabel: Record<string, string> = {
    accelerating: '가속',
    stable: '안정',
    decelerating: '감속',
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      style={{
        background: isSelected ? `${color}15` : 'var(--ct-card-hover)',
        border: `1px solid ${isSelected ? color : 'var(--ct-border)'}`,
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: color,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ct-text)' }}>
            {cluster.diseaseType}
          </span>
        </div>
        <span style={{ fontSize: 11, color, fontWeight: 700, textTransform: 'uppercase' }}>
          {cluster.level}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ct-text-secondary)', marginTop: 4 }}>
        {cluster.farmCount}개 농장 · {cluster.eventCount}건 이벤트 · 반경 {cluster.radiusKm.toFixed(1)}km
        · 확산 {trendLabel[cluster.spreadTrend] ?? cluster.spreadTrend}
      </div>
    </div>
  );
}

function RiskFarmRow({ farm }: { readonly farm: FarmRiskResponse }): React.JSX.Element {
  const scoreColor = farm.riskScore >= 80 ? '#ef4444' : farm.riskScore >= 60 ? '#f97316' : '#eab308';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 8px',
        fontSize: 12,
        color: 'var(--ct-text-secondary)',
      }}
    >
      <span>{farm.farmName} ({farm.distanceKm}km)</span>
      <span style={{ color: scoreColor, fontWeight: 600 }}>위험도 {farm.riskScore}</span>
    </div>
  );
}

function LegendDot({ color, label }: { readonly color: string; readonly label: string }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>{label}</span>
    </div>
  );
}
