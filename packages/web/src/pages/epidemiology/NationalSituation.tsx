// 전국 방역 상황 종합
// NationalMiniMap 공용 컴포넌트 + 시군구 드릴다운 + 주간 추이 차트
// 드릴다운: 시도 → 시군구 → 농장 → 개체 → AI

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer } from 'recharts';
import { RiskLevelBadge } from '@web/components/epidemiology/RiskLevelBadge';
import type { RiskLevel } from '@web/components/epidemiology/RiskLevelBadge';
import { NationalMiniMap } from '@web/components/epidemiology/NationalMiniMap';
import { ProvinceFarmListPanel } from '@web/components/epidemiology/ProvinceFarmListPanel';
import { AnimalDrilldownPanel } from '@web/components/epidemiology/AnimalDrilldownPanel';
import { TinkerbellAssistant } from '@web/components/unified-dashboard/TinkerbellAssistant';
import { apiGet } from '@web/api/client';

// ===========================
// 시군구 타입
// ===========================

interface DistrictStats {
  district: string;
  province: string;
  farmCount: number;
  totalAnimals: number;
  feverAnimals: number;
  feverRate: number;
  riskLevel: RiskLevel;
}

async function fetchProvince(province: string): Promise<DistrictStats[]> {
  return apiGet<DistrictStats[]>(`/quarantine/national-situation/${encodeURIComponent(province)}`);
}

// ===========================
// 주간 추이 데이터 (NationalMiniMap 내부 데이터 재활용)
// ===========================

interface WeeklyTrendData {
  weeklyFeverTrend: { week: string; feverRate: number }[];
}

async function fetchWeeklyTrend(): Promise<WeeklyTrendData> {
  const data = await apiGet<{ weeklyFeverTrend: { week: string; feverRate: number }[] }>('/quarantine/national-situation');
  return { weeklyFeverTrend: data.weeklyFeverTrend };
}

// ===========================
// 메인 컴포넌트
// ===========================

export default function NationalSituation(): React.JSX.Element {
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [showFarmPanel, setShowFarmPanel] = useState(false);

  // 개체 드릴다운 상태
  const [drillAnimalId, setDrillAnimalId] = useState<string | null>(null);
  const [drillFarmId, setDrillFarmId] = useState<string | null>(null);
  const [drillFarmName, setDrillFarmName] = useState<string>('');
  const [tinkerbellTrigger, setTinkerbellTrigger] = useState<string | undefined>(undefined);

  // 시군구 상세
  const { data: districtData, isLoading: districtLoading } = useQuery({
    queryKey: ['quarantine', 'national-situation', selectedProvince],
    queryFn: () => fetchProvince(selectedProvince!),
    enabled: !!selectedProvince,
  });

  // 주간 추이
  const { data: trendRaw } = useQuery({
    queryKey: ['quarantine', 'weekly-trend'],
    queryFn: fetchWeeklyTrend,
    staleTime: 120_000,
  });

  const trendData = (trendRaw?.weeklyFeverTrend ?? []).map((d) => ({
    ...d,
    rate: (d.feverRate * 100).toFixed(2),
  }));

  function handleProvinceClick(province: string): void {
    setSelectedProvince(province);
    setShowFarmPanel(true);
  }

  function handleAnimalSelect(animalId: string, farmId: string, farmName: string): void {
    setDrillAnimalId(animalId);
    setDrillFarmId(farmId);
    setDrillFarmName(farmName);
  }

  function handleCloseAnimalPanel(): void {
    setDrillAnimalId(null);
    setDrillFarmId(null);
  }

  const effectiveTrigger = useMemo(() => tinkerbellTrigger, [tinkerbellTrigger]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>
          전국 방역 상황 종합
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
          시도별 위험 등급 — 시도 클릭 시 농장 드릴다운
        </p>
      </div>

      {/* 전국 지도 + 시도 리스트 (NationalMiniMap 공용 컴포넌트) */}
      <NationalMiniMap
        onProvinceSelect={handleProvinceClick}
        mapHeight={400}
        showSummary={true}
        showBroadAlert={true}
      />

      {/* 선택 시도 시군구 상세 테이블 */}
      {selectedProvince && (
        <div
          className="rounded-xl border p-4"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
              {selectedProvince} 시군구 현황
            </h3>
            <button
              onClick={() => setSelectedProvince(null)}
              className="text-xs px-2 py-1 rounded border"
              style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text-secondary)' }}
            >
              ← 전체 보기
            </button>
          </div>
          {districtLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--ct-border)' }} />
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {(districtData ?? []).map((d) => (
                <div
                  key={d.district}
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: 'var(--ct-bg)' }}
                >
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>{d.district}</p>
                    <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                      {d.farmCount}농장 · {d.totalAnimals}두
                      {d.feverAnimals > 0 && (
                        <span className="ml-1 text-red-500">발열 {d.feverAnimals}두</span>
                      )}
                    </p>
                  </div>
                  <RiskLevelBadge level={d.riskLevel} size="sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 전국 발열률 주간 추이 */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
      >
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ct-text)' }}>
          전국 발열률 주간 추이 (%)
        </h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} unit="%" />
            <ChartTooltip formatter={(v) => `${v}%`} />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="발열률"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 시도 농장 목록 패널 (슬라이드인) */}
      {showFarmPanel && selectedProvince && (
        <ProvinceFarmListPanel
          province={selectedProvince}
          onClose={() => setShowFarmPanel(false)}
          onAnimalSelect={handleAnimalSelect}
        />
      )}

      {/* 개체 상세 패널 */}
      {drillAnimalId != null && drillFarmId != null && (
        <AnimalDrilldownPanel
          animalId={drillAnimalId}
          farmId={drillFarmId}
          farmName={drillFarmName}
          onClose={handleCloseAnimalPanel}
          onAiRequest={(triggerText) => {
            setTinkerbellTrigger(triggerText);
            handleCloseAnimalPanel();
            setShowFarmPanel(false);
          }}
        />
      )}

      {/* 팅커벨 AI */}
      <TinkerbellAssistant openTrigger={effectiveTrigger} />
    </div>
  );
}
