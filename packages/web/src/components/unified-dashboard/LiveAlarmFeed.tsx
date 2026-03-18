// 통합 대시보드 — 실시간 알람 피드 (smaXtec 이벤트)

import React from 'react';

// ── 타입 ──

interface LiveAlarm {
  readonly eventId: string;
  readonly eventType: string;
  readonly earTag: string;
  readonly farmName: string;
  readonly farmId: string;
  readonly severity: string;
  readonly confidence: number;
  readonly details: unknown;
  readonly detectedAt: string;
  readonly acknowledged: boolean;
}

interface Props {
  readonly alarms: readonly LiveAlarm[];
}

// ── 상수 ──

const ALARM_TYPE_CONFIG: Record<string, { readonly icon: string; readonly label: string; readonly color: string }> = {
  temperature_warning: { icon: '\uD83C\uDF21\uFE0F', label: '체온 이상', color: 'var(--ct-danger)' },
  rumination_warning: { icon: '\uD83D\uDD04', label: '반추 이상', color: '#eab308' },
  activity_warning: { icon: '\u26A0\uFE0F', label: '활동 이상', color: '#f97316' },
  drinking_warning: { icon: '\uD83D\uDCA7', label: '음수 이상', color: '#3b82f6' },
  feeding_warning: { icon: '\uD83C\uDF3E', label: '사양 이상', color: '#8b5cf6' },
  health_warning: { icon: '\u26A0\uFE0F', label: '건강 경고', color: '#f97316' },
  estrus: { icon: '\uD83D\uDC95', label: '발정 의심', color: '#ec4899' },
  calving: { icon: '\uD83D\uDC04', label: '분만 감지', color: '#22c55e' },
};

const SEVERITY_COLORS: Record<string, string> = {
  high: 'var(--ct-danger)',
  medium: '#f97316',
  low: '#eab308',
};

// ── 유틸 ──

function formatTimeAgo(detectedAt: string): string {
  const now = Date.now();
  const detected = new Date(detectedAt).getTime();
  const diffMs = now - detected;
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;

  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}일 전`;
}

function getAlarmConfig(eventType: string): { readonly icon: string; readonly label: string; readonly color: string } {
  return ALARM_TYPE_CONFIG[eventType] ?? { icon: '\u26A0\uFE0F', label: eventType, color: 'var(--ct-text-secondary)' };
}

// ── 알람 행 ──

function AlarmRow({ alarm }: { readonly alarm: LiveAlarm }): React.JSX.Element {
  const config = getAlarmConfig(alarm.eventType);
  const severityColor = SEVERITY_COLORS[alarm.severity] ?? 'var(--ct-text-secondary)';

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-black/5"
      style={{
        opacity: alarm.acknowledged ? 0.5 : 1,
      }}
    >
      {/* 아이콘 배지 */}
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm"
        style={{ backgroundColor: `${config.color}15`, color: config.color }}
      >
        {config.icon}
      </span>

      {/* 중앙: 농장명 + 귀표번호 + 알람 타입 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate text-sm"
          style={{ color: 'var(--ct-text)' }}
        >
          [{alarm.farmName}] {alarm.earTag}
        </span>
        <span
          className="text-xs"
          style={{ color: config.color }}
        >
          {config.label}
        </span>
      </div>

      {/* 우측: 시간 + severity 점 */}
      <div className="flex flex-shrink-0 items-center gap-2">
        <span
          className="text-xs"
          style={{ color: 'var(--ct-text-secondary)' }}
        >
          {formatTimeAgo(alarm.detectedAt)}
        </span>
        <span
          className="inline-block rounded-full"
          style={{
            width: '8px',
            height: '8px',
            backgroundColor: severityColor,
            flexShrink: 0,
          }}
        />
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ──

export function LiveAlarmFeed({ alarms }: Props): React.JSX.Element {
  return (
    <div className="ct-card p-4" style={{ borderRadius: '12px' }}>
      <h3
        className="mb-3 font-semibold"
        style={{ fontSize: '13px', color: 'var(--ct-text)' }}
      >
        {'\uD83D\uDEA8'} 오늘 알람 피드
      </h3>

      {alarms.length === 0 ? (
        <div
          className="flex items-center justify-center rounded-lg px-4 py-8"
          style={{ color: 'var(--ct-text-secondary)' }}
        >
          <span className="text-sm">현재 활성 알람이 없습니다</span>
        </div>
      ) : (
        <div
          className="flex flex-col gap-1 overflow-y-auto"
          style={{ maxHeight: '400px' }}
        >
          {alarms.map((alarm) => (
            <AlarmRow key={alarm.eventId} alarm={alarm} />
          ))}
        </div>
      )}
    </div>
  );
}
