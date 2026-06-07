// /vet/stats — 수의사 진료 통계 대시보드 (진료 건수·질병 분포·문서/약물보고 현황)
import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { vetApi } from '@web/api/vet.api';
import { VetCard } from './vet-ui';

export default function VetStatsPage(): React.JSX.Element {
  const statsQuery = useQuery({ queryKey: ['vet', 'stats'], queryFn: () => vetApi.getStats() });
  const s = statsQuery.data;
  const maxTrend = Math.max(1, ...(s?.recent_trend ?? []).map((t) => t.count));
  const maxDiag = Math.max(1, ...(s?.diagnosis_distribution ?? []).map((d) => d.count));

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 pb-16">
      <header className="space-y-1">
        <Link to="/vet" className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>← 진료센터</Link>
        <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>진료 통계</h1>
      </header>

      {statsQuery.isLoading && <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>불러오는 중…</p>}
      {statsQuery.isError && <p className="text-sm" style={{ color: 'var(--ct-danger, #ef4444)' }}>통계를 불러오지 못했습니다.</p>}

      {s && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Kpi label="총 진료" value={s.total_visits} />
            <Kpi label="최근 30일 진료" value={s.visits_30d} />
            <Kpi label="발행 문서" value={s.documents_sent} />
            <Kpi label="약물보고 제출" value={s.drug_reports_submitted} />
            <Kpi label="처방대상 약물" value={s.prescription_target_count} />
          </div>

          <VetCard>
            <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--ct-text)' }}>질병 분포 (최종진단 TOP 5)</h2>
            {s.diagnosis_distribution.length === 0
              ? <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>데이터가 없습니다.</p>
              : (
                <ul className="space-y-1.5">
                  {s.diagnosis_distribution.map((d, i) => (
                    <li key={i}>
                      <div className="flex justify-between text-xs" style={{ color: 'var(--ct-text)' }}>
                        <span>{d.diagnosis}</span><span>{d.count}건</span>
                      </div>
                      <div className="h-2 rounded" style={{ background: 'var(--ct-border)' }}>
                        <div className="h-2 rounded" style={{ width: `${(d.count / maxDiag) * 100}%`, background: 'var(--ct-primary, #2563eb)' }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </VetCard>

          <VetCard>
            <h2 className="mb-2 text-sm font-bold" style={{ color: 'var(--ct-text)' }}>최근 14일 진료 추이</h2>
            {s.recent_trend.length === 0
              ? <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>데이터가 없습니다.</p>
              : (
                <div className="flex items-end gap-1" style={{ height: 80 }}>
                  {s.recent_trend.map((t, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center justify-end" title={`${t.date}: ${t.count}건`}>
                      <div className="w-full rounded-t" style={{ height: `${(t.count / maxTrend) * 70}px`, background: 'var(--ct-primary, #2563eb)' }} />
                      <span className="mt-0.5 text-[9px]" style={{ color: 'var(--ct-text-secondary)' }}>{t.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
          </VetCard>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)' }}>
      <div className="text-2xl font-bold" style={{ color: 'var(--ct-text)' }}>{value.toLocaleString('ko-KR')}</div>
      <div className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{label}</div>
    </div>
  );
}
