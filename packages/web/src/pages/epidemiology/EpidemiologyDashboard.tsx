// 방역관 전용 대시보드
// 6개 KPI + 위험 등급 배너 + 실시간 역학 현황판 + 24h 발열 추이 + 업무 큐

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { RiskLevelBanner, RiskLevelBadge } from '@web/components/epidemiology/RiskLevelBadge';
import type { RiskLevel } from '@web/components/epidemiology/RiskLevelBadge';
import { SituationBoard } from '@web/components/epidemiology/SituationBoard';
import type { RiskFarm } from '@web/components/epidemiology/SituationBoard';
import { ActionQueue } from '@web/components/epidemiology/ActionQueue';
import type { ActionQueueItem } from '@web/components/epidemiology/ActionQueue';
import { TinkerbellAssistant } from '@web/components/unified-dashboard/TinkerbellAssistant';
import { AnimalDrilldownPanel } from '@web/components/epidemiology/AnimalDrilldownPanel';
import { NationalMiniMap } from '@web/components/epidemiology/NationalMiniMap';
import { ProvinceFarmListPanel } from '@web/components/epidemiology/ProvinceFarmListPanel';
import { apiGet } from '@web/api/client';
import { listAnimals } from '@web/api/animal.api';
import type { AnimalSummary } from '@web/api/animal.api';

// ===========================
// API 타입
// ===========================

interface QuarantineKpi {
  totalAnimals: number;
  sensorRate: number;
  feverAnimals: number;
  clusterFarms: number;
  legalDiseaseSuspects: number;
  riskLevel: RiskLevel;
  feverRate: number;
}

interface DashboardData {
  kpi: QuarantineKpi;
  top5RiskFarms: {
    farmId: string;
    farmName: string;
    healthAlertCount: number;
    feverCount: number;
    ruminationCount: number;
    otherHealthCount: number;
    groupRate: number;
    clusterAlert: boolean;
    legalSuspect: boolean;
    riskScore: number;
    lat: number;
    lng: number;
  }[];
  hourlyFever24h: { hour: string; count: number }[];
  dsi7Days: { date: string; avgDsi: number }[];
  activeAlerts: {
    alertId: string;
    farmId: string;
    farmName: string;
    alertType: string;
    priority: string;
    title: string;
    createdAt: string;
  }[];
}

// ===========================
// 데이터 훅
// ===========================

async function fetchDashboard(): Promise<DashboardData> {
  return apiGet<DashboardData>('/quarantine/dashboard');
}

async function fetchActionQueue(): Promise<ActionQueueItem[]> {
  return apiGet<ActionQueueItem[]>('/quarantine/action-queue');
}

interface VaccinationStatusData {
  readonly totalAnimals: number;
  readonly byProtocol: readonly {
    readonly protocolId: string;
    readonly protocolName: string;
    readonly type: 'vaccination' | 'inspection';
    readonly vaccinated: number;
    readonly total: number;
    readonly rate: number;
    readonly priority: number;
  }[];
  readonly overallRate: number;
}

async function fetchVaccinationStatus(): Promise<VaccinationStatusData> {
  return apiGet<VaccinationStatusData>('/quarantine/vaccination-status');
}

// ===========================
// KPI 카드
// ===========================

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: string;
  sub?: string;
  highlight?: boolean;
}

function KpiCard({ label, value, icon, sub, highlight }: KpiCardProps): React.JSX.Element {
  return (
    <div
      className={`rounded-xl border p-4 ${highlight ? 'border-red-300 bg-red-50' : ''}`}
      style={
        highlight
          ? {}
          : { background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }
      }
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl">{icon}</span>
        {sub && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--ct-border)', color: 'var(--ct-text-secondary)' }}
          >
            {sub}
          </span>
        )}
      </div>
      <p className={`text-2xl font-bold ${highlight ? 'text-red-700' : ''}`} style={highlight ? {} : { color: 'var(--ct-text)' }}>
        {value}
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--ct-text-secondary)' }}>{label}</p>
    </div>
  );
}

// ===========================
// 메인 컴포넌트
// ===========================

export default function EpidemiologyDashboard(): React.JSX.Element {
  const [selectedFarm, setSelectedFarm] = useState<RiskFarm | null>(null);
  const [farmTab, setFarmTab] = useState<'info' | 'animals'>('info');
  const [drillAnimalId, setDrillAnimalId] = useState<string | null>(null);
  const [tinkerbellTriggerOverride, setTinkerbellTriggerOverride] = useState<string | undefined>(undefined);
  // 전국 지도 → 시도 → 농장 → 개체 드릴다운
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [showFarmPanel, setShowFarmPanel] = useState(false);
  const [drillFarmId, setDrillFarmId] = useState<string | null>(null);
  const [drillFarmName, setDrillFarmName] = useState<string>('');

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ['quarantine', 'dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 60_000,
  });

  const { data: actionQueue, isLoading: queueLoading } = useQuery({
    queryKey: ['quarantine', 'action-queue'],
    queryFn: fetchActionQueue,
    refetchInterval: 30_000,
  });

  const { data: vaccinationStatus } = useQuery({
    queryKey: ['quarantine', 'vaccination-status'],
    queryFn: fetchVaccinationStatus,
    staleTime: 5 * 60_000,
  });

  const kpi = dashboard?.kpi;
  const riskLevel = kpi?.riskLevel ?? 'green';

  const riskSubtitle =
    riskLevel === 'red' ? `발열률 ${((kpi?.feverRate ?? 0) * 100).toFixed(1)}% — 즉각 대응 필요` :
    riskLevel === 'orange' ? `집단 발열 ${kpi?.clusterFarms ?? 0}건 확인됨` :
    riskLevel === 'yellow' ? `발열률 ${((kpi?.feverRate ?? 0) * 100).toFixed(1)}%` :
    '이상 징후 없음';

  // 농장 선택 시 팅커벨 AI 자동 브리핑 트리거 (farmId 기반 고유 키)
  const tinkerbellTrigger = useMemo(() => {
    if (!selectedFarm) return undefined;
    const flags = [
      selectedFarm.clusterAlert && '집단발열 발생',
      selectedFarm.legalSuspect && '법정전염병 의심',
    ].filter(Boolean).join(', ');
    return `[방역관 역학 브리핑 — ${selectedFarm.farmId}] ${selectedFarm.farmName} 농장 역학 상황을 분석해주세요. 건강알림 ${selectedFarm.healthAlertCount ?? selectedFarm.feverCount}건 (발열 ${selectedFarm.feverCount}, 반추↓ ${selectedFarm.ruminationCount ?? 0}), 위험점수 ${selectedFarm.riskScore}점${flags ? ` (${flags})` : ''}. 방역관이 즉시 취해야 할 조치 3가지를 간결하게 알려주세요.`;
  }, [selectedFarm]);

  const hourlyData = (dashboard?.hourlyFever24h ?? []).map((d) => ({
    ...d,
    label: new Date(d.hour).getHours() + '시',
  }));

  const dsiData = dashboard?.dsi7Days ?? [];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>
          🛡️ 방역관 전용 대시보드
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
          실시간 역학 모니터링 — 자동 갱신 60초
        </p>
      </div>

      {/* 위험 등급 배너 */}
      {dashLoading ? (
        <div className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--ct-border)' }} />
      ) : (
        <RiskLevelBanner level={riskLevel} subtitle={riskSubtitle} />
      )}

      {/* 6개 KPI 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="감시 두수"
          value={kpi?.totalAnimals.toLocaleString() ?? '—'}
          icon="🐄"
          sub="실시간"
        />
        <KpiCard
          label="센서 장착률"
          value={kpi ? `${(kpi.sensorRate * 100).toFixed(1)}%` : '—'}
          icon="📡"
        />
        <KpiCard
          label="발열 두수"
          value={kpi?.feverAnimals ?? '—'}
          icon="🌡️"
          sub="24h 기준"
          highlight={(kpi?.feverAnimals ?? 0) > 0}
        />
        <KpiCard
          label="집단 발열 농장"
          value={kpi?.clusterFarms ?? '—'}
          icon="🏚️"
          highlight={(kpi?.clusterFarms ?? 0) >= 1}
        />
        <KpiCard
          label="법정전염병 의심"
          value={kpi?.legalDiseaseSuspects ?? '—'}
          icon="⚠️"
          highlight={(kpi?.legalDiseaseSuspects ?? 0) >= 1}
        />
        <div
          className="rounded-xl border p-4"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xl">🚦</span>
          </div>
          <div className="mt-1">
            <RiskLevelBadge level={riskLevel} size="sm" />
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--ct-text-secondary)' }}>위험 등급</p>
        </div>
      </div>

      {/* 전국 위험지도 — 3단계 드릴다운 (전국→시도→농장→개체) */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
            🗺️ 전국 방역 현황
          </h3>
          <Link
            to="/epidemiology/national"
            className="text-xs px-2 py-1 rounded"
            style={{ background: 'var(--ct-border)', color: 'var(--ct-text-secondary)' }}
          >
            상세 보기 →
          </Link>
        </div>
        <NationalMiniMap
          onProvinceSelect={(province) => {
            setSelectedProvince(province);
            setShowFarmPanel(true);
          }}
          onFarmSelect={(farmId, farmName) => {
            setSelectedFarm({
              farmId,
              farmName,
              feverCount: 0,
              clusterAlert: false,
              legalSuspect: false,
              riskScore: 0,
              lat: 0,
              lng: 0,
            });
            setFarmTab('animals');
          }}
          mapHeight={420}
          showSummary={false}
          showBroadAlert={true}
        />
      </div>

      {/* 시도 농장 목록 패널 (슬라이드인) */}
      {showFarmPanel && selectedProvince && (
        <ProvinceFarmListPanel
          province={selectedProvince}
          onClose={() => { setShowFarmPanel(false); setSelectedProvince(null); }}
          onAnimalSelect={(animalId, farmId, farmName) => {
            setDrillAnimalId(animalId);
            setDrillFarmId(farmId);
            setDrillFarmName(farmName);
          }}
        />
      )}

      {/* 개체 상세 패널 (지도 드릴다운용) */}
      {drillAnimalId != null && drillFarmId != null && !selectedFarm && (
        <AnimalDrilldownPanel
          animalId={drillAnimalId}
          farmId={drillFarmId}
          farmName={drillFarmName}
          onClose={() => { setDrillAnimalId(null); setDrillFarmId(null); }}
          onAiRequest={(triggerText) => {
            setDrillAnimalId(null);
            setDrillFarmId(null);
            setShowFarmPanel(false);
            setSelectedProvince(null);
            setTinkerbellTriggerOverride(triggerText);
          }}
        />
      )}

      {/* 역학 현황판 */}
      <SituationBoard
        top5RiskFarms={dashboard?.top5RiskFarms ?? []}
        activeAlerts={dashboard?.activeAlerts ?? []}
        isLoading={dashLoading}
        onFarmClick={(farm) => { setSelectedFarm(farm); setFarmTab('info'); }}
        onAlertClick={(alert) => {
          const farm = (dashboard?.top5RiskFarms ?? []).find((f) => f.farmId === alert.farmId);
          if (farm) { setSelectedFarm(farm); setFarmTab('info'); }
        }}
      />

      {/* 농장 드릴다운 패널 */}
      {selectedFarm && (
        <div
          className="rounded-xl border p-4 space-y-4"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>
              {selectedFarm.farmName}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedFarm(null)}
              className="text-xs px-2 py-1 rounded hover:bg-opacity-80"
              style={{ color: 'var(--ct-text-secondary)', background: 'var(--ct-border)' }}
            >
              닫기 ✕
            </button>
          </div>

          {/* 탭 전환 */}
          <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--ct-bg)' }}>
            {(['info', 'animals'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFarmTab(tab)}
                className="flex-1 text-xs py-1.5 rounded-md font-medium transition-colors"
                style={
                  farmTab === tab
                    ? { background: 'var(--ct-card)', color: 'var(--ct-text)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                    : { color: 'var(--ct-text-secondary)' }
                }
              >
                {tab === 'info' ? '📊 농장 정보' : `🏥 건강알림 (${selectedFarm.healthAlertCount ?? selectedFarm.feverCount}건)`}
              </button>
            ))}
          </div>

          {/* 탭 1: 농장 정보 */}
          {farmTab === 'info' && (
            <>
              <div className="flex flex-wrap gap-3 text-sm">
                <span style={{ color: 'var(--ct-text)' }}>
                  건강알림 <strong>{selectedFarm.healthAlertCount ?? selectedFarm.feverCount}건</strong> (발열 {selectedFarm.feverCount} · 반추↓ {selectedFarm.ruminationCount ?? 0})
                </span>
                <span style={{ color: 'var(--ct-text)' }}>
                  위험점수 <strong>{selectedFarm.riskScore}</strong>
                </span>
                <span style={{ color: selectedFarm.clusterAlert ? '#ef4444' : 'var(--ct-text-secondary)' }}>
                  집단발열 {selectedFarm.clusterAlert ? '✔ 있음' : '없음'}
                </span>
                <span style={{ color: selectedFarm.legalSuspect ? '#ef4444' : 'var(--ct-text-secondary)' }}>
                  법정전염병 의심 {selectedFarm.legalSuspect ? '✔ 있음' : '없음'}
                </span>
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/epidemiology/investigation/new?farmId=${selectedFarm.farmId}`}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                  style={{ background: 'var(--ct-primary, #3b82f6)' }}
                >
                  역학조사 시작
                </Link>
                <Link
                  to={`/epidemiology/radius?farmId=${selectedFarm.farmId}`}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ background: 'var(--ct-border)', color: 'var(--ct-text)' }}
                >
                  반경 분석
                </Link>
              </div>
              <div
                className="rounded-lg p-3 border"
                style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)' }}
              >
                <p className="text-xs font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--ct-text)' }}>
                  <span>🧚</span> 팅커벨 AI 브리핑
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--ct-text-secondary)' }}>
                  {selectedFarm.farmName} 농장에 대한 역학 분석을 지니 AI에 자동 요청했습니다.
                  <br />
                  <span className="text-emerald-400 font-medium">우측 하단 🟢 지니 패널</span>에서 브리핑을 확인하세요.
                </p>
              </div>
            </>
          )}

          {/* 탭 2: 발열 개체 목록 */}
          {farmTab === 'animals' && (
            <FarmAnimalList
              farmId={selectedFarm.farmId}
              onSelect={(animalId) => setDrillAnimalId(animalId)}
            />
          )}
        </div>
      )}

      {/* 개체 상세 드릴다운 패널 */}
      {drillAnimalId != null && selectedFarm != null && (
        <AnimalDrilldownPanel
          animalId={drillAnimalId}
          farmId={selectedFarm.farmId}
          farmName={selectedFarm.farmName}
          onClose={() => setDrillAnimalId(null)}
          onAiRequest={(triggerText) => {
            setDrillAnimalId(null);
            // tinkerbellTrigger를 새 값으로 갱신 — TinkerbellAssistant가 열림
            const updatedTrigger = triggerText;
            // useMemo 우회: 직접 ref 업데이트 대신 state 사용
            setTinkerbellTriggerOverride(updatedTrigger);
          }}
        />
      )}

      {/* 차트 2개 (24h 발열 추이 + 7일 DSI) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 24시간 발열 두수 추이 */}
        <div
          className="rounded-xl border p-4"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ct-text)' }}>
            📈 최근 24시간 발열 두수 추이
          </h3>
          {dashLoading ? (
            <div className="h-48 animate-pulse rounded" style={{ background: 'var(--ct-border)' }} />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="feverGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#ef4444"
                  fill="url(#feverGrad)"
                  name="발열 두수"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 7일 DSI 평균 추이 */}
        <div
          className="rounded-xl border p-4"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ct-text)' }}>
            📉 최근 7일 DSI 평균 추이
          </h3>
          {dashLoading ? (
            <div className="h-48 animate-pulse rounded" style={{ background: 'var(--ct-border)' }} />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={dsiData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="avgDsi"
                  stroke="var(--ct-primary)"
                  strokeWidth={2}
                  dot={false}
                  name="평균 DSI"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 접종 현황 */}
      {vaccinationStatus && (
        <div
          className="rounded-xl border p-4"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ct-text)' }}>
            💉 법정 백신 접종현황
          </h3>
          <div className="space-y-2">
            {vaccinationStatus.byProtocol
              .filter((p) => p.type === 'vaccination' && p.priority <= 2)
              .map((p) => {
                const barColor = p.rate >= 90 ? '#22c55e' : p.rate >= 50 ? '#eab308' : '#ef4444';
                return (
                  <div key={p.protocolId}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span style={{ color: 'var(--ct-text)' }}>{p.protocolName}</span>
                      <span style={{ color: barColor, fontWeight: 700 }}>{p.rate}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--ct-border)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(p.rate, 100)}%`, background: barColor }}
                      />
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
                      {p.vaccinated}/{p.total}두
                    </div>
                  </div>
                );
              })}
          </div>
          {vaccinationStatus.byProtocol.filter((p) => p.type === 'inspection').length > 0 && (
            <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--ct-border)' }}>
              <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--ct-text-secondary)' }}>🛡️ 방역검사 현황</h4>
              {vaccinationStatus.byProtocol
                .filter((p) => p.type === 'inspection')
                .map((p) => (
                  <div key={p.protocolId} className="flex items-center justify-between text-xs py-1">
                    <span style={{ color: 'var(--ct-text)' }}>{p.protocolName}</span>
                    <span style={{ color: p.rate >= 90 ? '#22c55e' : '#eab308', fontWeight: 600 }}>{p.rate}%</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 당일 업무 큐 */}
      <div
        className="rounded-xl border p-4"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
            📋 당일 방역 업무 큐
          </h3>
          {actionQueue && (
            <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
              대기 {actionQueue.filter((i) => i.status !== 'completed').length}건
            </span>
          )}
        </div>
        <ActionQueue items={actionQueue ?? []} isLoading={queueLoading} />
      </div>

      <TinkerbellAssistant openTrigger={tinkerbellTriggerOverride ?? tinkerbellTrigger} />
    </div>
  );
}

// ===========================
// 발열 개체 목록 (드릴다운 탭 2)
// ===========================

interface FarmAnimalListProps {
  readonly farmId: string;
  readonly onSelect: (animalId: string) => void;
}

function FarmAnimalList({ farmId, onSelect }: FarmAnimalListProps): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['farm-animals', farmId],
    queryFn: () => listAnimals({ farmId, limit: 100, status: 'active' }) as unknown as Promise<AnimalSummary[]>,
    staleTime: 30_000,
  });

  const animals: readonly AnimalSummary[] = (data as unknown as AnimalSummary[]) ?? [];
  const feverAnimals = animals.filter((a: AnimalSummary) => (a.latestTemperature ?? 0) >= 38.5);
  const display: readonly AnimalSummary[] = feverAnimals.length > 0 ? feverAnimals : animals.slice(0, 20);

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--ct-border)' }} />
        ))}
      </div>
    );
  }

  if (display.length === 0) {
    return (
      <p className="text-xs text-center py-6" style={{ color: 'var(--ct-text-secondary)' }}>
        발열 개체가 없습니다
      </p>
    );
  }

  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto">
      {feverAnimals.length === 0 && (
        <p className="text-xs mb-2" style={{ color: 'var(--ct-text-secondary)' }}>
          현재 발열 개체 없음 — 전체 개체 목록 표시
        </p>
      )}
      {display.map((animal: AnimalSummary) => (
        <FarmAnimalRow key={animal.animalId} animal={animal} onSelect={onSelect} />
      ))}
    </div>
  );
}

function FarmAnimalRow({ animal, onSelect }: { animal: AnimalSummary; onSelect: (id: string) => void }): React.JSX.Element {
  const isFever = (animal.latestTemperature ?? 0) >= 38.5;
  return (
    <button
      type="button"
      onClick={() => onSelect(animal.animalId)}
      className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors"
      style={{
        background: isFever ? 'rgba(239,68,68,0.06)' : 'var(--ct-bg)',
        border: isFever ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--ct-border)',
      }}
    >
      <div>
        <p className="text-xs font-medium" style={{ color: isFever ? '#ef4444' : 'var(--ct-text)' }}>
          {animal.earTag}{isFever && ' 🌡️'}
        </p>
        <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
          {animal.status} · {animal.breed}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {animal.latestTemperature != null && (
          <span className="text-xs font-semibold" style={{ color: isFever ? '#ef4444' : 'var(--ct-text-secondary)' }}>
            {animal.latestTemperature.toFixed(1)}°
          </span>
        )}
        <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>›</span>
      </div>
    </button>
  );
}
