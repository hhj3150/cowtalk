// 확산 추이 차트 — 클러스터의 시간축 변화를 시각화

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';

interface Props {
  readonly clusterId: string;
  readonly days?: number;
}

interface TrendData {
  readonly clusterId: string;
  readonly snapshots: readonly SnapshotEntry[];
}

interface SnapshotEntry {
  readonly date: string;
  readonly clusterCount: number;
  readonly totalHealthEvents: number;
  readonly warningLevel: string;
}

export function SpreadTrendChart({ clusterId, days = 14 }: Props): React.JSX.Element {
  const { data } = useQuery({
    queryKey: ['epidemic-cluster-trend', clusterId, days],
    queryFn: () =>
      apiGet<{ data: TrendData }>(`/epidemic/clusters/${clusterId}/trend?days=${days}`).then((r) => r.data),
  });

  const snapshots = data?.snapshots ?? [];

  if (snapshots.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 16, color: 'var(--ct-text-muted)', fontSize: 12 }}>
        추이 데이터가 아직 없습니다.
      </div>
    );
  }

  // 간단한 바 차트 (CSS 기반)
  const maxEvents = Math.max(...snapshots.map((s) => s.totalHealthEvents), 1);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 2,
          height: 80,
          paddingTop: 4,
        }}
      >
        {snapshots.map((snapshot) => {
          const height = (snapshot.totalHealthEvents / maxEvents) * 100;
          const color = getLevelColor(snapshot.warningLevel);

          return (
            <div
              key={snapshot.date}
              title={`${snapshot.date}: ${snapshot.totalHealthEvents}건`}
              style={{
                flex: 1,
                background: color,
                height: `${Math.max(height, 4)}%`,
                borderRadius: '3px 3px 0 0',
                minWidth: 8,
                transition: 'height 0.3s',
                cursor: 'default',
              }}
            />
          );
        })}
      </div>

      {/* X축 날짜 라벨 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
          fontSize: 9,
          color: 'var(--ct-text-muted)',
        }}
      >
        <span>{formatShortDate(snapshots[0]?.date ?? '')}</span>
        <span>{formatShortDate(snapshots[snapshots.length - 1]?.date ?? '')}</span>
      </div>

      {/* 요약 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          marginTop: 8,
          fontSize: 11,
          color: 'var(--ct-text-secondary)',
        }}
      >
        <span>총 {snapshots.reduce((s, d) => s + d.totalHealthEvents, 0)}건</span>
        <span>일평균 {Math.round(snapshots.reduce((s, d) => s + d.totalHealthEvents, 0) / snapshots.length)}건</span>
      </div>
    </div>
  );
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'outbreak':
      return '#ef4444';
    case 'warning':
      return '#f97316';
    case 'watch':
      return '#eab308';
    default:
      return '#6b7280';
  }
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
