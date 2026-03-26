// 건강 모니터링 차트 통합 패널 — 상태 관리 + Controls + Chart 조합

import React, { useState, useMemo, useCallback } from 'react';
import type { ViewMode, PeriodTab, DateRange } from '@web/types/health-chart';
import { HealthMonitorChart } from './HealthMonitorChart';
import { HealthChartControls } from './HealthChartControls';
import { generateDummyData, fetchAnimalChartInfo } from '@web/services/health-chart.service';

interface Props {
  readonly animalId?: string;
}

const PERIOD_DAYS: Record<PeriodTab, number> = {
  day: 1,
  week: 11,
  month: 30,
};

export function HealthChartPanel({ animalId }: Props): React.JSX.Element {
  // 상태
  const [periodTab, setPeriodTab] = useState<PeriodTab>('week');
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  const now = useMemo(() => new Date(), []);
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(now.getTime() - PERIOD_DAYS.week * 24 * 60 * 60 * 1000),
    end: now,
  });

  const [brushIndex, setBrushIndex] = useState<{ startIndex: number; endIndex: number } | undefined>(undefined);

  // 더미 데이터 (향후 API hook으로 교체)
  const allData = useMemo(() => generateDummyData(PERIOD_DAYS[periodTab]), [periodTab]);
  const animalInfo = useMemo(() => {
    const info = fetchAnimalChartInfo();
    return animalId ? { ...info, id: animalId } : info;
  }, [animalId]);

  // 기간 변경
  const handlePeriodChange = useCallback((tab: PeriodTab) => {
    setPeriodTab(tab);
    const days = PERIOD_DAYS[tab];
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    setDateRange({ start, end });
    setBrushIndex(undefined); // 줌 리셋
  }, []);

  // 줌
  const handleZoomIn = useCallback(() => {
    const len = allData.length;
    const current = brushIndex ?? { startIndex: 0, endIndex: len - 1 };
    const range = current.endIndex - current.startIndex;
    const newRange = Math.max(Math.floor(range / 2), 12); // 최소 2시간
    const center = Math.floor((current.startIndex + current.endIndex) / 2);
    const start = Math.max(0, center - Math.floor(newRange / 2));
    const end = Math.min(len - 1, start + newRange);
    setBrushIndex({ startIndex: start, endIndex: end });
  }, [allData.length, brushIndex]);

  const handleZoomOut = useCallback(() => {
    const len = allData.length;
    const current = brushIndex ?? { startIndex: 0, endIndex: len - 1 };
    const range = current.endIndex - current.startIndex;
    const newRange = Math.min(range * 2, len - 1);
    const center = Math.floor((current.startIndex + current.endIndex) / 2);
    const start = Math.max(0, center - Math.floor(newRange / 2));
    const end = Math.min(len - 1, start + newRange);
    setBrushIndex({ startIndex: start, endIndex: end });
  }, [allData.length, brushIndex]);

  const handleZoomReset = useCallback(() => {
    setBrushIndex(undefined);
  }, []);

  const handleBrushChange = useCallback((start: number, end: number) => {
    setBrushIndex({ startIndex: start, endIndex: end });
  }, []);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
      <HealthChartControls
        animalInfo={animalInfo}
        periodTab={periodTab}
        onPeriodChange={handlePeriodChange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
      />
      <HealthMonitorChart
        data={allData}
        viewMode={viewMode}
        brushIndex={brushIndex}
        onBrushChange={handleBrushChange}
        onWheelZoom={(dir) => dir === 'in' ? handleZoomIn() : handleZoomOut()}
      />
    </div>
  );
}
