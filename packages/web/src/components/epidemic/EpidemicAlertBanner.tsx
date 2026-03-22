// 전염병 경보 배너 — 대시보드 상단에 표시
// watch(노랑) / warning(주황) / outbreak(빨강)

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEpidemicDashboard } from '@web/api/epidemic.api';
import type { EpidemicAlertLevel } from '@cowtalk/shared';

interface Props {
  readonly onDetailClick?: () => void;
}

const LEVEL_STYLES: Record<EpidemicAlertLevel, { bg: string; border: string; icon: string; label: string }> = {
  normal: { bg: 'transparent', border: 'transparent', icon: '', label: '' },
  watch: {
    bg: 'rgba(234, 179, 8, 0.15)',
    border: '#eab308',
    icon: '⚠',
    label: '주의',
  },
  warning: {
    bg: 'rgba(249, 115, 22, 0.15)',
    border: '#f97316',
    icon: '🔶',
    label: '경고',
  },
  outbreak: {
    bg: 'rgba(239, 68, 68, 0.2)',
    border: '#ef4444',
    icon: '🔴',
    label: '발병 경보',
  },
};

export function EpidemicAlertBanner({ onDetailClick }: Props): React.JSX.Element | null {
  const { data } = useQuery({
    queryKey: ['epidemic-dashboard'],
    queryFn: getEpidemicDashboard,
    refetchInterval: 120_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!data || data.currentLevel === 'normal') return null;

  const style = LEVEL_STYLES[data.currentLevel];

  return (
    <div
      onClick={onDetailClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onDetailClick?.();
      }}
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 10,
        padding: '12px 20px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: onDetailClick ? 'pointer' : 'default',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>{style.icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: style.border }}>
            전염병 조기경보: {style.label}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ct-text-secondary)', marginTop: 2 }}>
            활성 클러스터 {data.activeClusters}개 · 경보 {data.activeWarnings}건
            {data.newClustersLast24h > 0 && ` · 신규 ${data.newClustersLast24h}개 (24h)`}
          </div>
        </div>
      </div>

      {onDetailClick && (
        <span style={{ fontSize: 12, color: style.border, fontWeight: 600 }}>
          상세 보기 →
        </span>
      )}
    </div>
  );
}
