// 폐루프 건강관리 — 감지(smaXtec) → 개입(처치) → 센서 검증 → 수의사 확정
// smaXtec 이 개발 중인 체내 방출형 볼루스는 '개입'을 자동화한다. 이 화면은 그 뒤의
// '효과 확인'까지 루프가 실제로 닫혔는지 보여준다.

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ClosedLoopTreatmentItem, LoopVerdict } from '@cowtalk/shared';
import { fetchClosedLoopStatus, fetchClosedLoopProtocols } from '@web/api/closed-loop.api';
import { useFarmStore } from '@web/stores/farm.store';
import { TitleAccentBar } from '@web/components/unified-dashboard/WidgetTitle';
import { ErrorFallback } from '@web/components/common/ErrorFallback';

const VERDICT_META: Readonly<Record<LoopVerdict, { label: string; color: string; order: number }>> = {
  worsened: { label: '악화', color: '#ef4444', order: 0 },
  not_improved: { label: '미회복', color: '#f97316', order: 1 },
  resolved: { label: '회복(확정 대기)', color: '#22c55e', order: 2 },
  improving: { label: '회복 추세', color: '#84cc16', order: 3 },
  monitoring: { label: '검증 중', color: '#3b82f6', order: 4 },
  insufficient_data: { label: '센서 부족', color: '#94a3b8', order: 5 },
  awaiting: { label: '검증 대기', color: '#94a3b8', order: 6 },
};

const VET_OUTCOME_LABEL: Readonly<Record<string, string>> = {
  recovered: '완치 확정', relapsed: '재발 확정', worsened: '악화 확정',
};

function pct(r: number | null): string {
  return r === null ? '—' : `${Math.round(r * 100)}%`;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Stage({ label, value, sub }: { readonly label: string; readonly value: string | number; readonly sub?: string }): React.JSX.Element {
  return (
    <div className="ct-card" style={{ flex: '1 1 120px', borderRadius: 12, padding: '10px 12px', minWidth: 110 }}>
      <div style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ct-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>{sub}</div>}
    </div>
  );
}

function TreatmentRow({ item }: { readonly item: ClosedLoopTreatmentItem }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const v = item.verification;
  const meta = VERDICT_META[v.verdict];
  return (
    <div style={{ borderTop: '1px solid var(--ct-border)', padding: '10px 0' }}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); }}
        aria-expanded={open}
        style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: meta.color, borderRadius: 8, padding: '2px 8px', whiteSpace: 'nowrap' }}>
          {meta.label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ct-text)', minWidth: 56 }}>{item.earTag}</span>
        <span style={{ fontSize: 12, color: 'var(--ct-text)', flex: 1 }}>
          {item.diagnosis} · {item.drug}
        </span>
        <span style={{ fontSize: 11, color: 'var(--ct-text-muted)', whiteSpace: 'nowrap' }}>
          {item.detectedAt ? `감지 ${fmt(item.detectedAt)} → ` : '현장 발견 · '}처치 {fmt(item.administeredAt)}
        </span>
        {item.vetOutcome && (
          <span style={{ fontSize: 11, color: 'var(--ct-primary)', whiteSpace: 'nowrap' }}>✔ {VET_OUTCOME_LABEL[item.vetOutcome] ?? item.vetOutcome}</span>
        )}
      </button>
      {open && (
        <div style={{ marginTop: 8, paddingLeft: 8, fontSize: 12, color: 'var(--ct-text)' }}>
          <div style={{ marginBottom: 4 }}>{v.explanation}</div>
          {v.contributingFactors.length > 0 && (
            <ul style={{ margin: '4px 0', paddingLeft: 18, color: 'var(--ct-text-muted)', fontSize: 11 }}>
              {v.contributingFactors.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
          <div style={{ fontWeight: 600, color: meta.color }}>→ {v.nextAction}</div>
          <Link to={`/cow/${item.animalId}`} style={{ fontSize: 11, color: 'var(--ct-primary)' }}>개체 상세 보기</Link>
        </div>
      )}
    </div>
  );
}

export function ClosedLoopPage(): React.JSX.Element {
  const { selectedFarmId } = useFarmStore();
  const [days, setDays] = useState(14);
  const [showProtocols, setShowProtocols] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['closed-loop', selectedFarmId, days],
    queryFn: () => fetchClosedLoopStatus(selectedFarmId!, days),
    enabled: Boolean(selectedFarmId),
    refetchInterval: 5 * 60_000,
  });
  const { data: protocols } = useQuery({
    queryKey: ['closed-loop-protocols'],
    queryFn: fetchClosedLoopProtocols,
    enabled: showProtocols,
    staleTime: Infinity,
  });

  const sorted = [...(data?.treatments ?? [])].sort(
    (a, b) => VERDICT_META[a.verification.verdict].order - VERDICT_META[b.verification.verdict].order,
  );

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <TitleAccentBar />
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ct-text)', margin: 0 }}>폐루프 건강관리</h1>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ct-text-muted)', marginBottom: 14 }}>
        감지 → 개입 → 센서 검증 → 수의사 확정. 알람이 실제 처치와 효과 확인까지 이어졌는지 봅니다.
        센서 판정은 보조 근거이며, 결과 확정은 수의사가 합니다.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => { setDays(d); }}
            aria-pressed={days === d}
            style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 8, cursor: 'pointer', border: '1px solid',
              borderColor: days === d ? 'var(--ct-primary)' : 'var(--ct-border)',
              background: days === d ? 'rgba(16,185,129,0.08)' : 'transparent', color: 'var(--ct-text)',
            }}
          >
            최근 {d}일
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setShowProtocols((s) => !s); }}
          aria-expanded={showProtocols}
          style={{ marginLeft: 'auto', fontSize: 12, background: 'none', border: 'none', color: 'var(--ct-primary)', cursor: 'pointer' }}
        >
          {showProtocols ? '검증 기준 닫기' : '질환별 검증 기준 보기'}
        </button>
      </div>

      {showProtocols && protocols && (
        <div className="ct-card" style={{ borderRadius: 14, padding: 14, marginBottom: 14, fontSize: 12 }}>
          {protocols.map((p) => (
            <div key={p.key} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: 'var(--ct-text)' }}>
                {p.label} <span style={{ fontWeight: 400, color: 'var(--ct-text-muted)' }}>· 처치 {p.verifyStartHours}h 후부터 {p.verifyWindowHours}h 검증</span>
              </div>
              <div style={{ color: 'var(--ct-text-muted)' }}>{p.criteriaText.join(' / ')}</div>
              <div style={{ color: 'var(--ct-text)' }}>
                개입 후보: {p.interventions.map((i) => `${i.label}${i.requiresVet ? '(수의사)' : ''}${i.futureBolusCandidate ? ' ◇' : ''}`).join(', ')}
              </div>
              {p.caveat && <div style={{ color: '#f59e0b' }}>⚠ {p.caveat}</div>}
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
            ◇ smaXtec 체내 방출형 볼루스(개발 중·상용화 미정) 적용 후보 — 출시되면 개입 기록으로 수신해 같은 기준으로 검증합니다.
          </div>
        </div>
      )}

      {!selectedFarmId && (
        <div className="ct-card" style={{ borderRadius: 14, padding: 16, fontSize: 13, color: 'var(--ct-text-muted)' }}>
          상단에서 목장을 선택하세요.
        </div>
      )}
      {selectedFarmId && isLoading && <div style={{ fontSize: 13, color: 'var(--ct-text-muted)' }}>불러오는 중…</div>}
      {selectedFarmId && error && <ErrorFallback error={error as Error} onRetry={() => { void refetch(); }} />}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Stage label="① 감지 (smaXtec)" value={data.funnel.detected} sub="개체별 72h 병합" />
            <Stage label="② 개입 연결" value={data.funnel.intervened} sub={`연결률 ${pct(data.funnel.interventionRate)}`} />
            <Stage label="현장 발견 처치" value={data.funnel.sensorOnlyTreatments} sub="센서 감지 없이 처치" />
            <Stage label="③ 센서 검증 종결" value={data.funnel.verified} sub={`회복 ${data.funnel.resolved}`} />
            <Stage label="④ 수의사 확정" value={data.funnel.vetConfirmed} sub={`종결률 ${pct(data.funnel.closureRate)}`} />
          </div>

          <div className="ct-card" style={{ borderRadius: 14, padding: 14, marginBottom: 12, fontSize: 12, color: 'var(--ct-text)' }}>
            <div>👨‍🌾 {data.roleSpecific.farmer}</div>
            <div style={{ marginTop: 4 }}>🩺 {data.roleSpecific.veterinarian}</div>
          </div>

          <div className="ct-card" style={{ borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)', marginBottom: 4 }}>
              처치별 센서 검증 ({sorted.length})
            </div>
            {sorted.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>기간 내 처치 기록이 없습니다.</div>
              : sorted.map((t) => <TreatmentRow key={t.treatmentId} item={t} />)}
          </div>

          <div className="ct-card" style={{ borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)', marginBottom: 4 }}>
              조치 미기록 감지 ({data.openDetections.length})
            </div>
            <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginBottom: 6 }}>
              감지 후 24시간이 지나도록 처치 기록이 없는 건입니다. 관찰만으로 충분했다면 그것도 기록해 두면 루프가 닫힙니다.
            </div>
            {data.openDetections.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>없음</div>
              : data.openDetections.map((d) => (
                <div key={`${d.animalId}-${d.detectedAt}`} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '6px 0', borderTop: '1px solid var(--ct-border)' }}>
                  <Link to={`/cow/${d.animalId}`} style={{ fontWeight: 600, color: 'var(--ct-primary)', minWidth: 56 }}>{d.earTag}</Link>
                  <span style={{ flex: 1, color: 'var(--ct-text)' }}>{d.eventTypes.join(', ')}</span>
                  <span style={{ color: 'var(--ct-text-muted)' }}>{fmt(d.detectedAt)} · {d.hoursOpen}h 경과{d.acknowledged ? ' · 확인됨' : ''}</span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ClosedLoopPage;
