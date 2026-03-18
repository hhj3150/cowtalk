// AI 인사이트 패널 — 연한 그린 배경 (#F0FAF5) + 그린 보더
// Claude / v4_fallback / cache 소스 표시 + 위험요소 + 권고사항 + 근거 데이터

import React from 'react';
import { Badge, severityToBadgeVariant } from '@web/components/common/Badge';

interface Props {
  readonly summary: string;
  readonly interpretation?: string;
  readonly risks?: readonly string[];
  readonly recommendations?: readonly string[];
  readonly source: string;
  readonly severity?: string;
  readonly dataReferences?: readonly string[];
  readonly isLoading?: boolean;
}

function InsightSkeleton(): React.JSX.Element {
  return (
    <div
      className="animate-pulse p-4"
      style={{
        background: 'var(--ct-ai-bg)',
        border: '1px solid var(--ct-ai-border)',
        borderRadius: '12px',
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="h-4 w-4 rounded" style={{ background: 'var(--ct-border)' }} />
        <div className="h-4 w-16 rounded" style={{ background: 'var(--ct-border)' }} />
      </div>
      <div className="h-3 w-full rounded" style={{ background: 'var(--ct-border)' }} />
      <div className="mt-2 h-3 w-4/5 rounded" style={{ background: 'var(--ct-border)' }} />
      <div className="mt-2 h-3 w-2/3 rounded" style={{ background: 'var(--ct-border)' }} />
    </div>
  );
}

function sourceBadgeLabel(source: string): string {
  if (source === 'claude') return 'Claude';
  if (source === 'v4_fallback') return 'v4 엔진';
  if (source === 'cache') return '캐시';
  if (source === 'db_aggregate') return 'DB 집계';
  return source;
}

export function AiInsightPanel({
  summary,
  interpretation,
  risks = [],
  recommendations = [],
  source,
  severity,
  dataReferences,
  isLoading,
}: Props): React.JSX.Element {
  if (isLoading) return <InsightSkeleton />;

  return (
    <div
      className="p-4"
      style={{
        background: 'var(--ct-ai-bg)',
        border: '1px solid var(--ct-ai-border)',
        borderRadius: '12px',
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <svg className="h-4 w-4" style={{ color: 'var(--ct-primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        <span className="text-sm font-semibold" style={{ color: 'var(--ct-primary)' }}>AI 분석</span>
        <Badge
          label={sourceBadgeLabel(source)}
          variant="success"
        />
        {severity && <Badge label={severity} variant={severityToBadgeVariant(severity)} />}
      </div>

      <p className="text-sm" style={{ color: 'var(--ct-text)' }}>{summary}</p>

      {interpretation && (
        <p className="mt-2 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{interpretation}</p>
      )}

      {risks.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--ct-danger)' }}>위험 요소</p>
          <ul className="space-y-0.5">
            {risks.map((risk, i) => (
              <li key={i} className="flex items-start gap-1 text-xs" style={{ color: 'var(--ct-danger)' }}>
                <span className="mt-0.5">•</span>
                {risk}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium" style={{ color: 'var(--ct-success)' }}>권고사항</p>
          <ul className="space-y-0.5">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-1 text-xs" style={{ color: 'var(--ct-success)' }}>
                <span className="mt-0.5">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dataReferences && dataReferences.length > 0 && (
        <div className="mt-3 border-t pt-2" style={{ borderColor: 'rgba(29, 158, 117, 0.2)' }}>
          <p className="mb-1 text-[10px] font-medium" style={{ color: 'var(--ct-text-secondary)' }}>근거 데이터</p>
          <div className="flex flex-wrap gap-1">
            {dataReferences.map((ref, i) => (
              <span
                key={i}
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={{ background: 'var(--ct-primary-light)', color: 'var(--ct-primary)' }}
              >
                {ref}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
