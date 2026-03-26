// 건강 차트 상단 컨트롤 — 동물 정보 + 기간 탭 + 날짜 선택 + 보기 모드 + 줌

import React from 'react';
import type { AnimalChartInfo, ViewMode, PeriodTab, DateRange } from '@web/types/health-chart';

interface Props {
  readonly animalInfo: AnimalChartInfo;
  readonly periodTab: PeriodTab;
  readonly onPeriodChange: (tab: PeriodTab) => void;
  readonly viewMode: ViewMode;
  readonly onViewModeChange: (mode: ViewMode) => void;
  readonly dateRange: DateRange;
  readonly onDateRangeChange: (range: DateRange) => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onZoomReset: () => void;
}

const ACCENT = '#C6D631';

function TabButton({
  label,
  active,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors"
      style={{
        background: active ? ACCENT : 'transparent',
        color: active ? '#000' : '#aaa',
        border: active ? 'none' : `1px solid ${ACCENT}`,
      }}
    >
      {label}
    </button>
  );
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function HealthChartControls({
  animalInfo,
  periodTab,
  onPeriodChange,
  viewMode,
  onViewModeChange,
  dateRange,
  onDateRangeChange,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: Props): React.JSX.Element {
  return (
    <div style={{ background: '#1E1E2E', borderRadius: '12px 12px 0 0', padding: '16px 20px' }}>
      {/* 동물 정보 헤더 */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <span className="text-2xl font-bold text-white">{animalInfo.id}</span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', color: '#ccc' }}>
          {animalInfo.milkingDay}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', color: '#ccc' }}>
          {animalInfo.dic}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', color: '#ccc' }}>
          발정 후 {animalInfo.daysSinceHeat}일
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', color: '#ccc' }}>
          Cycles {animalInfo.cycles}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', color: '#ccc' }}>
          Lact. {animalInfo.lactation}
        </span>
        <span
          className="ml-auto text-xs px-3 py-1 rounded-full font-semibold"
          style={{ background: ACCENT, color: '#000' }}
        >
          건강 플러스
        </span>
      </div>

      {/* 컨트롤 바 */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* 기간 탭 */}
        <div className="flex gap-1">
          <TabButton label="일" active={periodTab === 'day'} onClick={() => onPeriodChange('day')} />
          <TabButton label="주" active={periodTab === 'week'} onClick={() => onPeriodChange('week')} />
          <TabButton label="월" active={periodTab === 'month'} onClick={() => onPeriodChange('month')} />
        </div>

        {/* 날짜 범위 */}
        <div className="flex items-center gap-2 text-xs">
          <input
            type="date"
            value={formatDate(dateRange.start)}
            onChange={(e) => {
              const d = new Date(e.target.value);
              if (!isNaN(d.getTime())) onDateRangeChange({ ...dateRange, start: d });
            }}
            className="rounded px-2 py-1 text-xs"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
          />
          <span style={{ color: '#888' }}>~</span>
          <span className="text-xs" style={{ color: '#888' }}>마지막 일</span>
          <input
            type="date"
            value={formatDate(dateRange.end)}
            onChange={(e) => {
              const d = new Date(e.target.value);
              if (!isNaN(d.getTime())) onDateRangeChange({ ...dateRange, end: d });
            }}
            className="rounded px-2 py-1 text-xs"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}
          />
        </div>

        {/* 보기 모드 */}
        <div className="flex gap-1">
          <TabButton label="전체 보기" active={viewMode === 'all'} onClick={() => onViewModeChange('all')} />
          <TabButton label="반추·음수량" active={viewMode === 'rumination'} onClick={() => onViewModeChange('rumination')} />
        </div>

        {/* 줌 버튼 */}
        <div className="flex gap-1 ml-auto">
          <button
            type="button"
            onClick={onZoomIn}
            className="w-8 h-8 rounded flex items-center justify-center text-white text-sm hover:bg-white/10 transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            title="줌인"
            aria-label="줌인"
          >
            🔍+
          </button>
          <button
            type="button"
            onClick={onZoomOut}
            className="w-8 h-8 rounded flex items-center justify-center text-white text-sm hover:bg-white/10 transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            title="줌아웃"
            aria-label="줌아웃"
          >
            🔍−
          </button>
          <button
            type="button"
            onClick={onZoomReset}
            className="w-8 h-8 rounded flex items-center justify-center text-white text-sm hover:bg-white/10 transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)' }}
            title="전체보기"
            aria-label="전체보기"
          >
            ↺
          </button>
        </div>
      </div>
    </div>
  );
}
