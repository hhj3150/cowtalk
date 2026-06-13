// 정액 추천 정확도 위젯 — 채택률 + 수태율 lift (Intelligence Loop 4층, 번식 도메인)
// 데이터 출처: GET /ai/performance/recommendation-accuracy

import React from 'react';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import type { RecommendationAccuracy } from '@web/api/ai-performance.api';

interface Props {
  readonly data?: RecommendationAccuracy;
  readonly isLoading?: boolean;
}

function fmtPct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`;
}

function fmtLift(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%p`;
}

function liftColor(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value === 0) return 'var(--ct-text)';
  return value > 0 ? 'var(--ct-success, #16a34a)' : 'var(--ct-danger)';
}

function MetricTile({
  label,
  value,
  sub,
  valueColor,
}: {
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
  readonly valueColor?: string;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-card)' }}>
      <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{label}</p>
      <p className="mt-1 text-lg font-bold" style={{ color: valueColor ?? 'var(--ct-text)' }}>{value}</p>
      {sub && <p className="mt-0.5 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{sub}</p>}
    </div>
  );
}

export function RecommendationAccuracyCard({ data, isLoading }: Props): React.JSX.Element {
  if (isLoading) {
    return (
      <div className="ct-card p-4">
        <LoadingSkeleton lines={3} />
      </div>
    );
  }

  const insufficient = !data || data.adherenceStatus === 'data_insufficient' || data.actionedBatches === 0;

  return (
    <div className="ct-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>정액 추천 정확도</h2>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--ct-primary-light)', color: 'var(--ct-primary)' }}>
          추천 {data?.totalBatches ?? 0}건
        </span>
      </div>

      {insufficient ? (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--ct-text-secondary)' }}>
          데이터 누적 중 — 현재 추천 {data?.totalBatches ?? 0}건 기록됨. 추천 후 수정·임신감정이 쌓이면
          채택률과 수태율 lift가 표시됩니다.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricTile
              label="채택률"
              value={fmtPct(data.adherenceRate)}
              sub={`수정 ${data.actionedBatches}건 중 추천정액`}
            />
            <MetricTile
              label="추천-사용 수태율"
              value={fmtPct(data.recommendedConceptionRate)}
              sub={`판정 ${data.recommendedDecided}건`}
            />
            <MetricTile
              label="비추천-사용 수태율"
              value={fmtPct(data.nonRecommendedConceptionRate)}
              sub={`판정 ${data.nonRecommendedDecided}건`}
            />
            <MetricTile
              label="수태율 lift"
              value={fmtLift(data.lift)}
              valueColor={liftColor(data.lift)}
              sub="추천 − 비추천"
            />
          </div>
          <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
            lift는 추천정액 사용군과 비추천 사용군의 수태율 차이(퍼센트포인트)입니다.
            양수일수록 추천이 실제 수태에 기여하고 있음을 뜻합니다.
          </p>
        </>
      )}
    </div>
  );
}
