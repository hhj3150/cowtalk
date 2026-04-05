// 수의사 Command Center — 담당 농장 위험도 + 긴급 개체 + 방문 동선 + 액션플랜
// 데이터: drilldown(긴급 개체) + farmHealthScores(농장 위험) + vetRoute(동선) + epidemicIntelligence(집단감지)

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '@web/api/client';
import { useFarmStore } from '@web/stores/farm.store';
import { useFarmHealthScores, useVetRoute, useEpidemicIntelligence } from '@web/hooks/useUnifiedDashboard';
import { TransitionRiskCard } from '@web/components/breeding/TransitionRiskCard';
import { VetRouteWidget } from '@web/components/unified-dashboard/VetRouteWidget';

// ── 타입 ──────────────────────────────────────────

interface HealthAnimal {
  readonly eventId: string;
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly eventType: string;
  readonly detectedAt: string;
  readonly severity: string;
}

interface FarmHealthSummary {
  readonly farmId: string;
  readonly farmName: string;
  readonly critical: number;
  readonly watch: number;
  readonly calving: number;
  readonly animals: readonly HealthAnimal[];
}

interface VetStats {
  readonly criticalTotal: number;
  readonly watchTotal: number;
  readonly calvingTotal: number;
  readonly farms: readonly FarmHealthSummary[];
  readonly topAnimals: readonly HealthAnimal[];
}

// ── 상수 ──────────────────────────────────────────

const CRITICAL_TYPES = new Set(['temperature_high', 'clinical_condition', 'health_general']);
const WATCH_TYPES    = new Set(['rumination_decrease', 'activity_decrease', 'drinking_decrease']);
const CALVING_TYPES  = new Set(['calving_detection', 'calving_confirmation']);

const EVENT_LABELS: Readonly<Record<string, { label: string; icon: string; color: string }>> = {
  temperature_high:    { label: '고체온',    icon: '🌡️', color: '#ef4444' },
  clinical_condition:  { label: '임상 이상', icon: '🏥', color: '#dc2626' },
  health_general:      { label: '건강 주의', icon: '💊', color: '#f97316' },
  rumination_decrease: { label: '반추 저하', icon: '📉', color: '#eab308' },
  activity_decrease:   { label: '활동 저하', icon: '🐢', color: '#f59e0b' },
  drinking_decrease:   { label: '음수 저하', icon: '💧', color: '#6366f1' },
  calving_detection:   { label: '분만 임박', icon: '🐄', color: '#8b5cf6' },
  calving_confirmation:{ label: '분만 확인', icon: '✅', color: '#10b981' },
};

const SEVERITY_ORDER: Readonly<Record<string, number>> = {
  critical: 0, high: 1, medium: 2, low: 3,
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

// ── 유틸 ──────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  if (diff < 60) return `${Math.round(diff)}분 전`;
  if (diff < 1440) return `${Math.round(diff / 60)}시간 전`;
  return `${Math.round(diff / 1440)}일 전`;
}

function severityBadge(severity: string): React.JSX.Element {
  const colors: Readonly<Record<string, { bg: string; text: string; label: string }>> = {
    critical: { bg: '#ef444420', text: '#ef4444', label: '즉시' },
    high:     { bg: '#f9731620', text: '#f97316', label: '긴급' },
    medium:   { bg: '#eab30820', text: '#eab308', label: '주의' },
    low:      { bg: '#22c55e20', text: '#22c55e', label: '정상' },
  };
  const c = colors[severity] ?? colors.medium!;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
      background: c.bg, color: c.text,
    }}>
      {c.label}
    </span>
  );
}

function riskGrade(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: 'A', color: '#22c55e', bg: '#22c55e15' };
  if (score >= 60) return { label: 'B', color: '#eab308', bg: '#eab30815' };
  if (score >= 40) return { label: 'C', color: '#f97316', bg: '#f9731615' };
  return { label: 'D', color: '#ef4444', bg: '#ef444415' };
}

// ── 서브 컴포넌트: 개체 행 ────────────────────────

function AnimalRow({
  animal, onNavigate,
}: {
  readonly animal: HealthAnimal;
  readonly onNavigate: (id: string) => void;
}): React.JSX.Element {
  const meta = EVENT_LABELS[animal.eventType] ?? { label: animal.eventType, icon: '❓', color: '#94a3b8' };
  return (
    <button
      type="button"
      onClick={() => onNavigate(animal.animalId)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px', borderRadius: 8, border: 'none',
        background: 'var(--ct-bg)', cursor: 'pointer', textAlign: 'left',
        borderBottom: '1px solid var(--ct-border)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${meta.color}10`; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--ct-bg)'; }}
    >
      <span style={{ fontSize: 18, flexShrink: 0 }}>{meta.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>#{animal.earTag}</span>
          {severityBadge(animal.severity)}
          <span style={{ fontSize: 11, color: meta.color, fontWeight: 600 }}>{meta.label}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 2 }}>
          {animal.farmName} · {timeAgo(animal.detectedAt)}
        </div>
      </div>
      <span style={{ fontSize: 16, color: '#64748b', flexShrink: 0 }}>›</span>
    </button>
  );
}

// ── 서브 컴포넌트: 액션플랜 카드 ─────────────────

function ActionPlanCard({
  eventType, count,
}: {
  readonly eventType: string;
  readonly count: number;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const meta = EVENT_LABELS[eventType];
  if (!meta) return <></>;
  const plans = ACTION_PLANS[eventType];
  if (!plans || plans.length === 0) return <></>;

  return (
    <div style={{
      borderRadius: 10, border: `1px solid ${meta.color}30`,
      background: `${meta.color}08`, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
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
              }}>
                {i + 1}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ct-text)', lineHeight: 1.5 }}>{step}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 서브 컴포넌트: 농장 카드 ──────────────────────

function FarmCard({
  farm, onAnimalClick, onFarmClick,
}: {
  readonly farm: FarmHealthSummary;
  readonly onAnimalClick: (id: string) => void;
  readonly onFarmClick: (id: string) => void;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const urgencyColor = farm.critical > 0 ? '#ef4444' : farm.calving > 0 ? '#8b5cf6' : '#eab308';

  return (
    <div style={{
      borderRadius: 10, border: `1px solid ${urgencyColor}30`,
      background: `${urgencyColor}05`, overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: urgencyColor, flexShrink: 0,
          boxShadow: farm.critical > 0 ? `0 0 6px ${urgencyColor}` : 'none',
        }} />
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>
            {farm.farmName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
            {farm.critical > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>즉시진료 {farm.critical}두</span>}
            {farm.watch > 0 && <span style={{ color: '#eab308' }}>관찰 {farm.watch}두</span>}
            {farm.calving > 0 && <span style={{ color: '#8b5cf6' }}>분만 {farm.calving}두</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onFarmClick(farm.farmId); }}
          style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--ct-border)',
            background: 'var(--ct-card)', color: 'var(--ct-text-secondary)', cursor: 'pointer',
          }}
        >
          농장
        </button>
        <span style={{ fontSize: 12, color: '#64748b' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${urgencyColor}20` }}>
          {farm.animals.slice(0, 8).map((a) => (
            <AnimalRow key={a.eventId} animal={a} onNavigate={onAnimalClick} />
          ))}
          {farm.animals.length > 8 && (
            <div style={{ padding: '6px 14px', fontSize: 11, color: 'var(--ct-text-muted)' }}>
              +{farm.animals.length - 8}두 더 있음
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 서브 컴포넌트: 위험 농장 (건강 점수) ─────────

function FarmHealthScoreRow({
  farm, onFarmClick,
}: {
  readonly farm: { farmId: string; name: string; healthScore: number; grade: string; headCount: number; trend: string };
  readonly onFarmClick: (id: string) => void;
}): React.JSX.Element {
  const gradeInfo = riskGrade(farm.healthScore);
  return (
    <button
      type="button"
      onClick={() => onFarmClick(farm.farmId)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 8, border: 'none',
        background: gradeInfo.bg, cursor: 'pointer', textAlign: 'left',
        borderBottom: '1px solid var(--ct-border)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
    >
      {/* 건강 등급 */}
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: gradeInfo.color, color: '#fff',
        fontSize: 16, fontWeight: 900, flexShrink: 0,
      }}>
        {farm.grade}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>
          {farm.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
          <span>건강 {farm.healthScore}점</span>
          <span>{farm.headCount}두</span>
          <span style={{ color: farm.trend === 'improving' ? '#22c55e' : farm.trend === 'declining' ? '#ef4444' : '#64748b' }}>
            {farm.trend === 'improving' ? '↗ 호전' : farm.trend === 'declining' ? '↘ 악화' : '→ 유지'}
          </span>
        </div>
      </div>
      <span style={{ fontSize: 16, color: '#64748b', flexShrink: 0 }}>›</span>
    </button>
  );
}

// ── 서브 컴포넌트: 집단이상 경보 배너 ────────────

function ClusterAlertBanner({
  clusters,
}: {
  readonly clusters: readonly { farmName: string; animalCount: number; eventType: string; riskLevel: string }[];
}): React.JSX.Element | null {
  if (clusters.length === 0) return null;

  return (
    <div style={{
      borderRadius: 12, padding: '12px 16px',
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>🚨</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>
          집단 이상 감지 — {clusters.length}건
        </span>
      </div>
      {clusters.map((c, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 0', fontSize: 12, color: 'var(--ct-text)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: c.riskLevel === 'critical' ? '#ef4444' : '#f97316',
            flexShrink: 0,
          }} />
          <span style={{ fontWeight: 600 }}>{c.farmName}</span>
          <span style={{ color: 'var(--ct-text-muted)' }}>
            {EVENT_LABELS[c.eventType]?.label ?? c.eventType} {c.animalCount}두
          </span>
        </div>
      ))}
      <div style={{ marginTop: 6, fontSize: 11, color: '#ef4444', fontWeight: 500 }}>
        동일 농장 3두+ 동일 증상 → 전파성 질병 의심. 격리·역학조사 검토
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────

interface Props {
  readonly onAnimalClick?: (animalId: string) => void;
  readonly onFarmClick?: (farmId: string) => void;
}

export function VetDashboard({ onFarmClick }: Props): React.JSX.Element {
  const navigate = useNavigate();
  const selectedFarmIds = useFarmStore((s) => s.selectedFarmIds);
  const [stats, setStats] = useState<VetStats | null>(null);
  const [tab, setTab] = useState<'urgent' | 'farms' | 'route' | 'plans'>('urgent');
  const [loading, setLoading] = useState(true);

  const farmParam = selectedFarmIds.length > 0 ? `&farmIds=${selectedFarmIds.join(',')}` : '';

  // 기존 drilldown 데이터 (긴급 개체 + 농장별 그룹핑)
  const load = useCallback(() => {
    setLoading(true);
    const healthTypes = [
      'temperature_high', 'clinical_condition', 'health_general',
      'rumination_decrease', 'activity_decrease', 'drinking_decrease',
      'calving_detection', 'calving_confirmation',
    ];

    Promise.all(
      healthTypes.map((t) =>
        apiGet<{ items: readonly HealthAnimal[]; total: number }>(
          `/unified-dashboard/drilldown?eventType=${t}${farmParam}&limit=200`,
        ).catch(() => ({ items: [], total: 0 })),
      ),
    ).then((results) => {
      const allAnimals: HealthAnimal[] = [];
      for (const r of results) {
        allAnimals.push(...r.items);
      }

      const farmMap = new Map<string, FarmHealthSummary>();
      for (const a of allAnimals) {
        const ex = farmMap.get(a.farmId);
        const isCritical = CRITICAL_TYPES.has(a.eventType);
        const isWatch    = WATCH_TYPES.has(a.eventType);
        const isCalving  = CALVING_TYPES.has(a.eventType);

        if (ex) {
          farmMap.set(a.farmId, {
            ...ex,
            critical: ex.critical + (isCritical ? 1 : 0),
            watch:    ex.watch    + (isWatch    ? 1 : 0),
            calving:  ex.calving  + (isCalving  ? 1 : 0),
            animals:  [...ex.animals, a],
          });
        } else {
          farmMap.set(a.farmId, {
            farmId: a.farmId, farmName: a.farmName,
            critical: isCritical ? 1 : 0,
            watch:    isWatch    ? 1 : 0,
            calving:  isCalving  ? 1 : 0,
            animals:  [a],
          });
        }
      }

      const farms = [...farmMap.values()].sort((a, b) =>
        b.critical - a.critical || b.calving - a.calving || b.watch - a.watch,
      );

      const topAnimals = [...allAnimals]
        .sort((a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) ||
          new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
        )
        .slice(0, 15);

      setStats({
        criticalTotal: allAnimals.filter((a) => CRITICAL_TYPES.has(a.eventType)).length,
        watchTotal:    allAnimals.filter((a) => WATCH_TYPES.has(a.eventType)).length,
        calvingTotal:  allAnimals.filter((a) => CALVING_TYPES.has(a.eventType)).length,
        farms,
        topAnimals,
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [farmParam]);

  useEffect(() => { load(); }, [load]);

  // 추가 데이터: 농장 건강 점수 + 진료 동선 + 역학 감시
  const { data: healthScores } = useFarmHealthScores();
  const { data: vetRoute } = useVetRoute();
  // epidemic intelligence 데이터는 clusterAlerts 계산에서 추가적으로 활용 가능 (향후)
  useEpidemicIntelligence();

  // 집단이상 감지: 같은 농장 3두+ 동일 이벤트 타입
  const clusterAlerts = useMemo(() => {
    if (!stats) return [];
    const clusters: { farmName: string; animalCount: number; eventType: string; riskLevel: string }[] = [];
    for (const farm of stats.farms) {
      const typeCounts = new Map<string, number>();
      for (const a of farm.animals) {
        typeCounts.set(a.eventType, (typeCounts.get(a.eventType) ?? 0) + 1);
      }
      for (const [eventType, count] of typeCounts) {
        if (count >= 3 && CRITICAL_TYPES.has(eventType)) {
          clusters.push({
            farmName: farm.farmName,
            animalCount: count,
            eventType,
            riskLevel: count >= 5 ? 'critical' : 'high',
          });
        }
      }
    }
    return clusters;
  }, [stats]);

  // 위험 농장 수 (건강 점수 60 미만)
  const riskFarmCount = useMemo(() => {
    if (!healthScores) return 0;
    return healthScores.filter((f) => f.healthScore < 60).length;
  }, [healthScores]);

  if (loading || !stats) {
    return (
      <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--ct-text-muted)' }}>
        수의사 Command Center 로딩 중...
      </div>
    );
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 4px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600,
    background: active ? 'var(--ct-primary, #10b981)' : 'transparent',
    color: active ? '#fff' : 'var(--ct-text-muted)',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* 집단이상 경보 배너 */}
      <ClusterAlertBanner clusters={clusterAlerts} />

      {/* KPI 요약 */}
      <div style={{
        background: 'var(--ct-card)', border: '1px solid var(--ct-border)',
        borderRadius: 12, padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ct-text)', margin: 0 }}>
            🩺 Command Center
          </h3>
          <button type="button" onClick={load} style={{ fontSize: 11, color: 'var(--ct-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            새로고침
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: '즉시 진료', count: stats.criticalTotal, color: '#ef4444', icon: '🚨', desc: '고체온·임상이상' },
            { label: '주의 관찰', count: stats.watchTotal,    color: '#eab308', icon: '👁️', desc: '반추·활동저하' },
            { label: '분만 임박', count: stats.calvingTotal,  color: '#8b5cf6', icon: '🐄', desc: '분만 감지' },
            { label: '위험 농장', count: riskFarmCount,       color: '#f97316', icon: '🏥', desc: '건강점수 60↓' },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              textAlign: 'center', padding: '8px 4px', borderRadius: 8,
              background: kpi.count > 0 ? `${kpi.color}12` : 'var(--ct-bg)',
              border: `1px solid ${kpi.count > 0 ? `${kpi.color}30` : 'transparent'}`,
            }}>
              <div style={{ fontSize: 14, marginBottom: 2 }}>{kpi.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: kpi.count > 0 ? kpi.color : 'var(--ct-text-muted)' }}>
                {kpi.count}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: kpi.count > 0 ? kpi.color : 'var(--ct-text-muted)' }}>
                {kpi.label}
              </div>
              <div style={{ fontSize: 9, color: 'var(--ct-text-muted)', marginTop: 1 }}>{kpi.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 탭 — 4개 */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 10, padding: 4 }}>
        <button type="button" style={tabStyle(tab === 'urgent')} onClick={() => setTab('urgent')}>
          🚨 긴급({stats.topAnimals.length})
        </button>
        <button type="button" style={tabStyle(tab === 'farms')} onClick={() => setTab('farms')}>
          🏥 농장({healthScores?.length ?? stats.farms.length})
        </button>
        <button type="button" style={tabStyle(tab === 'route')} onClick={() => setTab('route')}>
          🗺️ 동선
        </button>
        <button type="button" style={tabStyle(tab === 'plans')} onClick={() => setTab('plans')}>
          📋 프로토콜
        </button>
      </div>

      {/* 탭 컨텐츠 */}
      <div style={{
        background: 'var(--ct-card)', border: '1px solid var(--ct-border)',
        borderRadius: 12, overflow: 'hidden',
      }}>

        {/* 긴급 개체 탭 */}
        {tab === 'urgent' && (
          <div>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--ct-border)', fontSize: 12, color: 'var(--ct-text-muted)' }}>
              심각도·시간 순 TOP {stats.topAnimals.length}두 — 클릭하면 개체 대시보드로 이동
            </div>
            {stats.topAnimals.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ct-text-muted)', fontSize: 13 }}>
                ✅ 현재 이상 개체가 없습니다
              </div>
            ) : (
              stats.topAnimals.map((a) => (
                <AnimalRow key={a.eventId} animal={a} onNavigate={(id) => navigate(`/cow/${id}`)} />
              ))
            )}
          </div>
        )}

        {/* 농장 건강 점수 탭 */}
        {tab === 'farms' && (
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--ct-border)', fontSize: 12, color: 'var(--ct-text-muted)' }}>
              건강 점수 기반 위험도 순 — 클릭하면 농장 대시보드로 이동
            </div>

            {/* 건강 점수 데이터 있으면 점수 기반 리스트 */}
            {healthScores && healthScores.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8 }}>
                {[...healthScores]
                  .sort((a, b) => a.healthScore - b.healthScore)
                  .map((farm) => (
                    <FarmHealthScoreRow
                      key={farm.farmId}
                      farm={farm}
                      onFarmClick={(fid) => onFarmClick?.(fid)}
                    />
                  ))}
              </div>
            ) : (
              /* 건강 점수 없으면 기존 이벤트 기반 농장 카드 */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10 }}>
                {stats.farms.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--ct-text-muted)', fontSize: 13 }}>
                    ✅ 이상 농장이 없습니다
                  </div>
                ) : (
                  stats.farms.map((farm) => (
                    <FarmCard
                      key={farm.farmId}
                      farm={farm}
                      onAnimalClick={(id) => navigate(`/cow/${id}`)}
                      onFarmClick={(fid) => onFarmClick?.(fid)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* 방문 동선 탭 */}
        {tab === 'route' && (
          <div style={{ padding: 12 }}>
            {vetRoute ? (
              <VetRouteWidget data={vetRoute} />
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ct-text-muted)', fontSize: 13 }}>
                방문 동선 데이터 로딩 중...
              </div>
            )}
          </div>
        )}

        {/* 수의학 프로토콜 탭 */}
        {tab === 'plans' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', padding: '0 4px 4px' }}>
              탭을 눌러 각 증상별 현장 프로토콜을 확인하세요
            </div>
            {Object.entries(ACTION_PLANS).map(([type]) => {
              const count =
                type === 'temperature_high' ? stats.criticalTotal :
                type === 'clinical_condition' ? 0 :
                type === 'rumination_decrease' ? stats.watchTotal :
                type === 'calving_detection' ? stats.calvingTotal : 0;
              return (
                <ActionPlanCard key={type} eventType={type} count={count} />
              );
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
        )}
      </div>

      {/* 전환기 위험우 카드 */}
      <div style={{
        background: 'var(--ct-card)', border: '1px solid var(--ct-border)',
        borderRadius: 12, padding: '14px 16px',
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>
          🤰 전환기 모니터링
        </h3>
        <TransitionRiskCard farmId={selectedFarmIds[0]} />
      </div>
    </div>
  );
}
