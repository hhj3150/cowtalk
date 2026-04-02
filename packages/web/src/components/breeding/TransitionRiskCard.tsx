// 전환기 위험우 카드 — 분만 50일 전~분만 후 30일 모니터링
// 농장주/수의사 대시보드에 삽입

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '@web/api/client';

type Phase = 'pre_calving' | 'post_calving';
type RiskLevel = 'high' | 'medium' | 'low';

interface TransitionAnimal {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly parity: number;
  readonly phase: Phase;
  readonly riskLevel: RiskLevel;
  readonly daysToCalving?: number;
  readonly daysSinceCalving?: number;
  readonly calvingDate?: string;
  readonly expectedCalvingDate?: string;
  readonly healthAlerts: number;
  readonly detail: string;
}

interface TransitionRiskData {
  readonly preCalving: readonly TransitionAnimal[];
  readonly postCalving: readonly TransitionAnimal[];
  readonly totalAtRisk: number;
}

const RISK_STYLE: Record<RiskLevel, { color: string; label: string }> = {
  high: { color: '#ef4444', label: '위험' },
  medium: { color: '#f97316', label: '주의' },
  low: { color: '#eab308', label: '관찰' },
};

interface Props {
  readonly farmId?: string;
}

export function TransitionRiskCard({ farmId }: Props): React.JSX.Element {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'pre' | 'post'>('pre');

  const url = farmId ? `/breeding/transition-risk/${farmId}` : '/breeding/transition-risk';
  const { data, isLoading } = useQuery<TransitionRiskData>({
    queryKey: ['transition-risk', farmId],
    queryFn: () => apiGet<TransitionRiskData>(url),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const list = tab === 'pre' ? (data?.preCalving ?? []) : (data?.postCalving ?? []);
  const preCount = data?.preCalving.length ?? 0;
  const postCount = data?.postCalving.length ?? 0;
  const totalAtRisk = data?.totalAtRisk ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 요약 헤더 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>{totalAtRisk}</div>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>전환기 모니터링</div>
        </div>
        <div style={{ flex: 1, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f97316' }}>{preCount}</div>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>분만 예정</div>
        </div>
        <div style={{ flex: 1, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#eab308' }}>{postCount}</div>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>분만 후 회복</div>
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 4 }}>
        {([
          { key: 'pre', label: `🤰 분만 전 (${preCount})` },
          { key: 'post', label: `🍼 분만 후 (${postCount})` },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 7,
              border: tab === t.key ? '1.5px solid var(--ct-primary)' : '1px solid var(--ct-border)',
              background: tab === t.key ? 'rgba(74,144,217,0.1)' : 'var(--ct-bg)',
              color: tab === t.key ? 'var(--ct-primary)' : 'var(--ct-text-muted)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: tab === t.key ? 700 : 400,
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 12, color: 'var(--ct-text-muted)', fontSize: 12 }}>로딩 중...</div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 12, color: 'var(--ct-text-muted)', fontSize: 12 }}>
          ✅ 해당 개체 없음
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 250, overflowY: 'auto' }}>
          {list.map((a) => {
            const risk = RISK_STYLE[a.riskLevel];
            return (
              <button
                key={a.animalId}
                type="button"
                onClick={() => navigate(`/cow/${a.animalId}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: `${risk.color}08`,
                  border: `1px solid ${risk.color}30`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                {/* 위험도 배지 */}
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: `${risk.color}18`,
                  border: `1.5px solid ${risk.color}50`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: risk.color }}>{risk.label}</span>
                  {a.phase === 'pre_calving' && a.daysToCalving !== undefined && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: risk.color }}>D-{a.daysToCalving}</span>
                  )}
                  {a.phase === 'post_calving' && a.daysSinceCalving !== undefined && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: risk.color }}>D+{a.daysSinceCalving}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ct-text)' }}>
                    #{a.earTag}
                    <span style={{ fontWeight: 400, color: 'var(--ct-text-muted)', marginLeft: 6, fontSize: 11 }}>
                      {a.parity}산차
                    </span>
                    {a.healthAlerts > 0 && (
                      <span style={{ marginLeft: 6, background: '#ef4444', color: '#fff', borderRadius: 4, padding: '1px 5px', fontSize: 9 }}>
                        ⚠️ {a.healthAlerts}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 2 }}>{a.detail}</div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--ct-text-muted)', flexShrink: 0 }}>→</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
