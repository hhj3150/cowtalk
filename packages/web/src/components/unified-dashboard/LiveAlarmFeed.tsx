// 통합 대시보드 — 실시간 알람 피드 (smaXtec 이벤트)
// 농장명 클릭 → 농장 필터, 소 귀표 클릭 → smaXtec 센서 차트
// 레이블 버튼 클릭 → EventLabelModal
// DX: hover 시 빠른 액션 (AI 분석 / 확인 완료)

import React, { useState } from 'react';
import { EventLabelModal } from './EventLabelModal';
import { useDxCompletion } from '../../hooks/useDxCompletion';

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
  critical: 'var(--ct-danger)',
  high: 'var(--ct-danger)',
  medium: '#f97316',
  low: '#eab308',
};

const ICON_BADGE_GLOW: Readonly<Record<string, string>> = {
  critical: '0 0 8px rgba(239, 68, 68, 0.25)',
  high: '0 0 8px rgba(239, 68, 68, 0.25)',
  medium: '0 0 6px rgba(249, 115, 22, 0.19)',
};

const SEVERITY_DOT_CLASS: Readonly<Record<string, string>> = {
  critical: 'ct-severity-dot-critical',
  high: 'ct-severity-dot-high',
  medium: 'ct-severity-dot-medium',
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
  isAcknowledged,
  onFarmClick,
  onAnimalClick,
  onLabelClick,
  onAiAnalysis,
  onAcknowledge,
}: {
  readonly alarm: LiveAlarm;
  readonly isAcknowledged: boolean;
  readonly onFarmClick?: () => void;
  readonly onAnimalClick?: () => void;
  readonly onLabelClick?: () => void;
  readonly onAiAnalysis?: () => void;
  readonly onAcknowledge?: () => void;
}): React.JSX.Element {
  const config = getAlarmConfig(alarm.eventType);
  const severityColor = SEVERITY_COLORS[alarm.severity] ?? 'var(--ct-text-secondary)';
  const dimmed = alarm.acknowledged || isAcknowledged;

  return (
    <div
      className="group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors"
      style={{
        opacity: dimmed ? 0.5 : 1,
        transition: 'opacity 0.3s ease',
      }}
    >
      {/* 아이콘 배지 */}
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm"
        style={{
          backgroundColor: `${config.color}15`,
          color: config.color,
          boxShadow: ICON_BADGE_GLOW[alarm.severity] ?? 'none',
        }}
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
        {/* DX 빠른 액션 — hover 시 표시 */}
        <div
          className="hidden items-center gap-1 group-hover:flex"
          style={{ transition: 'opacity 0.2s ease' }}
        >
          {onAiAnalysis && !dimmed && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAiAnalysis(); }}
              className="flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors hover:bg-white/10"
              style={{
                color: 'var(--ct-primary)',
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.2)',
              }}
              title="AI 분석 요청"
            >
              {'\uD83E\uDD16'} AI
            </button>
          )}
          {onAcknowledge && !dimmed && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAcknowledge(); }}
              className="flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors hover:bg-white/10"
              style={{
                color: '#22c55e',
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.2)',
              }}
              title="확인 완료 처리"
            >
              {'\u2713'} 확인
            </button>
          )}
        </div>

        {/* 확인 완료 뱃지 */}
        {dimmed && (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#22c55e',
              padding: '1px 6px',
              borderRadius: 4,
              background: 'rgba(34,197,94,0.1)',
            }}
          >
            확인됨
          </span>
        )}

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
          className={`inline-block rounded-full ${SEVERITY_DOT_CLASS[alarm.severity] ?? ''}`}
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
  const { acknowledgedAlarms, acknowledgeAlarm } = useDxCompletion();

  // 심각도별 카운트
  const counts = alarms.reduce((acc, a) => {
    const s = a.severity as string;
    return { ...acc, [s]: (acc[s] ?? 0) + 1 };
  }, {} as Record<string, number>);

  return (
    <>
      <div className="ct-card p-4" style={{ borderRadius: '12px' }}>
        {/* 헤더 + 심각도 요약 뱃지 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3
              className="font-semibold"
              style={{ fontSize: '13px', color: 'var(--ct-text)' }}
            >
              {'\uD83D\uDEA8'} 실시간 알람 피드
            </h3>
            {alarms.length > 0 && (
              <span
                className="ct-pulse-badge"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 20,
                  background: 'rgba(239,68,68,0.15)',
                  color: '#ef4444',
                  animation: 'ctPulse 2s ease-in-out infinite',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                LIVE {alarms.length}
              </span>
            )}
          </div>
          {alarms.length > 0 && (
            <div className="flex items-center gap-1">
              {counts['high'] ? (
                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600 }}>
                  긴급 {counts['high']}
                </span>
              ) : null}
              {counts['medium'] ? (
                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 4, background: 'rgba(249,115,22,0.15)', color: '#f97316', fontWeight: 600 }}>
                  주의 {counts['medium']}
                </span>
              ) : null}
              {counts['low'] ? (
                <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 4, background: 'rgba(234,179,8,0.15)', color: '#eab308', fontWeight: 600 }}>
                  관찰 {counts['low']}
                </span>
              ) : null}
            </div>
          )}
        </div>

        {alarms.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg px-4 py-8"
            style={{ color: 'var(--ct-text-secondary)' }}
          >
            <span style={{ fontSize: '32px', marginBottom: 8 }}>{'\u2705'}</span>
            <span className="text-sm font-medium">모든 개체 정상</span>
            <span style={{ fontSize: '11px', color: 'var(--ct-text-muted)', marginTop: 4 }}>24시간 내 활성 알람 없음</span>
          </div>
        ) : (
          <div
            className="flex flex-col gap-1 overflow-y-auto"
            style={{ maxHeight: '400px' }}
          >
            {alarms.map((alarm, idx) => (
              <div key={alarm.eventId} className="ct-fade-up" style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}>
                <AlarmRow
                  alarm={alarm}
                  isAcknowledged={acknowledgedAlarms.has(alarm.eventId)}
                  onFarmClick={onFarmClick ? () => onFarmClick(alarm.farmId) : undefined}
                  onAnimalClick={
                    alarm.animalId && onAnimalClick
                      ? () => onAnimalClick(alarm.animalId!)
                      : onAlarmClick
                        ? () => onAlarmClick(alarm)
                        : undefined
                  }
                  onLabelClick={alarm.animalId ? () => setLabelTarget(alarm) : undefined}
                  onAiAnalysis={
                    alarm.animalId && onAnimalClick
                      ? () => onAnimalClick(alarm.animalId!)
                      : undefined
                  }
                  onAcknowledge={() => acknowledgeAlarm(alarm.eventId)}
                />
              </div>
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
