// 통합 대시보드 — 실시간 알람 피드 (smaXtec 이벤트)
// 농장명 클릭 → 농장 필터, 소 귀표 클릭 → smaXtec 센서 차트
// 레이블 버튼 클릭 → EventLabelModal

import React, { useState } from 'react';
import { EventLabelModal } from './EventLabelModal';

// ── 타입 ──

interface LiveAlarm {
  readonly eventId: string;
  readonly eventType: string;
  readonly earTag: string;
  readonly animalId?: string;
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
  readonly onFarmClick?: (farmId: string) => void;
  readonly onAnimalClick?: (animalId: string) => void;
  readonly onAlarmClick?: (alarm: LiveAlarm) => void;
}

// ── 상수 ──

const ALARM_TYPE_CONFIG: Record<string, { readonly icon: string; readonly label: string; readonly color: string }> = {
  // smaXtec 센서 알람
  temperature_warning: { icon: '🌡️', label: '체온 이상', color: 'var(--ct-danger)' },
  temperature_high: { icon: '🌡️', label: '고체온', color: 'var(--ct-danger)' },
  temperature_low: { icon: '🌡️', label: '저체온', color: '#3b82f6' },
  rumination_warning: { icon: '🔄', label: '반추 이상', color: '#eab308' },
  rumination_decrease: { icon: '🔄', label: '반추 감소', color: '#eab308' },
  activity_warning: { icon: '📊', label: '활동 이상', color: '#f97316' },
  activity_increase: { icon: '📊', label: '활동 증가', color: '#22c55e' },
  drinking_warning: { icon: '💧', label: '음수 이상', color: '#3b82f6' },
  feeding_warning: { icon: '🌾', label: '사양 이상', color: '#8b5cf6' },
  health_warning: { icon: '⚠️', label: '건강 경고', color: '#f97316' },
  // 번식 관련
  estrus: { icon: '💕', label: '발정 의심', color: '#ec4899' },
  estrus_detected: { icon: '💕', label: '발정 감지', color: '#ec4899' },
  insemination: { icon: '💉', label: '수정 완료', color: '#8b5cf6' },
  pregnancy_check: { icon: '🩺', label: '임신 검진', color: '#22c55e' },
  pregnancy_confirmed: { icon: '✅', label: '임신 확인', color: '#22c55e' },
  // 분만 관련
  calving: { icon: '🐄', label: '분만 감지', color: '#22c55e' },
  calving_expected: { icon: '🐄', label: '분만 예정', color: '#3b82f6' },
  calving_confirmation: { icon: '👶', label: '분만 확인', color: '#22c55e' },
  // 관리
  dry_off: { icon: '🥛', label: '건유 전환', color: '#94a3b8' },
  vaccination: { icon: '💊', label: '백신 접종', color: '#3b82f6' },
  treatment: { icon: '🩺', label: '치료 기록', color: '#f97316' },
  management: { icon: '📋', label: '관리 기록', color: '#94a3b8' },
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

function AlarmRow({
  alarm,
  onFarmClick,
  onAnimalClick,
  onLabelClick,
}: {
  readonly alarm: LiveAlarm;
  readonly onFarmClick?: () => void;
  readonly onAnimalClick?: () => void;
  readonly onLabelClick?: () => void;
}): React.JSX.Element {
  const config = getAlarmConfig(alarm.eventType);
  const severityColor = SEVERITY_COLORS[alarm.severity] ?? 'var(--ct-text-secondary)';

  return (
    <div
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors"
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

      {/* 중앙: 농장명(클릭) + 귀표번호(클릭) + 알람 타입 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 truncate text-sm">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFarmClick?.(); }}
            className="rounded px-1 transition-colors hover:bg-white/10"
            style={{
              color: 'var(--ct-text-secondary)',
              cursor: onFarmClick ? 'pointer' : 'default',
              textDecoration: onFarmClick ? 'underline' : 'none',
              textDecorationColor: 'var(--ct-border)',
              textUnderlineOffset: '2px',
            }}
          >
            [{alarm.farmName}]
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAnimalClick?.(); }}
            className="rounded px-1 font-medium transition-colors hover:bg-white/10"
            style={{
              color: 'var(--ct-text)',
              cursor: onAnimalClick ? 'pointer' : 'default',
              textDecoration: onAnimalClick ? 'underline' : 'none',
              textDecorationColor: 'var(--ct-primary)',
              textUnderlineOffset: '2px',
            }}
          >
            {alarm.earTag}
          </button>
        </div>
        <span
          className="text-xs"
          style={{ color: config.color }}
        >
          {config.label}
        </span>
      </div>

      {/* 우측: 레이블 버튼 + 시간 + severity 점 */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {onLabelClick && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onLabelClick(); }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-xs transition-colors hover:bg-white/10"
            style={{ color: 'var(--ct-text-secondary)' }}
            title="레이블 달기"
          >
            {'\uD83C\uDFF7\uFE0F'}
          </button>
        )}
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

export function LiveAlarmFeed({ alarms, onFarmClick, onAnimalClick, onAlarmClick }: Props): React.JSX.Element {
  const [labelTarget, setLabelTarget] = useState<LiveAlarm | null>(null);

  return (
    <>
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
              <AlarmRow
                key={alarm.eventId}
                alarm={alarm}
                onFarmClick={onFarmClick ? () => onFarmClick(alarm.farmId) : undefined}
                onAnimalClick={
                  alarm.animalId && onAnimalClick
                    ? () => onAnimalClick(alarm.animalId!)
                    : onAlarmClick
                      ? () => onAlarmClick(alarm)
                      : undefined
                }
                onLabelClick={alarm.animalId ? () => setLabelTarget(alarm) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {labelTarget && (
        <EventLabelModal
          alarm={labelTarget}
          onClose={() => setLabelTarget(null)}
        />
      )}
    </>
  );
}
