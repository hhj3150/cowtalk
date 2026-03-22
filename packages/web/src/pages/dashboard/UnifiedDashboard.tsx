// 통합 대시보드 — AI 강화 + 동적 차트 + 실시간 운영 (다크 테마)

import React, { useEffect, useState } from 'react';
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
  useBreedingPipeline,
  useSovereignAiStats,
} from '@web/hooks/useUnifiedDashboard';
import { useFarmStore } from '@web/stores/farm.store';
import { useAuthStore } from '@web/stores/auth.store';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { ErrorFallback } from '@web/components/common/ErrorFallback';
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
  BreedingPipelineWidget,
  AlarmLabelChatModal,
  SovereignAiWidget,
} from '@web/components/unified-dashboard';
import { TodoDrilldownModal } from '@web/components/unified-dashboard/TodoDrilldownModal';
import { SensorChartModal } from '@web/components/unified-dashboard/SensorChartModal';
import { EpidemicAlertBanner } from '@web/components/epidemic/EpidemicAlertBanner';
import { EpidemicMapWidget } from '@web/components/epidemic/EpidemicMapWidget';
import { ClusterDetailModal } from '@web/components/epidemic/ClusterDetailModal';
import { VitalMonitorChart } from '@web/components/unified-dashboard/VitalMonitorChart';
import { FarmMapWidget, buildFarmMapMarkers } from '@web/components/unified-dashboard/FarmMapWidget';
import type { TodoItem } from '@cowtalk/shared';
import { useRoleDashboard } from '@web/hooks/useRoleDashboard';
import { GeniVoiceAssistant } from '@web/components/unified-dashboard/GeniVoiceAssistant';
import { useIsMobile } from '@web/hooks/useIsMobile';
// ROLE_LABELS는 향후 역할별 라벨 표시에 사용 예정
import type {} from '@web/config/dashboard-widgets';

// ── Farm filter dropdown ──

function FarmFilterDropdown(): React.JSX.Element {
  const { data: farmsData } = useDashboardFarms();
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const selectFarm = useFarmStore((s) => s.selectFarm);
  const clearSelection = useFarmStore((s) => s.clearSelection);
  const farmList = farmsData?.farms ?? [];
  const totalCount = farmsData?.total ?? 0;

  return (
    <select
      value={selectedFarmId ?? ''}
      onChange={(e) => {
        if (e.target.value === '') { clearSelection(); } else { selectFarm(e.target.value); }
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
      <option value="">{`전체 (${totalCount}개 농장)`}</option>
      {farmList.map((f) => (
        <option key={f.farmId} value={f.farmId}>{f.name} ({f.currentHeadCount}두)</option>
      ))}
    </select>
  );
}

// ── AI Briefing Card ──

function AiBriefingCard(): React.JSX.Element {
  const { data: briefing, isLoading } = useAiBriefing();

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
        <StatChip label="오늘 알림" value={briefing.alertStats.total24h} />
        <StatDivider />
        <StatChip
          label="전일 대비"
          value={`${briefing.trendComparison.changePercent > 0 ? '+' : ''}${briefing.trendComparison.changePercent}%`}
          color={briefing.trendComparison.direction === 'up' ? 'var(--ct-danger)' : briefing.trendComparison.direction === 'down' ? 'var(--ct-primary)' : 'var(--ct-warning)'}
        />
        <StatDivider />
        <StatChip label="심각" value={briefing.alertStats.critical} color="var(--ct-danger)" />
        <StatDivider />
        <StatChip label="높음" value={briefing.alertStats.high} color="#f97316" />
      </div>

      {/* Recommendations */}
      {briefing.recommendations.length > 0 && (
        <div style={{ borderTop: '1px solid var(--ct-border)', paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ct-primary)', marginBottom: 8, letterSpacing: '0.5px' }}>
            AI 추천
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {briefing.recommendations.slice(0, 3).map((rec, i) => (
              <div key={i} style={{
                fontSize: 12,
                color: 'var(--ct-text-secondary)',
                paddingLeft: 16,
                position: 'relative',
                lineHeight: 1.6,
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
            ))}
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

function StatChip({ label, value, color }: {
  readonly label: string;
  readonly value: string | number;
  readonly color?: string;
}): React.JSX.Element {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{
        fontSize: 20,
        fontWeight: 800,
        color: color ?? 'var(--ct-primary)',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.5px',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 2 }}>{label}</div>
    </div>
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
  return <div className="ct-section-label">{children}</div>;
}

// ── Styles ──

const briefingCardBase: React.CSSProperties = {
  background: 'linear-gradient(135deg, var(--ct-card) 0%, rgba(0,214,126,0.03) 100%)',
  borderRadius: 14,
  padding: 20,
  border: '1px solid var(--ct-border)',
};

// ── Mapping constants ──

const EMPTY_HERD = { totalAnimals: 0, sensorAttached: 0, activeAlerts: 0, healthIssues: 0 } as const;

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
  const { data, isLoading, error, refetch } = useUnifiedDashboard();
  const { data: alarmsData } = useLiveAlarms();
  const { data: rankingData } = useFarmRanking();
  const { data: alertTrendData } = useAlertTrend();
  const { data: herdCompData } = useHerdComposition();
  const { data: tempDistData } = useTemperatureDistribution();
  const { data: timelineData } = useEventTimeline();
  const { data: vitalData } = useVitalMonitor();
  const { data: mapData } = useFarmMapMarkers();
  const { data: epidemicData } = useEpidemicIntelligence();
  const { data: healthScoresData } = useFarmHealthScores();
  const { data: breedingData } = useBreedingPipeline();
  const { data: sovereignStats } = useSovereignAiStats();
  const user = useAuthStore((s) => s.user);
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const selectFarm = useFarmStore((s) => s.selectFarm);
  const { isVisible, roleLabel, isFarmer } = useRoleDashboard();
  const isMobile = useIsMobile();

  // 농장주: 단일 농장이면 자동 선택
  useEffect(() => {
    if (isFarmer && user?.farmIds?.length === 1 && !selectedFarmId) {
      selectFarm(user.farmIds[0]!);
    }
  }, [isFarmer, user?.farmIds, selectedFarmId, selectFarm]);

  const [drilldown, setDrilldown] = useState<{ eventType: string; label: string } | null>(null);
  const [sensorChartAnimalId, setSensorChartAnimalId] = useState<string | null>(null);
  const [epidemicClusterId, setEpidemicClusterId] = useState<string | null>(null);
  const [labelChatAnimalId, setLabelChatAnimalId] = useState<string | null>(null);

  const handleTodoClick = (item: TodoItem): void => {
    setDrilldown({ eventType: TODO_MAP[item.category] ?? item.category, label: item.label });
  };

  const handleKpiClick = (cat: string): void => {
    const labels: Record<string, string> = { total: '전체 동물 현황', alerts: '금일 알림 상세', health: '건강 이상 상세', sensor: '센서 장착 현황' };
    setDrilldown({ eventType: KPI_MAP[cat] ?? 'ALL', label: labels[cat] ?? cat });
  };

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    return () => { prev ? root.setAttribute('data-theme', prev) : root.removeAttribute('data-theme'); };
  }, []);

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

  const alarms = alarmsData?.alarms ?? [];
  const rankings = rankingData?.rankings ?? [];

  // 농장 지도 마커 데이터 변환
  const farmMapMarkers = React.useMemo(
    () => buildFarmMapMarkers(mapData?.markers ?? [], alarms),
    [mapData?.markers, alarms],
  );

  return (
    <div style={{
      background: 'var(--ct-bg)',
      color: 'var(--ct-text)',
      minHeight: '100vh',
      padding: isMobile ? '12px 10px 80px' : '20px 24px 40px',
      maxWidth: '100vw',
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
        marginBottom: isMobile ? 12 : 24,
        paddingBottom: isMobile ? 10 : 16,
        borderBottom: '1px solid var(--ct-border)',
      }}>
        {isMobile ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h1 style={{
                fontSize: 16,
                fontWeight: 800,
                background: 'linear-gradient(135deg, var(--ct-text), var(--ct-primary))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                margin: 0,
              }}>
                CowTalk
              </h1>
              <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>{user?.name ?? ''} ({roleLabel})</span>
            </div>
            <FarmFilterDropdown />
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <FarmFilterDropdown />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: '-0.3px',
                background: 'linear-gradient(135deg, var(--ct-text), var(--ct-primary))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                CowTalk 통합 대시보드
              </h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ color: 'var(--ct-text-secondary)', fontWeight: 500 }}>{user?.name ?? ''} ({roleLabel})</span>
              <span style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: 'var(--ct-text-muted)',
                display: 'inline-block',
              }} />
              <span style={{ color: 'var(--ct-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{lastUpdated}</span>
            </div>
          </>
        )}
      </header>

      {isLoading ? (
        <div style={{ padding: 24 }}><LoadingSkeleton lines={8} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* ── 전염병 배너 ── */}
          <EpidemicAlertBanner onDetailClick={() => setEpidemicClusterId('__dashboard__')} />

          {/* ── AI 브리핑 ── */}
          <AiBriefingCard />

          {/* ── KPI 카드 ── */}
          <HerdOverviewCards data={data?.herdOverview ?? EMPTY_HERD} onCardClick={handleKpiClick} />

          {/* ── 번식성적 ── */}
          {isVisible('breeding_pipeline') && (<>
          <SectionLabel>번식성적 커맨드센터</SectionLabel>
          {breedingData && <BreedingPipelineWidget data={breedingData} />}
          </>)}

          {/* ── 역학 감시 ── */}
          {(isVisible('epidemic_command_center') || isVisible('farm_health_score')) && (<>
          <SectionLabel>방역 인텔리전스</SectionLabel>
          {isVisible('epidemic_command_center') && epidemicData && <EpidemicCommandCenter data={epidemicData} onAnimalClick={(aid) => setLabelChatAnimalId(aid)} />}
          {isVisible('farm_health_score') && healthScoresData && healthScoresData.length > 0 && (
            <FarmHealthScoreWidget scores={healthScoresData} onFarmClick={(fid) => selectFarm(fid)} />
          )}
          </>)}

          {/* ── 분석 차트 ── */}
          {/* 알림 트렌드: 전체 뷰에서도 의미 있음 (전국 발생 추이) */}
          {isVisible('alert_trend_chart') && (<>
          <SectionLabel>분석 차트</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: isMobile ? 12 : 16 }}>
            {isVisible('alert_trend_chart') && (
            <ChartCard title="알림 트렌드 (14일)" icon="📊" delay={100}>
              {alertTrendData && alertTrendData.length > 0
                ? <AlertTrendChart data={[...alertTrendData]} height={240} />
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
              onAnimalClick={(aid) => setLabelChatAnimalId(aid)}
            />
          )}

          {(isVisible('temperature_scatter') || isVisible('event_timeline_chart')) && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (isVisible('temperature_scatter') && isVisible('event_timeline_chart') ? '1fr 1fr' : '1fr'), gap: isMobile ? 12 : 16 }}>
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

          {/* ── 농장 지도 ── */}
          {isVisible('farm_map') && (<>
          <SectionLabel>농장 지도</SectionLabel>
          {farmMapMarkers.length > 0 && (
            <FarmMapWidget
              markers={farmMapMarkers}
              selectedFarmId={selectedFarmId}
              onFarmClick={(fid) => selectFarm(fid)}
            />
          )}
          </>)}

          {/* ── 운영 패널 (AI 채팅은 지니로 통합) ── */}
          {(isVisible('live_alarm_feed') || isVisible('todo_list')) && (<>
          <SectionLabel>운영 현황</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 12 : 16, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isVisible('live_alarm_feed') && <LiveAlarmFeed alarms={alarms} onFarmClick={(fid) => selectFarm(fid)} onAnimalClick={(aid) => setLabelChatAnimalId(aid)} />}
              {isVisible('todo_list') && <TodoListPanel items={data?.todoList ?? []} onItemClick={handleTodoClick} />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isVisible('farm_ranking') && <FarmRankingWidget rankings={rankings} onFarmClick={(fid) => selectFarm(fid)} />}
              {isVisible('epidemic_map') && <EpidemicMapWidget onClusterClick={(id) => setEpidemicClusterId(id)} />}
            </div>
          </div>
          </>)}

          {/* ── 소버린 AI 지식 강화 루프 ── */}
          {isVisible('sovereign_ai') && (<>
          <SectionLabel>소버린 AI 지식 강화</SectionLabel>
          {sovereignStats && (
            <SovereignAiWidget stats={sovereignStats} />
          )}
          </>)}
          </div>
      )}

      {/* 드릴다운 모달 */}
      {drilldown && (
        <TodoDrilldownModal
          eventType={drilldown.eventType}
          label={drilldown.label}
          farmId={selectedFarmId}
          onClose={() => setDrilldown(null)}
          onAnimalClick={(aid) => { setDrilldown(null); setLabelChatAnimalId(aid); }}
        />
      )}

      {sensorChartAnimalId && (
        <SensorChartModal animalId={sensorChartAnimalId} onClose={() => setSensorChartAnimalId(null)} />
      )}

      {epidemicClusterId && epidemicClusterId !== '__dashboard__' && (
        <ClusterDetailModal clusterId={epidemicClusterId} onClose={() => setEpidemicClusterId(null)} />
      )}

      {labelChatAnimalId && (
        <AlarmLabelChatModal
          animalId={labelChatAnimalId}
          onClose={() => setLabelChatAnimalId(null)}
        />
      )}

      {/* 지니 AI 음성 어시스턴트 */}
      <GeniVoiceAssistant
        dashboardContext={data ? {
          totalAlarms: alarms.length,
          criticalCount: alarms.filter((a) => a.severity === 'critical').length,
          healthIssues: data.herdOverview?.healthIssues ?? 0,
          farmCount: data.totalFarms ?? 146,
          animalCount: data.herdOverview?.totalAnimals ?? 7143,
        } : undefined}
      />
    </div>
  );
}
