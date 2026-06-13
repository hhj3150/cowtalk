// AI 성능 리포트 페이지 — Intelligence Loop 기반 정확도 분석

import React, { useState } from 'react';
import { KpiCard } from '@web/components/data/KpiCard';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { usePerformanceOverview, useAccuracyTrend, useRoleFeedbackStats, useRecommendationAccuracy } from '@web/hooks/useAiPerformance';
import { RecommendationAccuracyCard } from '@web/components/intelligence/RecommendationAccuracyCard';
import { useAuthStore } from '@web/stores/auth.store';
import type { EngineMetrics } from '@web/api/ai-performance.api';

const ENGINE_LABELS: Record<string, string> = {
  estrus: '발정 감지',
  disease: '건강 경고',
  pregnancy: '임신 예측',
  herd: '군집 분석',
  regional: '지역 분석',
  sovereign_v1: '주권형 알람 엔진',
  diff_diagnosis_v1: '감별진단 엔진',
  breeding_advisor_v1: '번식 추천 엔진',
};

// POLISH-03: 카드 노출 최소 평가 건수 (엔진별)
const MIN_EVALUATED = 10;

const ROLE_LABELS: Record<string, string> = {
  farmer: '농장주',
  veterinarian: '수의사',
  government_admin: '행정관',
  quarantine_officer: '방역관',
};

function ProgressBar({ value, label }: { readonly value: number; readonly label: string }): React.JSX.Element {
  // D5 (BUG-008): clampPct 강제 — 음수/100+ 입력으로 깨진 UI 방지.
  const safeValue = Number.isFinite(value) ? value : 0;
  const pct = Math.max(0, Math.min(safeValue * 100, 100));
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
        {/* POLISH-04: 서버 averageConfidence는 이미 0~100 스케일 — ×100 제거 + 0~100 클램프 */}
        <span>평균 신뢰도: {Math.max(0, Math.min(engine.averageConfidence, 100)).toFixed(1)}%</span>
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
  const { data: recAccuracy, isLoading: recLoading } = useRecommendationAccuracy();
  const [selectedEngine, setSelectedEngine] = useState('estrus');
  const userRole = useAuthStore((s) => s.user?.role);

  if (isLoading) return <LoadingSkeleton lines={8} />;

  const hasMinData = Boolean(data) && (data?.totalEvaluated ?? 0) >= 10;

  // POLISH-03: master(행정관 슈퍼계정)는 운영 피드백 누적 전이라도
  // 평가가 완료된 엔진 카드를 확인할 수 있다 (시드/시뮬레이션 평가 데이터).
  // 비-master는 기존 빈 메시지 동작을 그대로 보존한다.
  const isMaster = userRole === 'government_admin';
  const evaluatedEngines = (data?.engines ?? []).filter((e) => e.totalEvaluated >= MIN_EVALUATED);
  const showCards = hasMinData || (isMaster && evaluatedEngines.length > 0);
  const showSourceLabel = showCards && isMaster && !hasMinData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>AI 성능 리포트</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
          Intelligence Loop 피드백 기반 AI 정확도 분석
        </p>
      </div>

      {/* 정액 추천 정확도 — 엔진 평가와 독립된 번식 도메인 지표 (자체 빈 상태 처리) */}
      <RecommendationAccuracyCard data={recAccuracy} isLoading={recLoading} />

      {/* 최소 데이터 경고 */}
      {!showCards && (
        <div
          className="rounded-xl border p-6 text-center"
          style={{ borderColor: 'var(--ct-warning)', background: '#FFFBEB' }}
        >
          <p className="text-sm font-medium" style={{ color: '#92400E' }}>
            최소 10건의 평가 데이터가 필요합니다.
          </p>
          <p className="mt-1 text-xs" style={{ color: '#A16207' }}>
            평가 누적: {data?.totalEvaluated ?? 0}건. 평가가 쌓이면 정확도 분석이 시작됩니다.
          </p>
        </div>
      )}

      {showCards && data && (
        <>
          {/* 데이터 출처 안내 (master 한정 — 운영 피드백 누적 전 평가 데이터) */}
          {showSourceLabel && (
            <div
              className="rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-card)', color: 'var(--ct-text-secondary)' }}
            >
              📊 시드/시뮬레이션 평가 데이터 — 실제 운영 피드백이 누적되면 자동 갱신됩니다.
            </div>
          )}

          {/* AIPERF-BANNER-01: sovereign_alarm_labels 표본 편향 경고 (master 한정 노출) */}
          {isMaster && (
            <div
              className="rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--ct-warning-border, #f59e0b)', background: 'var(--ct-warning-bg, #fffbeb)', color: 'var(--ct-warning-text, #92400e)' }}
            >
              ⚠️ 표본 편향 알림 — 현재 sovereign 엔진의 라벨 표본은 confirmed 100%로 편향되어
              있습니다. 표시되는 Precision/Recall/F1은 confirmed-only 표본에서 산출된 값이며
              실제 모델 성능을 과대평가할 수 있습니다. (DATA-05 후속 패치에서 false_positive
              라벨링 경로 신설 예정)
            </div>
          )}

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
              label="총 평가 수"
              value={data.totalEvaluated.toLocaleString()}
              unit="건"
            />
            <KpiCard
              label="평가 누적률"
              value={`${(data.feedbackRate * 100).toFixed(1)}%`}
            />
          </div>

          {/* Engine cards */}
          <div>
            <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
              엔진별 성능
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {evaluatedEngines.map((engine) => (
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
