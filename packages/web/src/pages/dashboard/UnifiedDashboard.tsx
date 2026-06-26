// 통합 대시보드 — AI 강화 + 동적 차트 + 실시간 운영 (다크 테마)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useUnifiedDashboard,
  useLiveAlarms,
  useFarmRanking,
  useDashboardFarms,
  useAiBriefing,
  useAlertTrend,
  useHerdComposition,
  useTemperatureDistribution,
  useEventTimeline,
  useVitalMonitor,
  useFarmMapMarkers,
  useEpidemicIntelligence,
  useFarmHealthScores,
  useHealthAlertsSummary,
  useFertilityManagement,
  useSovereignAiStats,
  useSovereignAlarms,
  useBreedingPipeline,
} from '@web/hooks/useUnifiedDashboard';
import { useQueryClient } from '@tanstack/react-query';
import { useFarmStore } from '@web/stores/farm.store';
import { useAuthStore } from '@web/stores/auth.store';
import { useRoleSimulationStore } from '@web/stores/role-simulation.store';
import { useNotificationStore } from '@web/stores/notification.store';
import { useEffectiveRole } from '@web/hooks/useEffectiveRole';
import { deriveRecommendationCta, type RecommendationCta } from '@web/features/ai-recommendation/recommendation-cta';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { ErrorFallback } from '@web/components/common/ErrorFallback';
import { SectionErrorBoundary } from '@web/components/common/SectionErrorBoundary';
import {
  HerdOverviewCards,
  TodoListPanel,
  LiveAlarmFeed,
  FarmRankingWidget,
  HerdCompositionChart,
  AlertTrendChart,
  TemperatureScatter,
  EventTimelineChart,
  EpidemicCommandCenter,
  FarmHealthScoreWidget,
  HealthAlertsWidget,
  FertilityManagementWidget,
  RiskTop10Widget,
  SovereignAiWidget,
  AssistantAlertPanel,
  SovereignAlarmFeed,
  BreedingPipelineWidget,
} from '@web/components/unified-dashboard';
import { TodoDrilldownModal } from '@web/components/unified-dashboard/TodoDrilldownModal';
import { SensorChartModal } from '@web/components/unified-dashboard/SensorChartModal';
import { EpidemicAlertBanner } from '@web/components/epidemic/EpidemicAlertBanner';
import { EpidemicMapWidget } from '@web/components/epidemic/EpidemicMapWidget';
import { ClusterDetailModal } from '@web/components/epidemic/ClusterDetailModal';
import { VitalMonitorChart } from '@web/components/unified-dashboard/VitalMonitorChart';
import { FarmMapWidget, buildFarmMapMarkers } from '@web/components/unified-dashboard/FarmMapWidget';
import { FarmAnimalListPanel } from '@web/components/unified-dashboard/FarmAnimalListPanel';
import type { TodoItem } from '@cowtalk/shared';
import { useRoleDashboard } from '@web/hooks/useRoleDashboard';
import { useTinkerbellStore } from '@web/stores/tinkerbell.store';
import { VetDashboard } from '@web/components/unified-dashboard/VetDashboard';
import { QuarantineDashboard } from '@web/components/unified-dashboard/QuarantineDashboard';
import { GovAdminDashboard } from '@web/components/unified-dashboard/GovAdminDashboard';
import { InseminationPanel } from '@web/components/breeding/InseminationPanel';
import { FarmGroupSelector } from '@web/components/unified-dashboard/FarmGroupSelector';
import { useFarmGroupStore } from '@web/stores/farm-group.store';
import { useIsMobile } from '@web/hooks/useIsMobile';
import { useDxCompletion } from '@web/hooks/useDxCompletion';
import { useSocketAlarmSync } from '@web/hooks/useSocket';
import { ROLE_LABELS } from '@web/config/dashboard-widgets';
import type { Role } from '@cowtalk/shared';

// ── 역할 전환 (마스터용) ──

const ROLE_ICONS: Record<string, string> = {
  farmer: '🧑‍🌾',
  veterinarian: '🩺',
  government_admin: '🏛️',
  quarantine_officer: '🛡️',
};

// FLOW-02 Step2.5: 역할 전환 = role-simulation.store 신호 (휘발성).
// user.role(본 계정 역할)은 변경하지 않는다. 새로고침 시 시뮬레이션 해제 → master 뷰 복귀.
function RoleSwitcher(): React.JSX.Element | null {
  const userRole = useAuthStore((s) => s.user?.role);
  const simulatedRole = useRoleSimulationStore((s) => s.simulatedRole);
  const setSimulatedRole = useRoleSimulationStore((s) => s.setSimulatedRole);
  const [open, setOpen] = useState(false);

  // master 본질(government_admin)만 역할 전환 노출 (Header isMaster 정의와 일치)
  if (userRole !== 'government_admin') return null;

  const effectiveRole = simulatedRole ?? userRole;
  const roles = Object.entries(ROLE_LABELS) as [Role, string][];

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          background: 'var(--ct-primary)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {ROLE_ICONS[effectiveRole] ?? '👤'} 역할 전환 ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: '110%',
          right: 0,
          background: 'var(--ct-card)',
          border: '1px solid var(--ct-border)',
          borderRadius: 8,
          padding: 4,
          zIndex: 50,
          minWidth: 160,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {roles.map(([role, label]) => {
            const active = simulatedRole === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => {
                  // 시뮬레이션 역할 설정 (휘발성). user.role 은 불변.
                  // FLOW-01: 농장 컨텍스트는 farm.store 구독자가 페르소나별 자동 처리
                  // (farmer/vet → 첫 농장 / 그 외 → 전체). 여기서 clearSelection 을
                  // 호출하면 구독자가 방금 선택한 농장을 즉시 덮어쓰므로 호출하지 않는다.
                  setSimulatedRole(role);
                  useFarmGroupStore.getState().clearSelection();
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: active ? 700 : 400,
                  background: active ? 'var(--ct-primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--ct-text)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span>{ROLE_ICONS[role] ?? '👤'}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Farm filter dropdown ──

function FarmFilterDropdown(): React.JSX.Element {
  const { data: farmsData } = useDashboardFarms();
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const selectedFarmIds = useFarmStore((s) => s.selectedFarmIds);
  const selectFarm = useFarmStore((s) => s.selectFarm);
  const clearSelection = useFarmStore((s) => s.clearSelection);
  const setFarms = useFarmStore((s) => s.setFarms);
  const clearGroupSelection = useFarmGroupStore((s) => s.clearSelection);
  const allFarms = farmsData?.farms ?? [];
  const totalCount = farmsData?.total ?? 0;

  // FLOW-01: 농장 목록(React Query)을 farm.store 로 동기화.
  // → 페르소나 시뮬레이션 시 farm.store 가 첫 농장을 자동 선택할 수 있게 한다.
  useEffect(() => {
    if (farmsData?.farms) {
      setFarms(farmsData.farms.map((f) => ({ farmId: f.farmId, name: f.name })));
    }
  }, [farmsData, setFarms]);

  // 전체 농장 표시 (드롭다운에서 개별 농장 클릭 → 해당 농장 대시보드)
  const farmList = allFarms;
  const displayCount = totalCount;

  // 그룹 선택 중이면 드롭다운 레이블 변경
  const groupLabel = selectedFarmIds.length > 0 ? `그룹 (${selectedFarmIds.length}개)` : null;

  return (
    <select
      value={groupLabel ? '__group__' : (selectedFarmId ?? '')}
      onChange={(e) => {
        clearGroupSelection();
        if (e.target.value === '' || e.target.value === '__group__') { clearSelection(); } else { selectFarm(e.target.value); }
      }}
      style={{
        background: 'var(--ct-card)',
        color: 'var(--ct-text)',
        border: '1px solid var(--ct-border)',
        borderRadius: 10,
        padding: '8px 14px',
        fontSize: 13,
        cursor: 'pointer',
        minWidth: 0,
        width: '100%',
        outline: 'none',
        transition: 'border-color 0.2s',
      }}
    >
      <option value="">{`전체 (${String(displayCount)}개 농장)`}</option>
      {groupLabel && <option value="__group__">{`📋 ${groupLabel}`}</option>}
      {farmList.map((f) => (
        <option key={f.farmId} value={f.farmId}>{f.name} ({f.currentHeadCount}두)</option>
      ))}
    </select>
  );
}

// ── AI Briefing Card ──

function AiBriefingCard({ onKpiClick }: {
  readonly onKpiClick?: (filter: { eventType: string; label: string }) => void;
}): React.JSX.Element {
  const { data: briefing, isLoading } = useAiBriefing();
  // FLOW-07: AI 추천 CTA — 패턴 매칭으로 도출, 클릭 시 액션.
  const navigate = useNavigate();
  const farms = useFarmStore((s) => s.farms);
  const selectFarm = useFarmStore((s) => s.selectFarm);
  const currentFarmId = useFarmStore((s) => s.selectedFarmId);
  const effectiveRole = useEffectiveRole() ?? 'government_admin';
  const toggleNotificationDrawer = useNotificationStore((s) => s.toggleDrawer);

  function runRecommendationCta(cta: RecommendationCta): void {
    switch (cta.kind) {
      case 'route':
        navigate(cta.target);
        break;
      case 'farm-select':
        // D21: URL 변경 없이 farm.store 만 갱신.
        selectFarm(cta.farmId);
        break;
      case 'severity-filter':
        // /alerts 라우트 부재 → 대시보드 severity drilldown 재사용.
        onKpiClick?.({
          eventType: cta.severity === 'critical' ? 'SEVERITY_CRITICAL' : 'SEVERITY_HIGH',
          label: cta.label,
        });
        break;
      case 'open-notifications':
        toggleNotificationDrawer();
        break;
    }
  }

  if (isLoading || !briefing) {
    return (
      <div className="ct-fade-up" style={briefingCardBase}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <BriefingIcon />
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ct-text)' }}>AI 일일 브리핑</span>
          <ClaudeBadge />
        </div>
        <div className="ct-shimmer" style={{ height: 16, borderRadius: 6, width: '60%' }} />
        <div className="ct-shimmer" style={{ height: 16, borderRadius: 6, width: '40%', marginTop: 8 }} />
      </div>
    );
  }

  return (
    <div className="ct-fade-up" style={{ ...briefingCardBase, borderLeft: '3px solid var(--ct-primary)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BriefingIcon />
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ct-text)' }}>AI 일일 브리핑</span>
          <ClaudeBadge />
        </div>
        <span style={{ fontSize: 11, color: 'var(--ct-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {new Date(briefing.generatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Summary text */}
      <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--ct-text)', margin: '0 0 16px', letterSpacing: '-0.1px' }}>
        {briefing.summary}
      </p>

      {/* Stats row */}
      <div style={{
        display: 'flex',
        gap: 2,
        marginBottom: 16,
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 12,
        padding: '12px 8px',
      }}>
        {briefing.roleKpis?.map((kpi, idx) => (
          <React.Fragment key={kpi.label}>
            {idx > 0 && <StatDivider />}
            <StatChip
              label={kpi.label}
              value={kpi.value}
              color={kpi.color}
              onClick={kpi.drilldownType && onKpiClick ? () => onKpiClick({ eventType: kpi.drilldownType!, label: kpi.label }) : undefined}
            />
          </React.Fragment>
        )) ?? (
          <>
            <StatChip label="오늘 알림" value={briefing.alertStats.total24h} onClick={onKpiClick ? () => onKpiClick({ eventType: 'ALL', label: '오늘 전체 알림' }) : undefined} />
            <StatDivider />
            <StatChip label="전일 대비" value={`${briefing.trendComparison.changePercent > 0 ? '+' : ''}${briefing.trendComparison.changePercent}%`} color={briefing.trendComparison.direction === 'up' ? 'var(--ct-danger)' : 'var(--ct-primary)'} />
            <StatDivider />
            <StatChip label="심각" value={briefing.alertStats.critical} color="var(--ct-danger)" onClick={onKpiClick ? () => onKpiClick({ eventType: 'SEVERITY_CRITICAL', label: '심각' }) : undefined} />
            <StatDivider />
            <StatChip label="높음" value={briefing.alertStats.high} color="#f97316" onClick={onKpiClick ? () => onKpiClick({ eventType: 'SEVERITY_HIGH', label: '높음' }) : undefined} />
          </>
        )}
      </div>

      {/* Recommendations */}
      {(briefing.recommendations ?? []).length > 0 && (
        <div style={{ borderTop: '1px solid var(--ct-border)', paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ct-primary)', marginBottom: 8, letterSpacing: '0.5px' }}>
            AI 추천
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(briefing.recommendations ?? []).slice(0, 3).map((rec, i) => {
              // FLOW-07: 추천 문구 → CTA 도출. null 이면 기존 평문 유지.
              const cta = deriveRecommendationCta(rec, {
                role: effectiveRole,
                farms,
                currentFarmId: currentFarmId ?? undefined,
              });
              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 8,
                }}>
                  <div style={{
                    fontSize: 12,
                    color: 'var(--ct-text-secondary)',
                    paddingLeft: 16,
                    position: 'relative',
                    lineHeight: 1.6,
                    flex: 1,
                    minWidth: 0,
                  }}>
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      top: 1,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--ct-primary)',
                      opacity: 0.6,
                      marginTop: 5,
                    }} />
                    {rec}
                  </div>
                  {cta && (
                    <button
                      type="button"
                      onClick={() => runRecommendationCta(cta)}
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--ct-primary)',
                        background: 'transparent',
                        color: 'var(--ct-primary)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cta.label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function BriefingIcon(): React.JSX.Element {
  return (
    <div style={{
      width: 28,
      height: 28,
      borderRadius: 8,
      background: 'linear-gradient(135deg, var(--ct-primary), #0e9f6e)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 14,
      flexShrink: 0,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a8 8 0 0 1 8 8c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 8-8z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    </div>
  );
}

function ClaudeBadge(): React.JSX.Element {
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      padding: '3px 8px',
      borderRadius: 6,
      background: 'linear-gradient(135deg, rgba(0,214,126,0.15), rgba(0,214,126,0.05))',
      color: 'var(--ct-primary)',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      border: '1px solid rgba(0,214,126,0.2)',
    }}>
      Claude
    </span>
  );
}

function StatChip({ label, value, color, onClick }: {
  readonly label: string;
  readonly value: string | number;
  readonly color?: string;
  readonly onClick?: () => void;
}): React.JSX.Element {
  const isClickable = Boolean(onClick);
  return (
    <button
      type="button"
      disabled={!isClickable}
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: 'center',
        background: 'none',
        border: 'none',
        padding: '4px 2px',
        borderRadius: 8,
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (isClickable) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
    >
      <div style={{
        fontSize: 20,
        fontWeight: 800,
        color: color ?? 'var(--ct-primary)',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.5px',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 2 }}>
        {label}
        {isClickable && <span style={{ marginLeft: 2, fontSize: 8, opacity: 0.6 }}>{'>'}</span>}
      </div>
    </button>
  );
}

function StatDivider(): React.JSX.Element {
  return <div style={{ width: 1, background: 'var(--ct-border)', margin: '4px 0' }} />;
}

// ── Chart Card wrapper ──

function ChartCard({ title, icon, children, minHeight = 320, delay = 0 }: {
  readonly title: string;
  readonly icon: string;
  readonly children: React.ReactNode;
  readonly minHeight?: number;
  readonly delay?: number;
}): React.JSX.Element {
  return (
    <div
      className="ct-chart-card ct-fade-up"
      style={{
        background: 'var(--ct-card)',
        borderRadius: 14,
        padding: '18px 16px 12px',
        border: '1px solid var(--ct-border)',
        minHeight,
        animationDelay: `${delay}ms`,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
        paddingBottom: 10,
        borderBottom: '1px solid var(--ct-border)',
      }}>
        <span style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          background: 'rgba(255,255,255,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
        }}>
          {icon}
        </span>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ct-text)' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Section Label ──

function SectionLabel({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <h2 className="ct-section-label">{children}</h2>;
}

// ── Styles ──

const briefingCardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--ct-card) 0%, rgba(0,214,126,0.03) 100%)',
  borderRadius: 14,
  padding: 20,
  borderTop: '1px solid var(--ct-border)',
  borderRight: '1px solid var(--ct-border)',
  borderBottom: '1px solid var(--ct-border)',
  borderLeft: '1px solid var(--ct-border)',
};

// ── Mapping constants ──

const EMPTY_HERD = { totalAnimals: 0, sensorAttached: 0, activeAlerts: 0, healthIssues: 0 } as const;

// ── 상황 요약 히어로 — 행정관이 3초 안에 "안정/주의/위험" 파악 ──
function SituationSummaryStrip({ herd, farmCount, updatedAt, onChipClick }: {
  herd: { totalAnimals: number; sensorAttached: number; activeAlerts: number; healthIssues: number };
  farmCount: number;
  updatedAt: string;
  onChipClick?: (kind: 'alerts' | 'health') => void;
}): React.JSX.Element {
  const level = herd.healthIssues >= 3 || herd.activeAlerts >= 5
    ? 'critical'
    : herd.activeAlerts > 0 || herd.healthIssues > 0
      ? 'warn'
      : 'stable';
  const T = {
    critical: { c: '#ef4444', label: '위험', msg: '긴급 조치가 필요한 신호가 있습니다' },
    warn: { c: '#f59e0b', label: '주의', msg: '확인이 필요한 알림이 있습니다' },
    stable: { c: '#22c55e', label: '안정', msg: '전 농장 안정 — 위험 신호 없음' },
  }[level];
  const sensorPct = herd.totalAnimals > 0 ? Math.round((herd.sensorAttached / herd.totalAnimals) * 100) : 0;

  const Chip = ({ label, value, accent, onClick }: { label: string; value: string; accent?: string; onClick?: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${label} ${value}`}
      style={{
        display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 14px',
        background: 'var(--ct-surface-2, rgba(255,255,255,0.03))', border: '1px solid var(--ct-border)',
        borderRadius: 10, cursor: onClick ? 'pointer' : 'default', textAlign: 'left', minWidth: 84,
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--ct-text-muted)', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: accent ?? 'var(--ct-text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</span>
    </button>
  );

  return (
    <div
      className="ct-fade-up"
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14,
        padding: '14px 18px', borderRadius: 14,
        background: `linear-gradient(90deg, ${T.c}1a, transparent 60%)`,
        border: '1px solid var(--ct-border)', borderLeft: `4px solid ${T.c}`,
        boxShadow: level === 'critical' ? `0 0 0 1px ${T.c}33, 0 6px 24px ${T.c}22` : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto' }}>
        <span aria-hidden style={{ width: 12, height: 12, borderRadius: '50%', background: T.c, boxShadow: `0 0 12px ${T.c}`, flex: '0 0 auto' }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: T.c, letterSpacing: '-0.3px' }}>{T.label}</span>
            <span style={{ fontSize: 13, color: 'var(--ct-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{T.msg}</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>관리 {farmCount}개 농장 · {herd.totalAnimals.toLocaleString()}두 · 센서 {sensorPct}% 가동 · {updatedAt} 기준</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
        <Chip label="활성 알림" value={`${herd.activeAlerts}건`} accent={herd.activeAlerts > 0 ? '#f59e0b' : undefined} onClick={onChipClick ? () => onChipClick('alerts') : undefined} />
        <Chip label="건강 이상" value={`${herd.healthIssues}두`} accent={herd.healthIssues > 0 ? '#ef4444' : undefined} onClick={onChipClick ? () => onChipClick('health') : undefined} />
        <Chip label="센서 가동" value={`${herd.sensorAttached}/${herd.totalAnimals}`} />
      </div>
    </div>
  );
}

const TODO_MAP: Record<string, string> = {
  fertility: 'estrus', health: 'temperature_high', feeding: 'rumination_decrease', system: 'ALL',
};

const KPI_MAP: Record<string, string> = {
  total: 'ALL', alerts: 'ALL', health: 'HEALTH_ALL', sensor: 'ALL',
};

const LOADING_PLACEHOLDER = (
  <div style={{ color: 'var(--ct-text-muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>
    <div className="ct-shimmer" style={{ height: 120, borderRadius: 8 }} />
  </div>
);

// ── Main Dashboard ──

export default function UnifiedDashboard(): React.JSX.Element {
  // WebSocket → React Query 알람 캐시 동기화
  useSocketAlarmSync();
  const navigate = useNavigate();

  // Phase 3 — 로그인 직후 첫 페인트를 빠르게: 크리티컬 3개만 즉시, 나머지는 800ms 뒤 지연 로드
  // 크리티컬: useUnifiedDashboard, useLiveAlarms, useDashboardFarms (메인 KPI/알람/농장목록)
  // 그 외 16개 차트/지도/분석 쿼리는 첫 렌더 이후 순차 로드 → 초기 API 부하 5배 감소
  const [deferredReady, setDeferredReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDeferredReady(true), 800);
    return () => clearTimeout(t);
  }, []);
  const deferOpt = useMemo(() => ({ enabled: deferredReady }), [deferredReady]);

  const { data, isLoading, error, refetch } = useUnifiedDashboard();
  const { data: alarmsData } = useLiveAlarms();
  const { data: farmsData } = useDashboardFarms();
  const { data: rankingData } = useFarmRanking(deferOpt);
  const { data: alertTrendData } = useAlertTrend(14, deferOpt);
  const { data: herdCompData } = useHerdComposition(deferOpt);
  const { data: tempDistData } = useTemperatureDistribution(deferOpt);
  const { data: timelineData } = useEventTimeline(24, deferOpt);
  const { data: vitalData } = useVitalMonitor(30, deferOpt);
  const { data: mapData } = useFarmMapMarkers(deferOpt);
  const { data: epidemicData } = useEpidemicIntelligence(deferOpt);
  const { data: healthScoresData } = useFarmHealthScores(deferOpt);
  const { data: healthAlertsData } = useHealthAlertsSummary(deferOpt);
  const { data: fertilityMgmtData } = useFertilityManagement(deferOpt);
  const { data: sovereignStats } = useSovereignAiStats(deferOpt);
  const user = useAuthStore((s) => s.user);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const { data: sovereignAlarmData, isLoading: sovereignLoading } = useSovereignAlarms(selectedFarmId, deferOpt);
  const { data: breedingPipelineData } = useBreedingPipeline(deferOpt);
  const queryClient = useQueryClient();
  const handleSovereignLabelChange = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['sovereign-alarms', selectedFarmId] });
  }, [queryClient, selectedFarmId]);
  const selectFarm = useFarmStore((s) => s.selectFarm);
  const { isVisible, roleLabel } = useRoleDashboard();
  const isMobile = useIsMobile();
  const { completedTodos } = useDxCompletion();

  const selectedFarmIds = useFarmStore((s) => s.selectedFarmIds);

  // 목장 선택 시 인라인 패널(FarmAnimalListPanel)이 selectedFarmId로 자동 표시됨

  // 로그인 시 전체 목장 모드로 시작 (개별 농장 클릭 시 해당 농장 대시보드로 전환)
  // user.farmIds가 1개인 경우에만 해당 농장 자동 선택
  useEffect(() => {
    if (!user?.farmIds || user.farmIds.length === 0) return;
    if (selectedFarmIds.length > 0 || selectedFarmId) return; // 이미 선택됨

    if (user.farmIds.length === 1) {
      selectFarm(user.farmIds[0]!);
    }
    // farmIds가 2개 이상이면 전체 모드 유지 (clearSelection 상태)
  }, [user?.farmIds, selectedFarmIds.length, selectedFarmId, selectFarm]);

  const [drilldown, setDrilldown] = useState<{ eventType: string; label: string } | null>(null);
  const [sensorChartAnimalId, setSensorChartAnimalId] = useState<string | null>(null);
  const [epidemicClusterId, setEpidemicClusterId] = useState<string | null>(null);
  const [inseminationAnimalId, setInseminationAnimalId] = useState<string | null>(null);
  // 팅커벨은 AppShell에 글로벌 인스턴스 1개. 페이지에서는 store에 trigger·context set만.
  const setTinkerbellTrigger = useTinkerbellStore((s) => s.setTrigger);
  const setTinkerbellDashboardContext = useTinkerbellStore((s) => s.setDashboardContext);

  const handleTodoClick = (item: TodoItem): void => {
    // eventType이 있으면 직접 사용 (정확한 드릴다운), 없으면 카테고리 매핑 (fallback)
    const eventType = item.eventType ?? TODO_MAP[item.category] ?? item.category;
    setDrilldown({ eventType, label: item.label });
  };

  const handleKpiClick = (cat: string): void => {
    const labels: Record<string, string> = { total: '전체 동물 현황', alerts: '금일 알림 상세', health: '건강 이상 상세', sensor: '센서 장착 현황' };
    setDrilldown({ eventType: KPI_MAP[cat] ?? 'ALL', label: labels[cat] ?? cat });
  };

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    return () => {
      if (prev) {
        root.setAttribute('data-theme', prev);
      } else {
        root.removeAttribute('data-theme');
      }
    };
  }, []);

  // 역할별 알람 필터
  const ROLE_ALARM_FILTER: Record<string, readonly string[]> = {
    veterinarian: ['temperature_high', 'clinical_condition', 'health_general', 'rumination_decrease', 'activity_decrease', 'temperature_low', 'calving_detection', 'calving_confirmation'],
    quarantine_officer: ['temperature_high', 'clinical_condition', 'health_general', 'temperature_low'],
  };
  const roleAlarmFilter = user?.role ? ROLE_ALARM_FILTER[user.role] : undefined;
  const allAlarms = alarmsData?.alarms ?? [];
  const alarms = roleAlarmFilter ? allAlarms.filter((a) => roleAlarmFilter.includes(a.eventType)) : allAlarms;
  const rankings = rankingData?.rankings ?? [];

  // 데이터 변할 때마다 글로벌 팅커벨 store에 dashboardContext 동기화
  useEffect(() => {
    if (data) {
      setTinkerbellDashboardContext({
        totalAlarms: alarms.length,
        criticalCount: alarms.filter((a) => a.severity === 'critical').length,
        healthIssues: data.herdOverview?.healthIssues ?? 0,
        farmCount: data.totalFarms ?? 146,
        animalCount: data.herdOverview?.totalAnimals ?? 7143,
      });
    }
    return () => setTinkerbellDashboardContext(undefined);
  }, [data, alarms, setTinkerbellDashboardContext]);

  // 농장 지도 마커 데이터 변환
  const allFarmMapMarkers = React.useMemo(
    () => buildFarmMapMarkers(mapData?.markers ?? [], alarms),
    [mapData?.markers, alarms],
  );

  // 농장/그룹 선택 시 해당 마커만 필터링
  const farmMapMarkers = React.useMemo(() => {
    if (selectedFarmIds.length > 0) return allFarmMapMarkers.filter((m) => selectedFarmIds.includes(m.farmId));
    if (selectedFarmId) return allFarmMapMarkers.filter((m) => m.farmId === selectedFarmId);
    return allFarmMapMarkers;
  }, [allFarmMapMarkers, selectedFarmId, selectedFarmIds]);

  // DX 완료율 계산
  const todoItems = data?.todoList ?? [];
  const dxCompletion = useMemo(() => {
    const total = todoItems.length;
    const completed = todoItems.filter(
      (item) => completedTodos.has(`${item.category}-${item.label}`),
    ).length;
    return { completed, total };
  }, [todoItems, completedTodos]);

  if (error) {
    return (
      <div data-theme="dark" style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)', minHeight: '100vh', padding: 24 }}>
        <ErrorFallback error={error as Error} onRetry={() => { refetch(); }} />
      </div>
    );
  }

  const lastUpdated = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '--';

  return (
    <div style={{
      background: 'var(--ct-bg)',
      color: 'var(--ct-text)',
      minHeight: '100vh',
      padding: isMobile ? '12px 10px 80px' : '16px 20px 32px',
      maxWidth: isMobile ? '100vw' : 1280,
      margin: '0 auto',
      overflowX: 'hidden',
      boxSizing: 'border-box',
    }}>
      {/* ── Header ── */}
      <header style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: isMobile ? 8 : 0,
        marginBottom: isMobile ? 10 : 16,
        paddingBottom: isMobile ? 8 : 12,
        borderBottom: '1px solid var(--ct-border)',
      }}>
        {isMobile ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
              <h1 style={{
                fontSize: 16,
                fontWeight: 800,
                background: 'linear-gradient(135deg, var(--ct-text), var(--ct-primary))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                margin: 0,
                flex: '0 0 auto',
                whiteSpace: 'nowrap',
              }}>
                CowTalk
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: '1 1 auto', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 11, color: 'var(--ct-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{user?.name ?? ''} ({roleLabel})</span>
                <RoleSwitcher />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0, overflow: 'hidden' }}>
              <FarmFilterDropdown />
              <FarmGroupSelector />
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 0' }}>
              <FarmFilterDropdown />
              <FarmGroupSelector />
            </div>
            <div style={{ textAlign: 'center', flex: '0 0 auto', padding: '0 16px' }}>
              <h1 style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: '-0.3px',
                whiteSpace: 'nowrap',
                margin: 0,
                background: 'linear-gradient(135deg, var(--ct-text), var(--ct-primary))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                CowTalk 통합 대시보드
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, fontSize: 12, minWidth: 0, flex: '1 1 0' }}>
              <span style={{ color: 'var(--ct-text-secondary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name ?? ''} ({roleLabel})</span>
              <RoleSwitcher />
              <span style={{ color: 'var(--ct-text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{lastUpdated}</span>
            </div>
          </>
        )}
      </header>

      {isLoading ? (
        <div style={{ padding: 24 }}><LoadingSkeleton lines={8} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 14 }}>
          {/* ── 상황 요약 히어로 (3초 파악) ── */}
          <SectionErrorBoundary label="상황 요약">
            <SituationSummaryStrip
              herd={data?.herdOverview ?? EMPTY_HERD}
              farmCount={farmsData?.farms?.length ?? 0}
              updatedAt={lastUpdated}
              onChipClick={(kind) => setDrilldown(kind === 'health'
                ? { eventType: 'health_warning', label: '건강 이상' }
                : { eventType: 'ALL', label: '활성 알림' })}
            />
          </SectionErrorBoundary>

          {/* ── 전염병 배너 ── */}
          <SectionErrorBoundary label="전염병 배너">
            <EpidemicAlertBanner onDetailClick={() => setEpidemicClusterId('__dashboard__')} />
          </SectionErrorBoundary>

          {/* ── AI 브리핑 ── */}
          <SectionErrorBoundary label="AI 일일 브리핑">
            <AiBriefingCard onKpiClick={(filter) => setDrilldown(filter)} />
          </SectionErrorBoundary>

          {/* ── KPI 카드 ── */}
          <SectionErrorBoundary label="KPI 카드">
            <HerdOverviewCards data={data?.herdOverview ?? EMPTY_HERD} onCardClick={handleKpiClick} dxCompletion={dxCompletion} role={user?.role} />
          </SectionErrorBoundary>

          {/* ── 농장 지도 (최상단 — 전국 현황 한눈에) ── */}
          {isVisible('farm_map') && (
          <SectionErrorBoundary label="농장 분포 지도">
            <FarmMapWidget
              markers={farmMapMarkers}
              selectedFarmId={selectedFarmId}
              onFarmClick={(fid) => selectFarm(fid)}
              totalHeadOverride={data?.herdOverview?.totalAnimals}
              height={isMobile ? 240 : 340}
            />
          </SectionErrorBoundary>
          )}

          {/* ── 선택 농장 개체 목록 (인라인) ── */}
          {selectedFarmId && (() => {
            const farm = (farmsData?.farms ?? []).find((f) => f.farmId === selectedFarmId);
            const farmName = farm?.name ?? '선택한 농장';
            const farmHead = farm?.currentHeadCount ?? null;
            return (
              <SectionErrorBoundary label="농장 개체 목록">
                <FarmAnimalListPanel
                  farmId={selectedFarmId}
                  farmName={farmName}
                  farmHeadCount={farmHead}
                />
              </SectionErrorBoundary>
            );
          })()}

          {/* ── 오늘 할 일 + 실시간 알람 (핵심 운영 패널) ── */}
          {(isVisible('todo_list') || isVisible('live_alarm_feed')) && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 10 : 12, alignItems: 'start' }}>
            {isVisible('todo_list') && (
              <SectionErrorBoundary label="오늘 할 일">
                <TodoListPanel items={data?.todoList ?? []} onItemClick={handleTodoClick} />
              </SectionErrorBoundary>
            )}
            {isVisible('live_alarm_feed') && (
              <SectionErrorBoundary label="실시간 알람">
                <LiveAlarmFeed alarms={alarms} onFarmClick={(fid) => selectFarm(fid)} onAnimalClick={(aid) => navigate(`/animals/${aid}`)} />
              </SectionErrorBoundary>
            )}
          </div>
          )}

          {isVisible('live_alarm_feed') && selectedFarmId && (
            <div style={{
              background: 'var(--ct-card)',
              borderRadius: 14,
              border: '1px solid var(--ct-border)',
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 16 }}>🧚</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ct-text)' }}>소버린 AI 알람</span>
                <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>CowTalk 독자 수의학 분석</span>
                {sovereignAlarmData?.alarms.length ? (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#f97316', fontWeight: 700 }}>
                    {sovereignAlarmData.alarms.length}건 감지
                  </span>
                ) : null}
              </div>
              <SectionErrorBoundary label="소버린 AI 알람">
                <SovereignAlarmFeed
                  alarms={sovereignAlarmData?.alarms ?? []}
                  isLoading={sovereignLoading}
                  farmId={selectedFarmId}
                  onLabelChange={handleSovereignLabelChange}
                />
              </SectionErrorBoundary>
            </div>
          )}

          {/* ── 수의사 전용 대시보드 ── */}
          {user?.role === 'veterinarian' && (
            <SectionErrorBoundary label="수의사 대시보드">
              <VetDashboard onFarmClick={(fid) => selectFarm(fid)} />
            </SectionErrorBoundary>
          )}

          {/* ── 정부 행정관 전용 대시보드 ── */}
          {user?.role === 'government_admin' && (
            <SectionErrorBoundary label="행정관 대시보드">
              <GovAdminDashboard onFarmClick={(fid) => selectFarm(fid)} />
            </SectionErrorBoundary>
          )}

          {/* ── 번식성적 커맨드센터 ── */}
          {isVisible('breeding_pipeline') && breedingPipelineData && (
            <SectionErrorBoundary label="번식 파이프라인">
              <BreedingPipelineWidget data={breedingPipelineData} />
            </SectionErrorBoundary>
          )}

          {/* ── 건강 알림 + 번식 관리 ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 10 : 12, alignItems: 'start' }}>
            {healthAlertsData && (
              <SectionErrorBoundary label="건강 알림">
                <HealthAlertsWidget
                  items={healthAlertsData}
                  onCategoryClick={(cat) => setDrilldown({ eventType: cat, label: `건강 알림: ${cat}` })}
                />
              </SectionErrorBoundary>
            )}
            <SectionErrorBoundary label="번식 관리">
              <FertilityManagementWidget
                data={fertilityMgmtData ?? null}
                onAlertClick={(type) => setDrilldown({ eventType: type, label: `번식: ${type}` })}
              />
            </SectionErrorBoundary>
          </div>

          {/* ── AI 예측 위험 TOP 10 ── */}
          <SectionErrorBoundary label="AI 예측 위험 TOP 10">
            <RiskTop10Widget
              farmId={selectedFarmId}
              onAnimalClick={(aid) => navigate(`/animals/${aid}`)}
            />
          </SectionErrorBoundary>

          {/* ── 소버린 AI 어시스턴트 — 지식 강화 루프 ── */}
          <>
          <SectionLabel>AI 어시스턴트</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : ((data?.assistantAlerts && data.assistantAlerts.length > 0) ? '1fr 1fr' : '1fr'), gap: isMobile ? 10 : 12, alignItems: 'start' }}>
            {data?.assistantAlerts && data.assistantAlerts.length > 0 && (
              <AssistantAlertPanel
                alerts={data.assistantAlerts}
                onAlertClick={(alert) => setDrilldown({ eventType: alert.type, label: alert.label })}
              />
            )}
            {sovereignStats ? (
              <SovereignAiWidget
                stats={sovereignStats}
                onOpenLabelChat={() => setTinkerbellTrigger('소버린AI 지식 강화를 시작합니다')}
              />
            ) : (
              <div style={{
                background: 'var(--ct-card)',
                borderRadius: 14,
                border: '1px solid var(--ct-border)',
                padding: '32px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ct-text-muted)',
                fontSize: 13,
                gap: 8,
              }}>
                <span>🌏</span>
                <span>Sovereign AI 데이터 로딩 중...</span>
              </div>
            )}
          </div>
          </>

          {/* ── 방역관 전용 대시보드 ── */}
          {user?.role === 'quarantine_officer' && (
            <QuarantineDashboard onFarmClick={(fid) => selectFarm(fid)} />
          )}

          {/* ── 역학 감시 ── */}
          {(isVisible('epidemic_command_center') || isVisible('farm_health_score')) && (<>
          <SectionLabel>방역 인텔리전스</SectionLabel>
          {isVisible('epidemic_command_center') && epidemicData && <EpidemicCommandCenter data={epidemicData} onAnimalClick={(aid) => navigate(`/animals/${aid}`)} />}
          {isVisible('farm_health_score') && healthScoresData && healthScoresData.length > 0 && (
            <FarmHealthScoreWidget scores={healthScoresData} onFarmClick={(fid) => selectFarm(fid)} />
          )}
          </>)}

          {/* ── 분석 차트 ── */}
          {/* 알림 트렌드: 전체 뷰에서도 의미 있음 (전국 발생 추이) */}
          {isVisible('alert_trend_chart') && (<>
          <SectionLabel>분석 차트</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: isMobile ? 10 : 12 }}>
            {isVisible('alert_trend_chart') && (
            <ChartCard title="알림 트렌드 (14일)" icon="📊" delay={100}>
              {alertTrendData && alertTrendData.length > 0
                ? <AlertTrendChart
                    data={[...alertTrendData]}
                    height={240}
                    onBarClick={(date) => setDrilldown({ eventType: `DATE_${date}`, label: `${date} 알림 상세` })}
                  />
                : LOADING_PLACEHOLDER
              }
            </ChartCard>
            )}

            {/* 축군 구성: 개별 농장에서만 의미 있음 */}
            {selectedFarmId && isVisible('herd_composition_chart') && (
            <ChartCard title="축군 구성" icon="🐄" delay={50}>
              {herdCompData && herdCompData.length > 0
                ? <HerdCompositionChart data={[...herdCompData]} height={240} />
                : LOADING_PLACEHOLDER
              }
            </ChartCard>
            )}

          </div>
          </>)}

          {/* ── 센서 분석 (개별 농장 선택 시에만 표시) ── */}
          {/* 수의역학 원칙: 전체 농장의 체온/반추 평균은 역학적 의미 없음 */}
          {/* 전체 뷰 = 농장 간 비교(방역 지휘센터), 개별 뷰 = 개체 간 비교(센서 분석) */}
          {selectedFarmId && (isVisible('vital_monitor_chart') || isVisible('temperature_scatter') || isVisible('event_timeline_chart')) && (<>
          <SectionLabel>센서 분석 — {selectedFarmId ? '농장 내 개체 모니터링' : ''}</SectionLabel>

          {isVisible('vital_monitor_chart') && vitalData && (
            <VitalMonitorChart
              data={vitalData}
              onAnimalClick={(aid) => navigate(`/animals/${aid}`)}
            />
          )}

          {(isVisible('temperature_scatter') || isVisible('event_timeline_chart')) && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (isVisible('temperature_scatter') && isVisible('event_timeline_chart') ? '1fr 1fr' : '1fr'), gap: isMobile ? 10 : 12 }}>
            {isVisible('temperature_scatter') && (
            <ChartCard title="위내센서 체온 (24시간)" icon="🌡️" delay={200}>
              {tempDistData && tempDistData.timeline && tempDistData.timeline.length > 0
                ? <TemperatureScatter data={tempDistData} height={260} />
                : LOADING_PLACEHOLDER
              }
            </ChartCard>
            )}

            {isVisible('event_timeline_chart') && (
            <ChartCard title="24시간 이벤트 타임라인" icon="⏰" delay={250}>
              {timelineData && timelineData.length > 0
                ? <EventTimelineChart events={[...timelineData]} height={260} />
                : LOADING_PLACEHOLDER
              }
            </ChartCard>
            )}
          </div>
          )}
          </>)}

          {/* 농장 지도는 KPI 카드 바로 아래로 이동됨 */}

          {/* ── 농장 순위 + 역학 지도 ── */}
          {(isVisible('farm_ranking') || isVisible('epidemic_map')) && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 10 : 12, alignItems: 'start' }}>
            {isVisible('farm_ranking') && <FarmRankingWidget rankings={rankings} onFarmClick={(fid) => { selectFarm(fid); navigate(`/farm/${fid}`); }} />}
            {isVisible('epidemic_map') && <EpidemicMapWidget onClusterClick={(id) => setEpidemicClusterId(id)} />}
          </div>
          )}

          {/* 소버린 AI 지식 강화 — 백엔드에서 자동 학습, UI에서 제거 */}
          </div>
      )}

      {/* 드릴다운 모달 */}
      {drilldown && (
        <TodoDrilldownModal
          eventType={drilldown.eventType}
          label={drilldown.label}
          farmId={selectedFarmId}
          onClose={() => setDrilldown(null)}
          onAnimalClick={(aid) => { setDrilldown(null); navigate(`/animals/${aid}`); }}
          onSovereignClick={(aid) => {
            setDrilldown(null);
            setTinkerbellTrigger(`[팅커벨 AI — 개체 정밀 분석]\n[개체ID] ${aid}\n이 개체의 센서 데이터, 최근 알람, 번식 이력, 건강 상태를 모두 조회하여 종합 분석해주세요. 즉각 조치가 필요하면 우선순위별로, 목장주가 지금 해야 할 행동을 구체적으로 알려주세요. (${Date.now()})`);
          }}
        />
      )}

      {sensorChartAnimalId && (
        <SensorChartModal
          animalId={sensorChartAnimalId}
          onClose={() => setSensorChartAnimalId(null)}
          onAskAi={(_aid, context) => {
            setSensorChartAnimalId(null);
            // 팅커벨 AI로 센서 데이터 컨텍스트 전달
            setTinkerbellTrigger(context);
          }}
        />
      )}

      {epidemicClusterId && epidemicClusterId !== '__dashboard__' && (
        <ClusterDetailModal clusterId={epidemicClusterId} onClose={() => setEpidemicClusterId(null)} />
      )}

      {/* 수정 추천 패널 (발정 개체 클릭 시 표시) */}
      {inseminationAnimalId && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setInseminationAnimalId(null); }}
        >
          <div
            className="w-full max-w-md rounded-xl shadow-2xl overflow-y-auto"
            style={{
              background: 'var(--ct-card)',
              border: '1px solid var(--ct-border)',
              maxHeight: '85vh',
              padding: 20,
            }}
          >
            <InseminationPanel
              animalId={inseminationAnimalId}
              onClose={() => setInseminationAnimalId(null)}
            />
          </div>
        </div>
      )}

    </div>
  );
}
