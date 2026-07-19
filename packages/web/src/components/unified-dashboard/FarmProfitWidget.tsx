// 농장 손익 위젯 — "플랫폼으로 얼마 벌고 얼마 아꼈는가"를 농가가 직접 본다
//
// 정직성: dataSource(실제 입력/시뮬레이션/혼합)를 항상 배지로 표시하고,
// 시뮬레이션이면 실제 입력을 유도한다. 추정치를 실측처럼 보여주지 않는다.

import React, { useState } from 'react';
import type { FarmProfitData, FarmProfitEntryInput } from '@cowtalk/shared';
import { useFarmProfit, useSaveFarmProfit } from '../../hooks/useUnifiedDashboard';
import { useFarmStore } from '../../stores/farm.store';

const SOURCE_BADGE: Record<FarmProfitData['dataSource'], { label: string; color: string }> = {
  actual: { label: '실제 입력', color: '#34d399' },
  simulated: { label: '시뮬레이션', color: '#fbbf24' },
  mixed: { label: '실제+시뮬레이션 혼합', color: '#fbbf24' },
};

function krw(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`;
  if (abs >= 10_000) return `${Math.round(n / 10_000).toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

const ENTRY_FIELDS: readonly { key: keyof FarmProfitEntryInput; label: string; group: '수입' | '지출' }[] = [
  { key: 'revenueMilk', label: '원유 판매', group: '수입' },
  { key: 'revenueCalves', label: '송아지 판매', group: '수입' },
  { key: 'revenueSubsidies', label: '보조금', group: '수입' },
  { key: 'revenueCullSales', label: '도태우 판매', group: '수입' },
  { key: 'revenueOther', label: '기타 수입', group: '수입' },
  { key: 'costFeed', label: '사료비', group: '지출' },
  { key: 'costVet', label: '수의료비', group: '지출' },
  { key: 'costBreeding', label: '번식비', group: '지출' },
  { key: 'costLabor', label: '인건비', group: '지출' },
  { key: 'costFacility', label: '시설비', group: '지출' },
  { key: 'costOther', label: '기타 지출', group: '지출' },
];

function EntryForm({ farmId, period, onSaved }: {
  readonly farmId: string;
  readonly period: string;
  readonly onSaved: () => void;
}): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({});
  const save = useSaveFarmProfit();

  const handleSave = (): void => {
    const num = (k: keyof FarmProfitEntryInput): number => {
      const v = Number(values[k] ?? 0);
      return Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
    };
    const input: FarmProfitEntryInput = {
      farmId,
      period,
      revenueMilk: num('revenueMilk'),
      revenueCalves: num('revenueCalves'),
      revenueSubsidies: num('revenueSubsidies'),
      revenueCullSales: num('revenueCullSales'),
      revenueOther: num('revenueOther'),
      costFeed: num('costFeed'),
      costVet: num('costVet'),
      costBreeding: num('costBreeding'),
      costLabor: num('costLabor'),
      costFacility: num('costFacility'),
      costOther: num('costOther'),
    };
    save.mutate(input, { onSuccess: onSaved });
  };

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'var(--ct-surface-2, rgba(255,255,255,0.03))', border: '1px solid var(--ct-border)' }}>
      {(['수입', '지출'] as const).map((group) => (
        <div key={group} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ct-text-muted)', marginBottom: 6 }}>{group} (원)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
            {ENTRY_FIELDS.filter((f) => f.group === group).map((f) => (
              <label key={f.key} style={{ fontSize: 10, color: 'var(--ct-text-muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {f.label}
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={values[f.key] ?? ''}
                  placeholder="0"
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--ct-border)', background: 'var(--ct-card)', color: 'var(--ct-text)', fontSize: 12 }}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={handleSave}
        disabled={save.isPending}
        style={{ marginTop: 4, padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--ct-primary)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: save.isPending ? 0.5 : 1 }}
      >
        {save.isPending ? '저장 중…' : `${period} 손익 저장`}
      </button>
      {save.isError && (
        <span style={{ marginLeft: 8, fontSize: 11, color: '#f87171' }}>저장 실패 — 다시 시도해주세요</span>
      )}
    </div>
  );
}

export function FarmProfitWidget(): React.JSX.Element {
  const { data, isLoading } = useFarmProfit();
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const [showForm, setShowForm] = useState(false);

  if (isLoading || !data) {
    return <div style={{ padding: 20, textAlign: 'center', color: 'var(--ct-text-muted)', fontSize: 12 }}>손익 데이터 로딩 중…</div>;
  }

  const badge = SOURCE_BADGE[data.dataSource] ?? SOURCE_BADGE.simulated;
  const profit = data.summary.netProfit;
  const profitColor = profit >= 0 ? '#34d399' : '#f87171';

  const kpis = [
    { label: '순이익', value: krw(profit), color: profitColor },
    { label: '총수입', value: krw(data.summary.totalRevenue) },
    { label: '총지출', value: krw(data.summary.totalCosts) },
    { label: '이익률', value: `${data.summary.profitMargin}%` },
    { label: '두당 이익', value: krw(data.summary.profitPerHead) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>{data.farmName} · {data.period}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: `${badge.color}1a`, padding: '2px 8px', borderRadius: 6 }}>
          {badge.label}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8, marginTop: 10 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--ct-surface-2, rgba(255,255,255,0.03))', border: '1px solid var(--ct-border)' }}>
            <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>{k.label}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: k.color ?? 'var(--ct-text)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {data.costBreakdown.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ct-text-muted)', marginBottom: 6 }}>지출 구성</div>
          {data.costBreakdown.slice(0, 6).map((c) => (
            <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--ct-text)', width: 64, flexShrink: 0 }}>{c.label}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--ct-border)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, c.percentOfTotal)}%`, height: '100%', background: 'var(--ct-primary)' }} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--ct-text-muted)', width: 84, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {krw(c.amount)} ({c.percentOfTotal}%)
              </span>
            </div>
          ))}
        </div>
      )}

      {data.dataSource !== 'actual' && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#fbbf24' }}>
          실제 입력 데이터가 없어 추정치입니다 — 이번 달 손익을 입력하면 정확해집니다.
        </div>
      )}

      {selectedFarmId && (
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--ct-border)', background: 'transparent', color: 'var(--ct-text)', fontSize: 11, cursor: 'pointer' }}
          >
            {showForm ? '입력 닫기' : '이번 달 손익 입력'}
          </button>
          {showForm && (
            <EntryForm farmId={selectedFarmId} period={data.period} onSaved={() => setShowForm(false)} />
          )}
        </div>
      )}
    </div>
  );
}
