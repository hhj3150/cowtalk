// 질병 클러스터 시각화

import React from 'react';
import { Circle, Popup } from 'react-leaflet';

interface ClusterData {
  readonly signalType: string;
  readonly center: { lat: number; lng: number };
  readonly radius: number; // meters
  readonly severity: string;
  readonly affectedFarms: readonly string[];
}

interface Props {
  readonly clusters: readonly ClusterData[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
};

export function ClusterOverlay({ clusters }: Props): React.JSX.Element {
  return (
    <>
      {clusters.map((cluster, i) => (
        <Circle
          key={i}
          center={[cluster.center.lat, cluster.center.lng]}
          radius={cluster.radius}
          pathOptions={{
            color: SEVERITY_COLORS[cluster.severity] ?? '#6b7280',
            fillOpacity: 0.15,
            weight: 2,
          }}
        >
          <Popup>
            <div>
              <p className="font-medium">{cluster.signalType}</p>
              <p className="text-xs text-gray-500">영향 농장: {cluster.affectedFarms.length}개</p>
              <p className="text-xs text-gray-500">반경: {(cluster.radius / 1000).toFixed(1)}km</p>
            </div>
          </Popup>
        </Circle>
      ))}
    </>
  );
}
