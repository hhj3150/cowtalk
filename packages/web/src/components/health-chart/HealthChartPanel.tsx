// 건강 모니터링 차트 통합 패널 — smaXtec 실 센서 데이터 연동
// API: GET /api/unified-dashboard/animal/:animalId/sensor-chart?days=N

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import type { HealthChartDataPoint, AnimalChartInfo, ViewMode, PeriodTab, DateRange } from '@web/types/health-chart';
import { HealthMonitorChart } from './HealthMonitorChart';
import { HealthChartControls } from './HealthChartControls';

interface Props {
  readonly animalId?: string;
  readonly daysInMilk?: number | null;
  readonly parity?: number | null;
  readonly lactationStatus?: string | null;
}

const PERIOD_DAYS: Record<PeriodTab, number> = {
  day: 1,
  week: 11,
  month: 30,
};

// smaXtec 센서 API 응답 타입
interface SensorMetricPoint {
  readonly ts: number;   // unix seconds
  readonly value: number;
}

interface SensorChartResponse {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmName: string;
  readonly period: { readonly from: string; readonly to: string; readonly days: number };
  readonly metrics: Readonly<Record<string, readonly SensorMetricPoint[]>>;
  readonly eventMarkers: readonly {
    readonly eventType: string;
    readonly smaxtecType: string;
    readonly detectedAt: string;
    readonly severity: string;
  }[];
  readonly animalProfile: {
    readonly parity: number | null;
    readonly daysInMilk: number | null;
    readonly lactationStatus: string | null;
  };
}

/** smaXtec metrics → HealthChartDataPoint[] 변환 */
function transformMetrics(
  metrics: Readonly<Record<string, readonly SensorMetricPoint[]>>,
  eventMarkers: readonly { readonly eventType: string; readonly detectedAt: string }[],
): HealthChartDataPoint[] {
  // 모든 메트릭의 타임스탬프를 병합하여 통합 시계열 생성
  const tsSet = new Set<number>();
  for (const points of Object.values(metrics)) {
    for (const p of points) {
      tsSet.add(p.ts);
    }
  }

  const sortedTs = Array.from(tsSet).sort((a, b) => a - b);
  if (sortedTs.length === 0) return [];

  // 메트릭별 빠른 조회용 맵 (ts → value)
  const tempMap = new Map((metrics.temp ?? []).map((p) => [p.ts, p.value]));
  const actMap = new Map((metrics.act ?? []).map((p) => [p.ts, p.value]));
  const rumMap = new Map((metrics.rum ?? []).map((p) => [p.ts, p.value]));
  const drMap = new Map((metrics.dr ?? []).map((p) => [p.ts, p.value]));

  // 발정 이벤트 타임스탬프 (±6시간 이내 heatIndex > 0)
  const heatEventTs = eventMarkers
    .filter((e) => e.eventType.includes('estrus') || e.eventType.includes('heat'))
    .map((e) => new Date(e.detectedAt).getTime() / 1000);

  return sortedTs.map((ts) => {
    const date = new Date(ts * 1000);
    const hour = date.getHours() + date.getMinutes() / 60;

    const temperature = tempMap.get(ts) ?? null;
    // 정상 체온 기준선: 일주기 변동 포함
    const normalTemp = 39.0 + 0.2 * Math.sin((2 * Math.PI * (hour - 14)) / 24);

    // 발정지수: 발정 이벤트 ±6시간 이내 거리 비례
    let heatIndex = 0;
    for (const heatTs of heatEventTs) {
      const dist = Math.abs(ts - heatTs);
      if (dist < 21600) { // 6시간
        const intensity = 1 - (dist / 21600);
        heatIndex = Math.max(heatIndex, intensity * 10);
      }
    }

    return {
      timestamp: date.toISOString(),
      temperature: temperature ?? normalTemp,
      normalTemp: Number(normalTemp.toFixed(2)),
      activity: actMap.get(ts) ?? 0,
      heatIndex: Number(heatIndex.toFixed(2)),
      rumination: rumMap.get(ts) ?? 0,
      calvingIndex: 0,
      waterIntake: drMap.get(ts) ?? 0,
    };
  });
}

export function HealthChartPanel({ animalId, daysInMilk, parity }: Props): React.JSX.Element {
  const [periodTab, setPeriodTab] = useState<PeriodTab>('week');
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  const now = useMemo(() => new Date(), []);
  const [dateRange, setDateRange] = useState<DateRange>({
    start: new Date(now.getTime() - PERIOD_DAYS.week * 24 * 60 * 60 * 1000),
    end: now,
  });

  const [brushIndex, setBrushIndex] = useState<{ startIndex: number; endIndex: number } | undefined>(undefined);

  const days = PERIOD_DAYS[periodTab];

  // 실제 smaXtec 센서 데이터 API 호출
  const { data: apiData, isLoading, error } = useQuery({
    queryKey: ['sensor-chart', animalId, days],
    queryFn: () => apiGet<SensorChartResponse>(
      `/unified-dashboard/animal/${animalId}/sensor-chart`,
      { days },
    ),
    enabled: !!animalId,
    staleTime: 2 * 60 * 1000, // 2분
  });

  // API 응답 → HealthChartDataPoint[] 변환
  const allData = useMemo<HealthChartDataPoint[]>(() => {
    if (!apiData?.metrics) return [];
    return transformMetrics(apiData.metrics, apiData.eventMarkers ?? []);
  }, [apiData]);

  // 동물 정보 (API 응답 + props 결합)
  const animalInfo = useMemo<AnimalChartInfo>(() => {
    const profile = apiData?.animalProfile;
    const dim = profile?.daysInMilk ?? daysInMilk ?? 0;
    return {
      id: apiData?.earTag ?? animalId ?? '-',
      milkingDay: dim > 0 ? `착유 ${String(dim)}일` : '-',
      dic: dim > 0 ? `DIC ${String(dim)}` : '-',
      daysSinceHeat: 0,
      cycles: '-',
      lactation: profile?.parity ?? parity ?? 0,
    };
  }, [apiData, animalId, daysInMilk, parity]);

  const handlePeriodChange = useCallback((tab: PeriodTab) => {
    setPeriodTab(tab);
    const d = PERIOD_DAYS[tab];
    const end = new Date();
    const start = new Date(end.getTime() - d * 24 * 60 * 60 * 1000);
    setDateRange({ start, end });
    setBrushIndex(undefined);
  }, []);

  const handleZoomIn = useCallback(() => {
    const len = allData.length;
    if (len === 0) return;
    const current = brushIndex ?? { startIndex: 0, endIndex: len - 1 };
    const range = current.endIndex - current.startIndex;
    const newRange = Math.max(Math.floor(range / 2), 12);
    const center = Math.floor((current.startIndex + current.endIndex) / 2);
    const start = Math.max(0, center - Math.floor(newRange / 2));
    const end = Math.min(len - 1, start + newRange);
    setBrushIndex({ startIndex: start, endIndex: end });
  }, [allData.length, brushIndex]);

  const handleZoomOut = useCallback(() => {
    const len = allData.length;
    if (len === 0) return;
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

  // 로딩/에러 상태
  if (!animalId) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
        개체를 선택하면 건강 차트가 표시됩니다
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
          센서 데이터 로딩 중...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ padding: 24, textAlign: 'center', color: '#ef4444', fontSize: 13 }}>
          센서 데이터를 불러올 수 없습니다
        </div>
      </div>
    );
  }

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
      {allData.length > 0 ? (
        <HealthMonitorChart
          data={allData}
          viewMode={viewMode}
          brushIndex={brushIndex}
          onBrushChange={handleBrushChange}
          onWheelZoom={(dir) => dir === 'in' ? handleZoomIn() : handleZoomOut()}
        />
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
          선택 기간에 센서 데이터가 없습니다
        </div>
      )}
    </div>
  );
}
