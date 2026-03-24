// 조기감지 성과 대시보드
// 국가 채택 근거: "CowTalk이 얼마나 빨리 감지했는가" 증명

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { apiGet } from '@web/api/client';

// ===========================
// 타입
// ===========================

interface MonthlyStats {
  month: string;
  totalDetections: number;
  avgLeadTimeHours: number;
  preventedAnimals: number;
  economicSavingsKrw: number;
  falsePositiveRate: number;
  truePositiveRate: number;
}

interface YearlyStats {
  year: number;
  totalDetections: number;
  totalPreventedAnimals: number;
  totalEconomicSavingsKrw: number;
  avgLeadTimeHours: number;
  monthlyTrend: { month: string; detections: number; savingsKrw: number }[];
}

interface DetectionCase {
  alertId: string;
  farmId: string;
  farmName: string;
  detectedAt: string;
  leadTimeHours: number | null;
  outcome: 'true_positive' | 'false_positive' | 'pending';
  diseaseName: string | null;
  preventedAnimals: number;
}

interface ComparisonScenario {
  withCowTalk: { avgResponseHours: number; estimatedSpreadAnimals: number };
  withoutCowTalk: { avgResponseHours: number; estimatedSpreadAnimals: number };
  savedAnimals: number;
  savedEconomicKrw: number;
}

interface MetricsData {
  monthlyStats: MonthlyStats;
  yearlyStats: YearlyStats;
  recentCases: DetectionCase[];
  comparisonScenario: ComparisonScenario;
}

// ===========================
// API 훅
// ===========================

async function fetchMetrics(): Promise<MetricsData> {
  return apiGet<MetricsData>('/quarantine/early-detection-metrics');
}

// ===========================
// 통화 포맷
// ===========================

function formatKrw(n: number): string {
  if (n >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억원`;
  if (n >= 1_0000) return `${(n / 1_0000).toFixed(0)}만원`;
  return `${n.toLocaleString()}원`;
}

// ===========================
// 히어로 수치 카드
// ===========================

interface HeroCardProps {
  value: string;
  label: string;
  icon: string;
  bg: string;
}

function HeroCard({ value, label, icon, bg }: HeroCardProps): React.JSX.Element {
  return (
    <div className={`rounded-xl p-5 text-white ${bg}`}>
      <div className="text-3xl mb-1">{icon}</div>
      <p className="text-3xl font-black">{value}</p>
      <p className="text-sm opacity-90 mt-1">{label}</p>
    </div>
  );
}

// ===========================
// 결과 배지
// ===========================

function OutcomeBadge({ outcome }: { outcome: DetectionCase['outcome'] }): React.JSX.Element {
  if (outcome === 'true_positive') return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">정탐 ✓</span>;
  if (outcome === 'false_positive') return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">오탐 ✗</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">확인 중</span>;
}

// ===========================
// 메인 컴포넌트
// ===========================

export default function EarlyDetectionMetrics(): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['quarantine', 'early-detection-metrics'],
    queryFn: fetchMetrics,
    staleTime: 5 * 60_000,
  });

  const stats = data?.monthlyStats;
  const yearly = data?.yearlyStats;
  const scenario = data?.comparisonScenario;

  const comparisonData = scenario ? [
    {
      name: 'CowTalk 있음',
      응답시간: scenario.withCowTalk.avgResponseHours,
      전파두수: scenario.withCowTalk.estimatedSpreadAnimals,
      fill: '#22c55e',
    },
    {
      name: 'CowTalk 없음',
      응답시간: scenario.withoutCowTalk.avgResponseHours,
      전파두수: scenario.withoutCowTalk.estimatedSpreadAnimals,
      fill: '#ef4444',
    },
  ] : [];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>
          📈 조기감지 성과 대시보드
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
          국가 방역 기여 근거 — CowTalk 조기감지 효과 측정
        </p>
      </div>

      {/* 핵심 히어로 지표 */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl animate-pulse" style={{ background: 'var(--ct-border)' }} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HeroCard
            value={`${stats?.avgLeadTimeHours ?? 0}시간`}
            label="평균 조기감지 선행 시간"
            icon="⚡"
            bg="bg-blue-600"
          />
          <HeroCard
            value={`${stats?.totalDetections ?? 0}건`}
            label={`이번 달 조기감지 (${stats?.month ?? ''})`}
            icon="🔍"
            bg="bg-emerald-600"
          />
          <HeroCard
            value={`${stats?.preventedAnimals ?? 0}두`}
            label="이번 달 예방 살처분 두수"
            icon="🐄"
            bg="bg-orange-500"
          />
          <HeroCard
            value={formatKrw(stats?.economicSavingsKrw ?? 0)}
            label="이번 달 절감 효과"
            icon="💰"
            bg="bg-purple-600"
          />
        </div>
      )}

      {/* 연간 누적 */}
      {yearly && (
        <div
          className="rounded-xl border p-5"
          style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--ct-text)' }}>
            🏆 {yearly.year}년 누적 성과
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--ct-primary)' }}>
                {yearly.totalDetections}건
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--ct-text-secondary)' }}>누적 조기감지</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">
                {yearly.totalPreventedAnimals}두
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--ct-text-secondary)' }}>예방 살처분</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">
                {formatKrw(yearly.totalEconomicSavingsKrw)}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--ct-text-secondary)' }}>연간 절감 효과</p>
            </div>
          </div>

          {/* 월별 추이 */}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={yearly.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v, n) => n === '절감효과' ? formatKrw(Number(v)) : v} />
              <Legend />
              <Bar yAxisId="left" dataKey="detections" fill="var(--ct-primary)" name="감지건수" />
              <Bar yAxisId="right" dataKey="savingsKrw" fill="#8b5cf6" name="절감효과" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* "만약 CowTalk 없었다면" 비교 시나리오 */}
      {scenario && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div
            className="rounded-xl border p-5"
            style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
          >
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--ct-text)' }}>
              ⚖️ 만약 CowTalk 없었다면
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={comparisonData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
                <Tooltip />
                <Bar dataKey="응답시간" fill="#3b82f6" name="평균 응답 (시간)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div
            className="rounded-xl border p-5 flex flex-col justify-center"
            style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
          >
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--ct-text)' }}>
              💡 CowTalk 도입 효과
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">응답 시간 단축</p>
                  <p className="text-xs text-emerald-600">
                    {scenario.withoutCowTalk.avgResponseHours}시간 → {scenario.withCowTalk.avgResponseHours}시간
                  </p>
                </div>
                <p className="text-xl font-black text-emerald-700">
                  -{scenario.withoutCowTalk.avgResponseHours - scenario.withCowTalk.avgResponseHours}h
                </p>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50">
                <div>
                  <p className="text-sm font-semibold text-blue-800">전파 차단 두수</p>
                  <p className="text-xs text-blue-600">
                    {scenario.withoutCowTalk.estimatedSpreadAnimals}두 → {scenario.withCowTalk.estimatedSpreadAnimals}두
                  </p>
                </div>
                <p className="text-xl font-black text-blue-700">
                  -{scenario.savedAnimals}두
                </p>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-purple-50">
                <div>
                  <p className="text-sm font-semibold text-purple-800">경제 절감 효과</p>
                  <p className="text-xs text-purple-600">두당 300만원 기준</p>
                </div>
                <p className="text-xl font-black text-purple-700">
                  {formatKrw(scenario.savedEconomicKrw)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 최근 감지 사례 */}
      <div
        className="rounded-xl border p-5"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)' }}
      >
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--ct-text)' }}>
          📋 최근 조기감지 사례 (30일)
        </h3>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded animate-pulse" style={{ background: 'var(--ct-border)' }} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--ct-border)' }}>
                  {['농장', '감지 시각', '선행 시간', '결과', '예방 두수'].map((h) => (
                    <th key={h} className="text-left py-2 pr-4 text-xs font-semibold" style={{ color: 'var(--ct-text-secondary)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.recentCases ?? []).slice(0, 15).map((c) => (
                  <tr key={c.alertId} style={{ borderBottom: '1px solid var(--ct-border)' }}>
                    <td className="py-2 pr-4 font-medium" style={{ color: 'var(--ct-text)' }}>
                      {c.farmName}
                    </td>
                    <td className="py-2 pr-4 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                      {new Date(c.detectedAt).toLocaleDateString('ko')}
                    </td>
                    <td className="py-2 pr-4 text-xs font-bold text-blue-600">
                      {c.leadTimeHours != null ? `${c.leadTimeHours}시간 빠름` : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      <OutcomeBadge outcome={c.outcome} />
                    </td>
                    <td className="py-2 pr-4 text-xs font-semibold text-emerald-600">
                      {c.preventedAnimals > 0 ? `${c.preventedAnimals}두` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 정확도 요약 */}
        {stats && (
          <div className="mt-4 flex gap-4 pt-4" style={{ borderTop: '1px solid var(--ct-border)' }}>
            <div className="text-center flex-1">
              <p className="text-lg font-bold text-emerald-600">{(stats.truePositiveRate * 100).toFixed(0)}%</p>
              <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>정탐률(정밀도)</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-lg font-bold text-red-500">{(stats.falsePositiveRate * 100).toFixed(0)}%</p>
              <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>오탐률</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-lg font-bold" style={{ color: 'var(--ct-primary)' }}>
                {(2 * stats.truePositiveRate * (1 - stats.falsePositiveRate) / (stats.truePositiveRate + (1 - stats.falsePositiveRate)) * 100).toFixed(0)}%
              </p>
              <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>F1 점수</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
