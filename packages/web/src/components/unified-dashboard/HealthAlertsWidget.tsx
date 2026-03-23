// 건강 알림 현황 — smaXtec Health Alerts 기본 위젯
import React from 'react';

interface HealthAlertItem {
  readonly category: string;
  readonly label: string;
  readonly icon: string;
  readonly count: number;
}

interface Props {
  readonly items: readonly HealthAlertItem[];
  readonly onCategoryClick?: (category: string) => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  temperature_high: '#ef4444',
  clinical_condition: '#ef4444',
  temperature_low: '#3b82f6',
  rumination_decrease: '#f97316',
  activity_decrease: '#eab308',
  drinking_decrease: '#06b6d4',
  health_general: '#f97316',
};

export function HealthAlertsWidget({ items, onCategoryClick }: Props): React.JSX.Element {
  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <div style={{
      background: 'var(--ct-card)',
      border: '1px solid var(--ct-border)',
      borderRadius: 12,
      padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ct-text)', margin: 0 }}>
          🩺 건강 알림 현황
        </h3>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: total > 0 ? '#ef4444' : '#22c55e',
          padding: '2px 8px',
          borderRadius: 10,
          background: total > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
        }}>
          {total > 0 ? `${total}건 감지` : '정상'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item) => {
          const color = SEVERITY_COLOR[item.category] ?? 'var(--ct-text-muted)';
          const hasAlert = item.count > 0;
          return (
            <div
              key={item.category}
              onClick={() => hasAlert && onCategoryClick?.(item.category)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: 8,
                background: hasAlert ? `${color}10` : 'transparent',
                cursor: hasAlert ? 'pointer' : 'default',
                opacity: hasAlert ? 1 : 0.5,
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span style={{
                  fontSize: 13,
                  fontWeight: hasAlert ? 700 : 400,
                  color: hasAlert ? 'var(--ct-text)' : 'var(--ct-text-muted)',
                }}>
                  {item.label}
                </span>
              </div>
              <span style={{
                fontSize: 16,
                fontWeight: 800,
                color: hasAlert ? color : 'var(--ct-text-muted)',
                minWidth: 30,
                textAlign: 'right',
              }}>
                {item.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
