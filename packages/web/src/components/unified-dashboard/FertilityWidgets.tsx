// 통합 대시보드 — 번식 위젯 2종 (현황 차트 + 관리 목록)

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { FertilityStatusBar, FertilityManagementItem } from '@cowtalk/shared';

interface Props {
  readonly statusData: readonly FertilityStatusBar[];
  readonly managementItems: readonly FertilityManagementItem[];
  readonly chartHeight?: number;
  readonly onManagementClick?: (item: FertilityManagementItem) => void;
}

const STATUS_BAR_CONFIG = [
  { dataKey: 'estrus', label: '발정', color: '#ef4444' },
  { dataKey: 'insemination', label: '수정', color: '#f97316' },
  { dataKey: 'pregnancyCheck', label: '임신감정', color: '#3b82f6' },
  { dataKey: 'calving', label: '분만', color: '#22c55e' },
] as const;

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'var(--ct-danger)',
  high: 'var(--ct-warning)',
  medium: '#eab308',
  low: 'var(--ct-info)',
  info: 'var(--ct-text-secondary)',
};

function formatDate(val: string): string {
  const d = new Date(val);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function FertilityStatusChart({
  data,
  height,
}: {
  readonly data: readonly FertilityStatusBar[];
  readonly height: number;
}): React.JSX.Element {
  return (
    <div>
      <h4
        className="mb-2 font-medium"
        style={{ fontSize: '12px', color: 'var(--ct-text-secondary)' }}
      >
        번식 현황
      </h4>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data as unknown as Record<string, unknown>[]}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: 'var(--ct-text-secondary)' }}
            tickFormatter={formatDate}
            stroke="var(--ct-border)"
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--ct-text-secondary)' }}
            stroke="var(--ct-border)"
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--ct-card)',
              border: '1px solid var(--ct-border)',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(val: string) => val}
            formatter={(value: number, name: string) => {
              const cfg = STATUS_BAR_CONFIG.find((c) => c.dataKey === name);
              return [`${value}건`, cfg?.label ?? name];
            }}
          />
          <Legend
            verticalAlign="top"
            wrapperStyle={{ fontSize: '11px' }}
            formatter={(value: string) => {
              const cfg = STATUS_BAR_CONFIG.find((c) => c.dataKey === value);
              return cfg?.label ?? value;
            }}
          />
          {STATUS_BAR_CONFIG.map((cfg) => (
            <Bar
              key={cfg.dataKey}
              dataKey={cfg.dataKey}
              name={cfg.dataKey}
              stackId="fertility"
              fill={cfg.color}
              radius={0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FertilityManagementList({
  items,
  onItemClick,
}: {
  readonly items: readonly FertilityManagementItem[];
  readonly onItemClick?: (item: FertilityManagementItem) => void;
}): React.JSX.Element {
  return (
    <div>
      <h4
        className="mb-2 font-medium"
        style={{ fontSize: '12px', color: 'var(--ct-text-secondary)' }}
      >
        번식 관리
      </h4>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const hasCount = item.count > 0;
          const badgeColor = hasCount
            ? SEVERITY_COLORS[item.severity] ?? 'var(--ct-text-secondary)'
            : 'var(--ct-border)';

          return (
            <li key={`${item.category}-${item.label}`}>
              <button
                type="button"
                onClick={() => onItemClick?.(item)}
                disabled={!onItemClick}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                  onItemClick ? 'cursor-pointer hover:bg-black/5' : 'cursor-default'
                }`}
              >
                <span style={{ fontSize: '14px' }}>{item.icon}</span>
                <span
                  className="flex-1 text-sm"
                  style={{
                    color: hasCount ? 'var(--ct-text)' : 'var(--ct-text-secondary)',
                  }}
                >
                  {item.label}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: hasCount ? badgeColor : 'var(--ct-border)',
                    color: hasCount ? '#ffffff' : 'var(--ct-text-secondary)',
                    minWidth: '24px',
                    textAlign: 'center',
                  }}
                >
                  {item.count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FertilityWidgets({
  statusData,
  managementItems,
  chartHeight = 180,
  onManagementClick,
}: Props): React.JSX.Element {
  return (
    <div className="ct-card flex flex-col gap-4 p-4" style={{ borderRadius: '12px' }}>
      <h3
        className="font-semibold"
        style={{ fontSize: '13px', color: 'var(--ct-text)' }}
      >
        번식 관리
      </h3>
      <FertilityStatusChart data={statusData} height={chartHeight} />
      <FertilityManagementList items={managementItems} onItemClick={onManagementClick} />
    </div>
  );
}
