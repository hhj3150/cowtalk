// 조치 기록률 위젯 — "알림을 받고 실제로 행동했는가" (파일럿 성패 지표)
//
// 정직성: 표본이 없으면 0% 대신 "집계 대상 없음"을 보여준다.
// 결정 카드 완료는 분모가 없으므로 건수만 표시한다.

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../api/client';
import { useFarmStore } from '../../stores/farm.store';

interface RatePair {
  readonly total: number;
  readonly acked: number;
  readonly ratePct: number | null;
}

interface ActionRateReport {
  readonly periodDays: number;
  readonly alerts: RatePair;
  readonly smaxtec: RatePair;
  readonly decisionsCompleted: number;
  readonly status: 'ok' | 'data_insufficient';
}

function rateColor(pct: number | null): string {
  if (pct === null) return 'var(--ct-text-muted)';
  if (pct >= 70) return '#34d399';
  if (pct >= 40) return '#fbbf24';
  return '#f87171';
}

function RateRow({ label, pair }: { readonly label: string; readonly pair: RatePair }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--ct-text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: rateColor(pair.ratePct), fontVariantNumeric: 'tabular-nums' }}>
        {pair.ratePct === null ? '집계 대상 없음' : `${pair.ratePct}%`}
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--ct-text-muted)', marginLeft: 6 }}>
          {pair.total > 0 ? `${pair.acked}/${pair.total}건` : ''}
        </span>
      </span>
    </div>
  );
}

export function ActionRateWidget(): React.JSX.Element {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);

  const { data, isLoading } = useQuery({
    queryKey: ['action-rate', selectedFarmId ?? 'all'],
    queryFn: () =>
      apiGet<ActionRateReport>('/decision/action-rate', selectedFarmId ? { farmId: selectedFarmId, days: 7 } : { days: 7 }),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) {
    return <div style={{ padding: 12, fontSize: 12, color: 'var(--ct-text-muted)' }}>조치 기록률 로딩 중…</div>;
  }

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid var(--ct-border)',
        background: 'var(--ct-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>
          ✅ 조치 기록률 <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--ct-text-muted)' }}>최근 {data.periodDays}일</span>
        </span>
        <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
          결정 완료 <b style={{ color: 'var(--ct-text)' }}>{data.decisionsCompleted}</b>건
        </span>
      </div>

      {data.status === 'data_insufficient' ? (
        <div style={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>
          기간 내 알림이 없어 확인율을 집계할 수 없습니다.
        </div>
      ) : (
        <>
          <RateRow label="CowTalk 알림 확인" pair={data.alerts} />
          <RateRow label="smaXtec 알람 확인" pair={data.smaxtec} />
        </>
      )}

      <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
        받은 알림에 확인·조치를 기록할수록 AI 학습과 성과 리포트가 정확해집니다.
      </div>
    </div>
  );
}
