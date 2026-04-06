// 수의사 프로토콜 탭 — 액션플랜 + 치료 경과 대기 리스트
// VetDashboard에서 분리 (파일 크기 관리)

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '@web/api/client';

// ── 타입 ──

interface PendingOutcome {
  readonly treatmentId: string;
  readonly animalId: string;
  readonly earTag: string;
  readonly diagnosis: string;
  readonly drug: string;
  readonly administeredAt: string;
  readonly outcomeStatus: string;
  readonly autoAssessment: string;
  readonly daysSinceTreatment: number;
  readonly sensor: {
    readonly pre: { readonly temp?: number; readonly rumination?: number } | null;
    readonly post: { readonly temp: number | null; readonly rumination: number | null };
  };
}

// ── 상수 ──

const EVENT_LABELS: Readonly<Record<string, { label: string; icon: string; color: string }>> = {
  temperature_high:    { label: '고체온',    icon: '🌡️', color: '#ef4444' },
  clinical_condition:  { label: '임상 이상', icon: '🏥', color: '#dc2626' },
  rumination_decrease: { label: '반추 저하', icon: '📉', color: '#eab308' },
  calving_detection:   { label: '분만 임박', icon: '🐄', color: '#8b5cf6' },
};

const ACTION_PLANS: Readonly<Record<string, readonly string[]>> = {
  temperature_high: [
    '직장 체온 재측정 (항문삽입 2분, 정상 38.5±0.5°C)',
    '호흡수·심박수 청진 (정상: 호흡 12-30/분, 심박 48-84/분)',
    '유방 CMT 검사 및 유량 변화 확인',
    '케토시스 소변 스트립 검사 (BHB ≥ 1.0mmol/L 주의)',
    '발열 원인 감별: 유방염·자궁내막염·폐렴·BRD',
    '플루닉신 메글루민(Flunixin) 또는 케토프로펜 고려',
  ],
  clinical_condition: [
    '전신 상태 평가 (기립·반추·식욕·배변·비강분비)',
    'SWIM 점수 산정 (기립=0-3, 반추=0-3, 식욕=0-3)',
    '복부 청진: 좌·우 핑음 확인 (LDA/RDA 감별)',
    '혈액검사: BHB, Ca, NEFA, AST, BUN 패널',
    '수액 처치 필요 여부 판단 (탈수 5% 이상 시)',
    '격리 여부 결정 및 치료 기록 작성',
  ],
  rumination_decrease: [
    '반추 시간 재확인 (smaXtec 기준, 정상 400-600분/일)',
    'BCS(체형점수) 평가 (산후 기간 고려, 정상 2.75-3.25)',
    'TMR 섭취량 추정 및 사료 변경 이력 확인',
    'pH 센서 값 확인 (5.5 미만: SARA 의심)',
    '반추 저하 + 고체온 동반 시 임상 검사 즉시 실시',
    '사양관리자에게 TMR 배합·급이 시간 점검 요청',
  ],
  calving_detection: [
    '분만 징후 확인: 외음부 이완·유방 충혈·행동 변화',
    '분만실 이동 및 청결 확인',
    '분만 예상 시간 기록 (발정 후 280일 기준)',
    '분만 지연 기준: 경산우 30분·초산우 1시간 초과 시 조력',
    '태아 위치 확인: 정상은 전지 양발 먼저 노출',
    '분만 후 초유 급이 4시간 이내(생후 1시간 내 권장)',
  ],
};

// ── 서브 컴포넌트: 액션플랜 카드 ──

function ActionPlanCard({ eventType, count }: { readonly eventType: string; readonly count: number }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const meta = EVENT_LABELS[eventType];
  if (!meta) return <></>;
  const plans = ACTION_PLANS[eventType];
  if (!plans || plans.length === 0) return <></>;

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${meta.color}30`, background: `${meta.color}08`, overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
      }}>
        <span style={{ fontSize: 18 }}>{meta.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: meta.color, flex: 1, textAlign: 'left' }}>
          {meta.label} {count}두 — 수의학 액션플랜
        </span>
        <span style={{ fontSize: 12, color: '#64748b' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plans.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                background: meta.color, borderRadius: '50%', width: 18, height: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{i + 1}</span>
              <span style={{ fontSize: 12, color: 'var(--ct-text)', lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 서브 컴포넌트: 치료 경과 대기 항목 ──

function OutcomeItem({ item, onConfirm }: {
  readonly item: PendingOutcome;
  readonly onConfirm: (treatmentId: string, status: 'recovered' | 'relapsed' | 'worsened') => void;
}): React.JSX.Element {
  const navigate = useNavigate();
  const [showActions, setShowActions] = useState(false);
  const assessColor = item.autoAssessment === 'recovered' ? '#22c55e'
    : item.autoAssessment === 'worsened' ? '#ef4444' : '#eab308';
  const assessLabel = item.autoAssessment === 'recovered' ? '회복 추정'
    : item.autoAssessment === 'worsened' ? '악화 의심' : '모니터링 중';
  const assessIcon = item.autoAssessment === 'recovered' ? '🟢'
    : item.autoAssessment === 'worsened' ? '🔴' : '🟡';

  const tempPre = item.sensor.pre?.temp;
  const tempPost = item.sensor.post.temp;
  const tempChange = (tempPre !== undefined && tempPre !== null && tempPost !== null)
    ? `${String(tempPre)}→${String(tempPost)}°C`
    : tempPost !== null ? `현재 ${String(tempPost)}°C` : '—';

  const isConfirmed = item.outcomeStatus !== 'pending';

  return (
    <div style={{ borderBottom: '1px solid var(--ct-border)' }}>
      <button
        type="button"
        onClick={() => isConfirmed ? navigate(`/cow/${item.animalId}`) : setShowActions((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 0, border: 'none',
          background: `${assessColor}08`, cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 16, flexShrink: 0 }}>{assessIcon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>#{item.earTag}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: assessColor }}>{assessLabel}</span>
            <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>D+{item.daysSinceTreatment}</span>
            {isConfirmed && (
              <span style={{ fontSize: 10, fontWeight: 600, color: '#3b82f6', background: '#3b82f610', padding: '1px 6px', borderRadius: 4 }}>확인됨</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 2 }}>
            {item.diagnosis} · {item.drug} · 체온 {tempChange}
          </div>
        </div>
        <span style={{ fontSize: 16, color: '#64748b', flexShrink: 0 }}>{showActions ? '▼' : '›'}</span>
      </button>
      {showActions && !isConfirmed && (
        <div style={{ display: 'flex', gap: 6, padding: '6px 12px 10px', background: `${assessColor}04` }}>
          {([
            { status: 'recovered' as const, label: '✅ 회복', bg: '#22c55e' },
            { status: 'worsened' as const, label: '🔴 악화', bg: '#ef4444' },
            { status: 'relapsed' as const, label: '🔁 재발', bg: '#f59e0b' },
          ]).map(({ status, label, bg }) => (
            <button
              key={status}
              type="button"
              onClick={(e) => { e.stopPropagation(); onConfirm(item.treatmentId, status); }}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 6, border: 'none',
                background: bg, color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/cow/${item.animalId}`); }}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 700,
              border: '1px solid var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)',
              cursor: 'pointer',
            }}
          >
            상세보기
          </button>
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ──

interface Props {
  readonly criticalTotal: number;
  readonly watchTotal: number;
  readonly calvingTotal: number;
}

export function VetProtocolTab({ criticalTotal, watchTotal, calvingTotal }: Props): React.JSX.Element {
  const queryClient = useQueryClient();

  const { data: pendingData } = useQuery({
    queryKey: ['treatments', 'pending-outcomes'],
    queryFn: () => apiGet<{ data: readonly PendingOutcome[]; total: number }>('/treatments/pending-outcomes'),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  const confirmMutation = useMutation({
    mutationFn: ({ treatmentId, outcomeStatus }: { treatmentId: string; outcomeStatus: 'recovered' | 'relapsed' | 'worsened' }) =>
      apiPost(`/treatments/${treatmentId}/outcome`, { outcomeStatus }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['treatments', 'pending-outcomes'] });
    },
  });

  const handleConfirm = (treatmentId: string, status: 'recovered' | 'relapsed' | 'worsened') => {
    confirmMutation.mutate({ treatmentId, outcomeStatus: status });
  };

  const pendingItems = pendingData?.data ?? [];
  const recoveredCount = pendingItems.filter((i) => i.autoAssessment === 'recovered').length;
  const worsenedCount = pendingItems.filter((i) => i.autoAssessment === 'worsened').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }}>

      {/* 치료 경과 대기 리스트 */}
      {pendingItems.length > 0 && (
        <div style={{
          borderRadius: 10, border: '1px solid rgba(59,130,246,0.3)',
          background: 'rgba(59,130,246,0.06)', overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(59,130,246,0.15)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>
              💊 치료 경과 확인 ({pendingItems.length}건)
            </div>
            <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 2 }}>
              {recoveredCount > 0 && <span style={{ color: '#22c55e', marginRight: 8 }}>회복 {recoveredCount}건</span>}
              {worsenedCount > 0 && <span style={{ color: '#ef4444', marginRight: 8 }}>악화 {worsenedCount}건</span>}
              센서 기반 자동 판정 — 클릭하여 개체 확인
            </div>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {[...pendingItems]
              .sort((a: PendingOutcome, b: PendingOutcome) => {
                const order: Record<string, number> = { worsened: 0, monitoring: 1, recovered: 2 };
                return (order[a.autoAssessment] ?? 1) - (order[b.autoAssessment] ?? 1);
              })
              .map((item: PendingOutcome) => (
                <OutcomeItem key={item.treatmentId} item={item} onConfirm={handleConfirm} />
              ))}
          </div>
        </div>
      )}

      {/* 증상별 액션플랜 */}
      <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', padding: '0 4px 4px' }}>
        탭을 눌러 각 증상별 현장 프로토콜을 확인하세요
      </div>
      {Object.entries(ACTION_PLANS).map(([type]) => {
        const count =
          type === 'temperature_high' ? criticalTotal :
          type === 'clinical_condition' ? 0 :
          type === 'rumination_decrease' ? watchTotal :
          type === 'calving_detection' ? calvingTotal : 0;
        return <ActionPlanCard key={type} eventType={type} count={count} />;
      })}

      {/* 역학 모니터링 기준 */}
      <div style={{
        borderRadius: 10, border: '1px solid rgba(99,102,241,0.3)',
        background: 'rgba(99,102,241,0.06)', padding: '12px 14px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#6366f1', marginBottom: 8 }}>
          🔬 역학적 모니터링 기준
        </div>
        {[
          '동일 농장 고체온 3두 이상 → 전파성 질병 의심, 격리 조치',
          '인근 농장 동시 다발 → KAHIS 역학 시스템 보고 검토',
          '반추 저하 + 고체온 + 활동 저하 동반 → BRD/BVD 배제',
          'DIM 0~21일 고체온 → 산욕열·자궁내막염 우선 감별',
          '분만 후 72시간 내 케토시스 스크리닝 (BHB ≥ 1.4 mmol/L)',
        ].map((rule, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'flex-start' }}>
            <span style={{ color: '#6366f1', flexShrink: 0, fontSize: 12 }}>▸</span>
            <span style={{ fontSize: 11, color: 'var(--ct-text)', lineHeight: 1.5 }}>{rule}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
