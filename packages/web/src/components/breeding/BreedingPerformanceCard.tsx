// 번식 성과 카드 — 수정사 대시보드용
// KPI: 수태율(CR%), 발정발견율(EDR%), 총수정건, 임신확인건

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBreedingStats } from '@web/api/breeding.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly farmId: string;
}

interface BreedingStats {
  readonly farmId: string;
  readonly estrusEventCount: number;
  readonly totalInseminations: number;
  readonly conceptionRate: number;
  readonly pregnantCount: number;
  readonly openCount: number;
  readonly breedingEvents: readonly Record<string, unknown>[];
  readonly pregnancyChecks: readonly Record<string, unknown>[];
}

export function BreedingPerformanceCard({ farmId }: Props): React.JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['breeding', 'stats', farmId],
    queryFn: () => getBreedingStats(farmId) as unknown as Promise<BreedingStats>,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={3} />;

  const stats = data as BreedingStats | undefined;
  const cr = stats?.conceptionRate ?? 0;
  const edr = stats?.estrusEventCount ?? 0;
  const totalIns = stats?.totalInseminations ?? 0;
  const pregnant = stats?.pregnantCount ?? 0;

  return (
    <div className="ct-card" style={{ padding: 16, borderRadius: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px', color: 'var(--ct-text)' }}>
        🐄 번식 성과
      </h3>

      {/* KPI 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <KpiMini label="수태율" value={`${cr}%`} color={cr >= 40 ? '#22c55e' : cr >= 25 ? '#eab308' : '#ef4444'} />
        <KpiMini label="발정감지" value={String(edr)} color="#6366f1" />
        <KpiMini label="총 수정" value={String(totalIns)} color="#3b82f6" />
        <KpiMini label="임신확인" value={String(pregnant)} color="#16a34a" />
      </div>

      {/* 최근 번식 이벤트 */}
      <div style={{ fontSize: 11, color: 'var(--ct-text-secondary)' }}>
        {stats?.breedingEvents && stats.breedingEvents.length > 0 ? (
          <div style={{ maxHeight: 120, overflowY: 'auto' }}>
            {stats.breedingEvents.slice(0, 5).map((evt, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--ct-border)' }}>
                <span>{String(evt.type)} — {String(evt.animalName ?? '')}</span>
                <span style={{ color: 'var(--ct-text-muted)', fontSize: 10 }}>
                  {evt.eventDate ? new Date(String(evt.eventDate)).toLocaleDateString('ko-KR') : ''}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ textAlign: 'center', padding: 12, color: 'var(--ct-text-muted)' }}>번식 기록 없음</p>
        )}
      </div>
    </div>
  );
}

function KpiMini({ label, value, color }: { label: string; value: string; color: string }): React.JSX.Element {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>{label}</div>
    </div>
  );
}
