// KPI 카드 — 큰 숫자(28px) + 작은 라벨(11px) + hover border + 클릭 드릴다운

import React from 'react';
import { useDrilldown } from '@web/hooks/useDrilldown';
import type { DrilldownFilter } from '@web/stores/drilldown.store';

interface Props {
  readonly label: string;
  readonly value: number | string;
  readonly unit?: string;
  readonly trend?: 'up' | 'down' | 'stable';
  readonly trendValue?: number | null;
  readonly drilldownType?: DrilldownFilter;
  readonly severity?: string | null;
  readonly icon?: React.ReactNode;
}

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'var(--ct-danger)',
  high: 'var(--ct-warning)',
  medium: '#EAB308',
  low: 'var(--ct-info)',
};

const TREND_MAP: Record<string, { icon: string; color: string }> = {
  up: { icon: '↑', color: 'var(--ct-danger)' },
  down: { icon: '↓', color: 'var(--ct-success)' },
  stable: { icon: '→', color: 'var(--ct-text-secondary)' },
};

export function KpiCard({
  label,
  value,
  unit,
  trend,
  trendValue,
  drilldownType,
  severity,
  icon,
}: Props): React.JSX.Element {
  const { openDrilldown } = useDrilldown();
  const isClickable = Boolean(drilldownType);
  const borderLeftColor = severity ? SEVERITY_BORDER[severity] ?? 'var(--ct-border)' : 'var(--ct-border)';
  const trendInfo = trend ? TREND_MAP[trend] : null;

  function handleClick(): void {
    if (drilldownType) {
      openDrilldown(drilldownType, label);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isClickable}
      aria-label={`${label}: ${value}${unit ? ` ${unit}` : ''}${isClickable ? ' — 클릭하여 상세 보기' : ''}`}
      className={`ct-card flex flex-col p-4 text-left transition-all ${
        isClickable
          ? 'cursor-pointer hover:shadow-md'
          : 'cursor-default'
      }`}
      style={{
        borderLeft: `3px solid ${borderLeftColor}`,
        borderRadius: '12px',
      }}
      onMouseEnter={(e) => {
        if (isClickable) {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-border)';
          (e.currentTarget as HTMLElement).style.borderLeft = `3px solid ${borderLeftColor}`;
        }
      }}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium" style={{ fontSize: '11px', color: 'var(--ct-text-secondary)' }}>
          {label}
        </span>
        {icon && <span className="text-base">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-bold" style={{ fontSize: '28px', lineHeight: '1.2', color: 'var(--ct-text)' }}>
          {value}
        </span>
        {unit && (
          <span className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
            {unit}
          </span>
        )}
      </div>
      {trendInfo && (
        <div className="mt-1 flex items-center gap-1 text-xs" style={{ color: trendInfo.color }}>
          <span>{trendInfo.icon}</span>
          {trendValue != null && <span>{Math.abs(trendValue)}%</span>}
        </div>
      )}
      {isClickable && (
        <span className="mt-2" style={{ fontSize: '10px', color: 'var(--ct-primary)' }}>
          클릭하여 상세 보기
        </span>
      )}
    </button>
  );
}
