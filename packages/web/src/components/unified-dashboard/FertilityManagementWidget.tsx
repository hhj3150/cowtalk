// 번식 관리 현황 — smaXtec Fertility Management 기본 위젯
import React from 'react';

interface HerdStatusItem {
  readonly status: string;
  readonly label: string;
  readonly icon: string;
  readonly count: number;
}

interface FertilityAlertItem {
  readonly type: string;
  readonly label: string;
  readonly count: number;
}

interface Props {
  readonly data: {
    readonly herdStatus: readonly HerdStatusItem[];
    readonly fertilityAlerts: readonly FertilityAlertItem[];
  } | null;
  readonly onAlertClick?: (eventType: string) => void;
}

const FERT_ICONS: Record<string, string> = {
  estrus: '🐄',
  insemination: '💉',
  pregnancy_check: '🔍',
  fertility_warning: '⚠️',
  no_insemination: '❌',
  dry_off: '🥛',
  calving_detection: '🍼',
  calving_confirmation: '✅',
};

const FERT_COLORS: Record<string, string> = {
  estrus: '#ef4444',
  calving_detection: '#ef4444',
  calving_confirmation: '#22c55e',
  insemination: '#3b82f6',
  pregnancy_check: '#22c55e',
  fertility_warning: '#f97316',
  no_insemination: '#eab308',
  dry_off: '#06b6d4',
};

export function FertilityManagementWidget({ data, onAlertClick }: Props): React.JSX.Element {
  if (!data) {
    return (
      <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--ct-text-muted)', fontSize: 13 }}>
        번식 관리 데이터 로딩 중...
      </div>
    );
  }

  const { herdStatus, fertilityAlerts } = data;
  const totalHerd = herdStatus.reduce((s, h) => s + h.count, 0);

  return (
    <div style={{
      background: 'var(--ct-card)',
      border: '1px solid var(--ct-border)',
      borderRadius: 12,
      padding: '16px 18px',
    }}>
      {/* 헤더 */}
      <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 14px' }}>
        🐄 번식 관리
      </h3>

      {/* 우군 구성 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ct-text-muted)', marginBottom: 8 }}>
          우군 구성 ({totalHerd.toLocaleString()}두)
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {herdStatus.map((h) => {
            const pct = totalHerd > 0 ? (h.count / totalHerd * 100) : 0;
            return (
              <div key={h.status} style={{
                flex: 1,
                minWidth: 100,
                padding: '8px 10px',
                borderRadius: 8,
                background: 'var(--ct-bg)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 16, marginBottom: 2 }}>{h.icon}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ct-text)' }}>
                  {h.count.toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
                  {h.label} ({pct.toFixed(0)}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 번식 이벤트 */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ct-text-muted)', marginBottom: 8 }}>
          오늘 번식 이벤트
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {fertilityAlerts.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--ct-text-muted)', textAlign: 'center', padding: 12 }}>
              오늘 번식 이벤트 없음
            </div>
          )}
          {fertilityAlerts.map((a) => {
            const icon = FERT_ICONS[a.type] ?? '📋';
            const color = FERT_COLORS[a.type] ?? 'var(--ct-text-secondary)';
            return (
              <div
                key={a.type}
                onClick={() => onAlertClick?.(a.type)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: 6,
                  cursor: a.count > 0 ? 'pointer' : 'default',
                  background: a.count > 0 ? `${color}10` : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: a.count > 0 ? 'var(--ct-text)' : 'var(--ct-text-muted)' }}>
                    {a.label}
                  </span>
                </div>
                <span style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: a.count > 0 ? color : 'var(--ct-text-muted)',
                }}>
                  {a.count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
