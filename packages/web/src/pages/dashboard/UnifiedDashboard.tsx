// 통합 대시보드 — 세계 최강 위내센서 기반 AI 플랫폼 (다크 테마)

import React, { useEffect, useState } from 'react';
import { useUnifiedDashboard, useLiveAlarms, useFarmRanking } from '@web/hooks/useUnifiedDashboard';
import { useFarmStore } from '@web/stores/farm.store';
import { useAuthStore } from '@web/stores/auth.store';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { ErrorFallback } from '@web/components/common/ErrorFallback';
import {
  HerdOverviewCards,
  TodoListPanel,
  LiveAlarmFeed,
  FarmRankingWidget,
  InlineAiChat,
} from '@web/components/unified-dashboard';
import { TodoDrilldownModal } from '@web/components/unified-dashboard/TodoDrilldownModal';
import type { UnifiedDashboardParams } from '@web/api/unified-dashboard.api';
import type { TodoItem } from '@cowtalk/shared';

// ── Period selector ──

type Period = NonNullable<UnifiedDashboardParams['period']>;

const PERIOD_OPTIONS: readonly { readonly value: Period; readonly label: string }[] = [
  { value: '7d', label: '7일' },
  { value: '14d', label: '14일' },
  { value: '30d', label: '30일' },
];

function PeriodSelector({
  value,
  onChange,
}: {
  readonly value: Period;
  readonly onChange: (p: Period) => void;
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: value === opt.value ? 600 : 400,
            background:
              value === opt.value ? 'var(--ct-primary)' : 'transparent',
            color:
              value === opt.value ? '#FFFFFF' : 'var(--ct-text-secondary)',
            border:
              value === opt.value
                ? 'none'
                : '1px solid var(--ct-border)',
            cursor: 'pointer',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Farm filter dropdown ──

function FarmFilterDropdown(): React.JSX.Element {
  const farms = useFarmStore((s) => s.farms);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const selectFarm = useFarmStore((s) => s.selectFarm);
  const clearSelection = useFarmStore((s) => s.clearSelection);

  return (
    <select
      value={selectedFarmId ?? ''}
      onChange={(e) => {
        const val = e.target.value;
        if (val === '') {
          clearSelection();
        } else {
          selectFarm(val);
        }
      }}
      style={{
        background: 'var(--ct-card)',
        color: 'var(--ct-text)',
        border: '1px solid var(--ct-border)',
        borderRadius: 6,
        padding: '6px 10px',
        fontSize: 13,
        cursor: 'pointer',
      }}
    >
      <option value="">전체 ({farms.length}개 농장)</option>
      {farms.map((f) => (
        <option key={f.farmId} value={f.farmId}>
          {f.name}
        </option>
      ))}
    </select>
  );
}

// ── Default empty values ──

const EMPTY_HERD_OVERVIEW = { totalAnimals: 0, sensorAttached: 0, activeAlerts: 0, healthIssues: 0 } as const;

// ── Main: Unified Dashboard ──

// To-do 이벤트 타입 → 드릴다운 eventType 매핑
const TODO_CATEGORY_TO_EVENT: Record<string, string> = {
  '건강 경고 확인': 'health_warning',
  '체온 이상 확인': 'temperature_warning',
  '발정 후보 수정': 'estrus',
  '분만 준비': 'calving',
  '반추 이상 확인': 'rumination_warning',
  '음수 이상 확인': 'drinking_warning',
  '활동 이상 확인': 'activity_warning',
  '사양 이상 확인': 'feeding_warning',
  '미확인 알림 처리': 'health_warning',
};

export default function UnifiedDashboard(): React.JSX.Element {
  const [period, setPeriod] = useState<Period>('7d');
  const { data, isLoading, error, refetch } = useUnifiedDashboard(period);
  const { data: alarmsData } = useLiveAlarms();
  const { data: rankingData } = useFarmRanking();
  const user = useAuthStore((s) => s.user);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  // 드릴다운 모달 상태
  const [drilldown, setDrilldown] = useState<{ eventType: string; label: string } | null>(null);

  const handleTodoClick = (item: TodoItem): void => {
    const eventType = TODO_CATEGORY_TO_EVENT[item.label] ?? item.category;
    setDrilldown({ eventType, label: `${item.label} (${item.count}건)` });
  };

  // 마운트 시 다크 테마 적용, 언마운트 시 복원
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');

    return () => {
      if (previousTheme) {
        root.setAttribute('data-theme', previousTheme);
      } else {
        root.removeAttribute('data-theme');
      }
    };
  }, []);

  if (error) {
    return (
      <div
        data-theme="dark"
        style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)', minHeight: '100vh', padding: 24 }}
      >
        <ErrorFallback error={error as Error} onRetry={() => { refetch(); }} />
      </div>
    );
  }

  const lastUpdated = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--';

  const d = data;
  const alarms = alarmsData?.alarms ?? [];
  const rankings = rankingData?.rankings ?? [];

  return (
    <div style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)', minHeight: '100vh', padding: 24 }}>
      {/* ── Header ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <FarmFilterDropdown />
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 700 }}>
          CowTalk 통합 대시보드
        </h1>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--ct-text-secondary)',
          }}
        >
          <span>{user?.name ?? ''}</span>
          <span style={{ color: 'var(--ct-text-muted)' }}>|</span>
          <span>업데이트: {lastUpdated}</span>
        </div>
      </header>

      {/* ── Loading state ── */}
      {isLoading ? (
        <div style={{ padding: 24 }}>
          <LoadingSkeleton lines={8} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── Row 1: 우군 현황 요약 (전체 폭) ── */}
          <HerdOverviewCards data={d?.herdOverview ?? EMPTY_HERD_OVERVIEW} />

          {/* ── Row 2: 2-column — 알람/할일 | AI 채팅 ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              alignItems: 'start',
            }}
          >
            {/* ── Left Column: 알람 + 할 일 + 농장 순위 ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <LiveAlarmFeed alarms={alarms} />
              <TodoListPanel items={d?.todoList ?? []} onItemClick={handleTodoClick} />
              <FarmRankingWidget rankings={rankings} />
            </div>

            {/* ── Right Column: AI 어시스턴트 (메인) ── */}
            <InlineAiChat />
          </div>
        </div>
      )}

      {/* 드릴다운 모달 */}
      {drilldown && (
        <TodoDrilldownModal
          eventType={drilldown.eventType}
          label={drilldown.label}
          farmId={selectedFarmId}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
