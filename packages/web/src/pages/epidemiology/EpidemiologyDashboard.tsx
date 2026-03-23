// 방역관 전용 대시보드
// 6개 KPI + 위험 등급 배너 + 실시간 역학 현황판 + 24h 발열 추이 + 업무 큐

import React, { useState } from 'react';
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
import { GeniVoiceAssistant } from '@web/components/unified-dashboard/GeniVoiceAssistant';
import { apiGet } from '@web/api/client';

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
    feverCount: number;
    feverRate: number;
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

  const kpi = dashboard?.kpi;
  const riskLevel = kpi?.riskLevel ?? 'green';

  const riskSubtitle =
    riskLevel === 'red' ? `발열률 ${((kpi?.feverRate ?? 0) * 100).toFixed(1)}% — 즉각 대응 필요` :
    riskLevel === 'orange' ? `집단 발열 ${kpi?.clusterFarms ?? 0}건 확인됨` :
    riskLevel === 'yellow' ? `발열률 ${((kpi?.feverRate ?? 0) * 100).toFixed(1)}%` :
    '이상 징후 없음';

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

      {/* 역학 현황판 */}
      <SituationBoard
        top5RiskFarms={dashboard?.top5RiskFarms ?? []}
        activeAlerts={dashboard?.activeAlerts ?? []}
        isLoading={dashLoading}
        onFarmClick={(farm) => setSelectedFarm(farm)}
      />

      {/* 농장 드릴다운 패널 */}
      {selectedFarm && (
        <div
          className="rounded-xl border p-4 space-y-4"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
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

          <div className="flex flex-wrap gap-3 text-sm">
            <span style={{ color: 'var(--ct-text)' }}>
              발열 <strong>{selectedFarm.feverCount}두</strong>
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
            className="rounded-lg p-3"
            style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)' }}
          >
            <p className="text-xs font-semibold mb-1" style={{ color: 'var(--ct-text)' }}>
              소버린 AI 브리핑
            </p>
            <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
              AI 분석 중...{' '}
              <Link
                to={`/epidemiology/investigation/new?farmId=${selectedFarm.farmId}`}
                className="underline"
                style={{ color: 'var(--ct-primary, #3b82f6)' }}
              >
                역학조사 시작
              </Link>
            </p>
          </div>
        </div>
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

      <GeniVoiceAssistant />
    </div>
  );
}
