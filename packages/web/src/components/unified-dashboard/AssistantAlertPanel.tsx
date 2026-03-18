// 통합 대시보드 — AI 어시스턴트 알림 패널

import React from 'react';
import type { AssistantAlert } from '@cowtalk/shared';

interface Props {
  readonly alerts: readonly AssistantAlert[];
  readonly onAlertClick?: (alert: AssistantAlert) => void;
}

const SEVERITY_DOT_COLORS: Record<string, string> = {
  critical: 'var(--ct-danger)',
  high: 'var(--ct-warning)',
  medium: '#eab308',
  low: 'var(--ct-info)',
};

export function AssistantAlertPanel({ alerts, onAlertClick }: Props): React.JSX.Element {
  return (
    <div className="ct-card p-4" style={{ borderRadius: '12px' }}>
      <div className="mb-3 flex items-center gap-2">
        <h3
          className="font-semibold"
          style={{ fontSize: '13px', color: 'var(--ct-text)' }}
        >
          AI 어시스턴트
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: 'var(--ct-ai-bg)',
            color: 'var(--ct-ai-border)',
            border: '1px solid var(--ct-ai-border)',
          }}
        >
          Claude
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {alerts.map((alert) => {
          const hasCount = alert.count > 0;
          const dotColor = SEVERITY_DOT_COLORS[alert.severity] ?? 'var(--ct-text-secondary)';

          return (
            <li key={`${alert.type}-${alert.label}`}>
              <button
                type="button"
                onClick={() => onAlertClick?.(alert)}
                disabled={!onAlertClick}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                  onAlertClick ? 'cursor-pointer hover:bg-black/5' : 'cursor-default'
                }`}
                style={{
                  backgroundColor: hasCount ? 'rgba(0,0,0,0.02)' : 'transparent',
                }}
              >
                <span
                  className="inline-block rounded-full"
                  style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: dotColor,
                    flexShrink: 0,
                  }}
                />
                <span
                  className="flex-1 text-sm"
                  style={{
                    color: hasCount ? 'var(--ct-text)' : 'var(--ct-text-secondary)',
                  }}
                >
                  {alert.label}
                </span>
                <span
                  className="text-sm font-semibold"
                  style={{
                    color: hasCount ? 'var(--ct-text)' : 'var(--ct-text-secondary)',
                    minWidth: '24px',
                    textAlign: 'right',
                  }}
                >
                  {alert.count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
