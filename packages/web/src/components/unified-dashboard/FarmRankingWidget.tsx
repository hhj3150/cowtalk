// 통합 대시보드 — 농장 긴급도 순위 위젯

import React from 'react';

// ── 타입 ──

interface FarmRanking {
  readonly farmId: string;
  readonly farmName: string;
  readonly alertCount: number;
  readonly topAlarmType: string;
}

interface Props {
  readonly rankings: readonly FarmRanking[];
  readonly onFarmClick?: (farmId: string) => void;
}

// ── 상수 ──

const RANK_BADGES: readonly string[] = ['\uD83D\uDD34', '\uD83D\uDFE0', '\uD83D\uDFE1'];

const ALARM_TYPE_LABELS: Record<string, string> = {
  temperature_warning: '체온 이상',
  temperature_high: '고체온',
  temperature_low: '저체온',
  rumination_warning: '반추 이상',
  rumination_decrease: '반추 감소',
  activity_warning: '활동 이상',
  activity_increase: '활동 증가',
  drinking_warning: '음수 이상',
  feeding_warning: '사양 이상',
  health_warning: '건강 경고',
  estrus: '발정 의심',
  estrus_detected: '발정 감지',
  insemination: '수정 완료',
  pregnancy_check: '임신 검진',
  pregnancy_confirmed: '임신 확인',
  calving: '분만 감지',
  calving_expected: '분만 예정',
  calving_confirmation: '분만 확인',
  dry_off: '건유 전환',
  vaccination: '백신 접종',
  treatment: '치료 기록',
  management: '관리 기록',
};

// ── 유틸 ──

function getRankBadge(index: number): string {
  return RANK_BADGES[index] ?? '\u26AA';
}

function getAlarmLabel(alarmType: string): string {
  return ALARM_TYPE_LABELS[alarmType] ?? alarmType;
}

// ── 순위 행 ──

function RankingRow({
  ranking,
  index,
  maxCount,
  onClick,
}: {
  readonly ranking: FarmRanking;
  readonly index: number;
  readonly maxCount: number;
  readonly onClick?: () => void;
}): React.JSX.Element {
  const progressWidth = maxCount > 0 ? (ranking.alertCount / maxCount) * 100 : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/5"
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* 순위 배지 */}
      <span className="flex-shrink-0 text-sm" style={{ width: '24px', textAlign: 'center' }}>
        {getRankBadge(index)}
      </span>

      {/* 농장명 + 프로그레스바 */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between">
          <span
            className="truncate text-sm"
            style={{ color: 'var(--ct-text)' }}
          >
            {ranking.farmName}
          </span>
          <span
            className="flex-shrink-0 text-xs"
            style={{ color: 'var(--ct-text-secondary)' }}
          >
            {getAlarmLabel(ranking.topAlarmType)}
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--ct-border)' }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progressWidth}%`,
              backgroundColor: index < 3 ? 'var(--ct-danger)' : 'var(--ct-warning)',
              minWidth: ranking.alertCount > 0 ? '4px' : '0px',
            }}
          />
        </div>
      </div>

      {/* 알림 수 배지 */}
      <span
        className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
        style={{
          backgroundColor: ranking.alertCount > 0 ? 'var(--ct-danger)' : 'var(--ct-border)',
          color: ranking.alertCount > 0 ? '#ffffff' : 'var(--ct-text-secondary)',
          minWidth: '28px',
          textAlign: 'center',
        }}
      >
        {ranking.alertCount}
      </span>
    </button>
  );
}

// ── 메인 컴포넌트 ──

export function FarmRankingWidget({ rankings, onFarmClick }: Props): React.JSX.Element {
  const maxCount = rankings.length > 0
    ? Math.max(...rankings.map((r) => r.alertCount))
    : 0;

  return (
    <div className="ct-card p-4" style={{ borderRadius: '12px' }}>
      <h3
        className="mb-3 font-semibold"
        style={{ fontSize: '13px', color: 'var(--ct-text)' }}
      >
        {'\uD83D\uDCCA'} 농장 긴급도 순위 (7일)
      </h3>

      {rankings.length === 0 ? (
        <div
          className="flex items-center justify-center rounded-lg px-4 py-8"
          style={{ color: 'var(--ct-text-secondary)' }}
        >
          <span className="text-sm">{'\u2705'} 모든 농장이 정상 상태입니다</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {rankings.map((ranking, index) => (
            <RankingRow
              key={ranking.farmId}
              ranking={ranking}
              index={index}
              maxCount={maxCount}
              onClick={onFarmClick ? () => onFarmClick(ranking.farmId) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
