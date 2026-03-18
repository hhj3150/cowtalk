// AI 성능 리포트 페이지 — Intelligence Loop 기반 정확도 분석

import React, { useState } from 'react';
import { KpiCard } from '@web/components/data/KpiCard';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { usePerformanceOverview, useAccuracyTrend, useRoleFeedbackStats } from '@web/hooks/useAiPerformance';
import type { EngineMetrics } from '@web/api/ai-performance.api';

const ENGINE_LABELS: Record<string, string> = {
  estrus: '발정 감지',
  disease: '건강 경고',
  pregnancy: '임신 예측',
  herd: '군집 분석',
  regional: '지역 분석',
};

const ROLE_LABELS: Record<string, string> = {
  farmer: '농장주',
  veterinarian: '수의사',
  inseminator: '수정사',
  government_admin: '행정관',
  quarantine_officer: '방역관',
  feed_company: '사료회사',
};

function ProgressBar({ value, label }: { readonly value: number; readonly label: string }): React.JSX.Element {
  const pct = Math.min(value * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--ct-border)' }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, background: 'var(--ct-primary)' }}
        />
      </div>
      <span className="w-12 text-right text-xs font-medium" style={{ color: 'var(--ct-text)' }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function EngineCard({ engine }: { readonly engine: EngineMetrics }): React.JSX.Element {
  const label = ENGINE_LABELS[engine.engineType] ?? engine.engineType;

  return (
    <div className="ct-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>{label}</span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--ct-primary-light)', color: 'var(--ct-primary)' }}>
          {engine.totalEvaluated}건 평가
        </span>
      </div>
      <div className="space-y-2">
        <ProgressBar value={engine.precision} label="Precision" />
        <ProgressBar value={engine.recall} label="Recall" />
        <ProgressBar value={engine.f1Score} label="F1 Score" />
      </div>
      <div className="flex justify-between text-xs pt-1" style={{ color: 'var(--ct-text-secondary)', borderTop: '1px solid var(--ct-border)' }}>
        <span>총 예측: {engine.totalPredictions.toLocaleString()}</span>
        <span>평균 신뢰도: {(engine.averageConfidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function HorizontalBar({ label, value, max }: { readonly label: string; readonly value: number; readonly max: number }): React.JSX.Element {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-right shrink-0" style={{ color: 'var(--ct-text-secondary)' }}>{label}</span>
      <div className="flex-1 h-5 rounded" style={{ background: 'var(--ct-border)' }}>
        <div
          className="h-5 rounded flex items-center justify-end pr-2 transition-all"
          style={{ width: `${Math.max(pct, 2)}%`, background: 'var(--ct-primary)', minWidth: pct > 0 ? '24px' : '0' }}
        >
          {pct > 8 && <span className="text-xs font-medium text-white">{value}</span>}
        </div>
      </div>
      {pct <= 8 && <span className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>{value}</span>}
    </div>
  );
}

function TrendTable({ engineType }: { readonly engineType: string }): React.JSX.Element {
  const { data: trends, isLoading } = useAccuracyTrend(engineType, 6);

  if (isLoading) return <LoadingSkeleton lines={3} />;
  if (!trends || trends.length === 0) {
    return <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>트렌드 데이터 없음</p>;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr style={{ borderBottom: '1px solid var(--ct-border)' }}>
          <th className="py-2 text-left font-medium" style={{ color: 'var(--ct-text-secondary)' }}>월</th>
          <th className="py-2 text-right font-medium" style={{ color: 'var(--ct-text-secondary)' }}>Precision</th>
          <th className="py-2 text-right font-medium" style={{ color: 'var(--ct-text-secondary)' }}>Recall</th>
          <th className="py-2 text-right font-medium" style={{ color: 'var(--ct-text-secondary)' }}>평가 수</th>
        </tr>
      </thead>
      <tbody>
        {trends.map((row) => (
          <tr key={row.month} style={{ borderBottom: '1px solid var(--ct-border)' }}>
            <td className="py-2" style={{ color: 'var(--ct-text)' }}>{row.month}</td>
            <td className="py-2 text-right font-medium" style={{ color: 'var(--ct-text)' }}>{(row.precision * 100).toFixed(1)}%</td>
            <td className="py-2 text-right font-medium" style={{ color: 'var(--ct-text)' }}>{(row.recall * 100).toFixed(1)}%</td>
            <td className="py-2 text-right" style={{ color: 'var(--ct-text-secondary)' }}>{row.totalEvaluated}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AiPerformancePage(): React.JSX.Element {
  const { data, isLoading } = usePerformanceOverview();
  const { data: roleStats, isLoading: rolesLoading } = useRoleFeedbackStats();
  const [selectedEngine, setSelectedEngine] = useState('estrus');

  if (isLoading) return <LoadingSkeleton lines={8} />;

  const hasMinData = Boolean(data) && (data?.totalFeedback ?? 0) >= 10;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>AI 성능 리포트</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
          Intelligence Loop 피드백 기반 AI 정확도 분석
        </p>
      </div>

      {/* 최소 데이터 경고 */}
      {!hasMinData && (
        <div
          className="rounded-xl border p-6 text-center"
          style={{ borderColor: 'var(--ct-warning)', background: '#FFFBEB' }}
        >
          <p className="text-sm font-medium" style={{ color: '#92400E' }}>
            최소 10건의 피드백이 필요합니다.
          </p>
          <p className="mt-1 text-xs" style={{ color: '#A16207' }}>
            현재 피드백: {data?.totalFeedback ?? 0}건. 피드백이 쌓이면 정확도 분석이 시작됩니다.
          </p>
        </div>
      )}

      {hasMinData && data && (
        <>
          {/* Top KPI row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="전체 정확도"
              value={`${(data.overallAccuracy * 100).toFixed(1)}%`}
            />
            <KpiCard
              label="총 예측 수"
              value={data.totalPredictions.toLocaleString()}
              unit="건"
            />
            <KpiCard
              label="총 피드백 수"
              value={data.totalFeedback.toLocaleString()}
              unit="건"
            />
            <KpiCard
              label="피드백 수집률"
              value={`${(data.feedbackRate * 100).toFixed(1)}%`}
            />
          </div>

          {/* Engine cards */}
          <div>
            <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
              엔진별 성능
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.engines.map((engine) => (
                <EngineCard key={engine.engineType} engine={engine} />
              ))}
            </div>
          </div>

          {/* Accuracy trend */}
          <div className="ct-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
                정확도 추이
              </h2>
              <select
                value={selectedEngine}
                onChange={(e) => setSelectedEngine(e.target.value)}
                className="rounded-lg border px-2 py-1 text-xs"
                style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text)', background: 'var(--ct-card)' }}
              >
                {Object.entries(ENGINE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <TrendTable engineType={selectedEngine} />
          </div>

          {/* Role feedback distribution */}
          <div className="ct-card p-4 space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
              역할별 피드백 분포
            </h2>
            {rolesLoading ? (
              <LoadingSkeleton lines={3} />
            ) : roleStats && roleStats.length > 0 ? (
              <RoleFeedbackSection stats={roleStats} />
            ) : (
              <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>역할별 피드백 데이터 없음</p>
            )}
          </div>

          {/* Feedback type distribution */}
          <div className="ct-card p-4 space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
              피드백 유형별 분포
            </h2>
            {rolesLoading ? (
              <LoadingSkeleton lines={3} />
            ) : roleStats && roleStats.length > 0 ? (
              <FeedbackTypeSection stats={roleStats} />
            ) : (
              <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>피드백 유형 데이터 없음</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RoleFeedbackSection({ stats }: { readonly stats: readonly { readonly role: string; readonly total: number; readonly byType: Record<string, number> }[] }): React.JSX.Element {
  const maxTotal = Math.max(...stats.map((s) => s.total), 1);

  return (
    <div className="space-y-2">
      {stats.map((stat) => (
        <HorizontalBar
          key={stat.role}
          label={ROLE_LABELS[stat.role] ?? stat.role}
          value={stat.total}
          max={maxTotal}
        />
      ))}
    </div>
  );
}

function FeedbackTypeSection({ stats }: { readonly stats: readonly { readonly role: string; readonly total: number; readonly byType: Record<string, number> }[] }): React.JSX.Element {
  // Aggregate byType across all roles
  const aggregated: Record<string, number> = {};
  for (const stat of stats) {
    for (const [type, count] of Object.entries(stat.byType)) {
      aggregated[type] = (aggregated[type] ?? 0) + count;
    }
  }

  const entries = Object.entries(aggregated).sort(([, a], [, b]) => b - a);
  const maxCount = entries.length > 0 ? Math.max(...entries.map(([, c]) => c), 1) : 1;

  return (
    <div className="space-y-2">
      {entries.map(([type, count]) => (
        <HorizontalBar key={type} label={type} value={count} max={maxCount} />
      ))}
    </div>
  );
}
