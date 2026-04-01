// 방역관 전용 대시보드 — 역학·수의학·전염병학 관점 세계 최고 수준
//
// 설계 기준:
//  - OIE(세계동물보건기구) 방역 단계 기준 적용
//  - FMD(구제역)·HPAI·브루셀라 국내 법정전염병 감시 지표
//  - 발열률 = 가장 민감한 집단 발병 조기경보 지표 (smaXtec 연구 근거)
//  - 집단발생 기준: 동일 농장 내 3두 이상 동시 발열 또는 인접농장 7일 내 연속 발생

import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPatch } from '@web/api/client';
import { useIsMobile } from '@web/hooks/useIsMobile';

// ── 타입 ─────────────────────────────────────────────────────────────

type RiskLevel = 'green' | 'yellow' | 'orange' | 'red';

interface QuarantineKpi {
  readonly totalAnimals: number;
  readonly sensorRate: number;
  readonly feverAnimals: number;
  readonly clusterFarms: number;
  readonly legalDiseaseSuspects: number;
  readonly riskLevel: RiskLevel;
  readonly feverRate: number;
}

interface RiskFarm {
  readonly farmId: string;
  readonly farmName: string;
  readonly healthAlertCount: number;
  readonly feverCount: number;
  readonly ruminationCount: number;
  readonly otherHealthCount: number;
  readonly groupRate: number;
  readonly clusterAlert: boolean;
  readonly legalSuspect: boolean;
  readonly riskScore: number;
  readonly lat: number;
  readonly lng: number;
}

interface HourlyFeverPoint {
  readonly hour: string;
  readonly count: number;
}

interface ActiveAlert {
  readonly alertId: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly alertType: string;
  readonly priority: string;
  readonly title: string;
  readonly createdAt: string;
}

interface QuarantineDashboardData {
  readonly kpi: QuarantineKpi;
  readonly top5RiskFarms: readonly RiskFarm[];
  readonly hourlyFever24h: readonly HourlyFeverPoint[];
  readonly dsi7Days: readonly { date: string; avgDsi: number }[];
  readonly activeAlerts: readonly ActiveAlert[];
  readonly computedAt: string;
}

interface EarlyDetectionMetrics {
  readonly monthlyStats: {
    readonly month: string;
    readonly totalDetections: number;
    readonly avgLeadTimeHours: number;
    readonly preventedAnimals: number;
    readonly economicSavingsKrw: number;
    readonly falsePositiveRate: number;
    readonly truePositiveRate: number;
  };
  readonly comparisonScenario: {
    readonly withCowTalk: { readonly avgResponseHours: number; readonly estimatedSpreadAnimals: number };
    readonly withoutCowTalk: { readonly avgResponseHours: number; readonly estimatedSpreadAnimals: number };
    readonly savedAnimals: number;
    readonly savedEconomicKrw: number;
  };
}

interface NationalSituationData {
  readonly provinces: readonly {
    readonly province: string;
    readonly farmCount: number;
    readonly feverAnimals: number;
    readonly feverRate: number;
    readonly clusterFarms: number;
    readonly legalSuspects: number;
    readonly riskLevel: RiskLevel;
  }[];
  readonly nationalSummary: {
    readonly totalFarms: number;
    readonly totalAnimals: number;
    readonly feverAnimals: number;
    readonly nationalFeverRate: number;
    readonly highRiskProvinces: number;
    readonly broadAlertActive: boolean;
    readonly broadAlertMessage: string | null;
  };
  readonly weeklyFeverTrend: readonly { week: string; feverRate: number }[];
}

interface ActionQueueItem {
  readonly actionId: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly type: string;
  readonly priority: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly createdAt: string;
}

// ── 상수 ─────────────────────────────────────────────────────────────

const RISK_COLORS: Record<RiskLevel, string> = {
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

const RISK_LABELS: Record<RiskLevel, string> = {
  green: '정상',
  yellow: '주의',
  orange: '경계',
  red: '심각',
};

const RISK_BG: Record<RiskLevel, string> = {
  green: 'rgba(34,197,94,0.1)',
  yellow: 'rgba(234,179,8,0.1)',
  orange: 'rgba(249,115,22,0.1)',
  red: 'rgba(239,68,68,0.1)',
};

// OIE 기준 법정 전염병 대응 액션플랜
const ACTION_PLANS: Record<string, { steps: string[]; timeframe: string; authority: string }> = {
  FMD: {
    steps: [
      '즉시 해당 농장 이동 제한 (이동금지명령 발동)',
      '발병 의심 개체 격리, 수의사 24시간 내 임상 검사',
      '시료 채취 → KAHIS 긴급 신고 (24시간 내 의무)',
      '농장 반경 3km 위험구역 설정, 10km 경계구역 지정',
      '역학조사 착수 (접촉 차량·인원 추적)',
      '살처분 여부: 확진 후 48시간 내 결정',
      '매몰지 선정 및 소독 차량 배치',
    ],
    timeframe: '확진 후 72시간 내 완료',
    authority: '시도지사 → 농림축산식품부 장관',
  },
  HPAI: {
    steps: [
      '고병원성 의심 즉시 가금류 이동 통제 (소·돼지와 다름)',
      '조류 접촉 이력 조사 (야생조류, 철새 도래지)',
      '수의방역사 출동 → AI 정밀검사 의뢰',
      '반경 500m 위험구역 / 3km 경계구역',
      'PPE 착용 후 임상 관찰, 사람 노출 시 지역보건소 통보',
      '사체 처리: 매몰 또는 렌더링 처리 (소각 원칙)',
    ],
    timeframe: '의심 즉시 ~ 48시간 내',
    authority: '방역관 → 농림축산검역본부',
  },
  BRUCELLA: {
    steps: [
      '혈청검사 양성 개체 즉시 격리',
      '동일 농장 전두수 브루셀라 검사 의뢰',
      '양성 개체 도태 처분 (법적 의무)',
      '농장 소독 및 소독필증 발급',
      '접촉 인원 인수공통전염병 예방 교육',
      '도태 후 60일 재검사 스케줄 등록',
    ],
    timeframe: '양성 판정 후 30일 내 도태',
    authority: '수의사 → 시군구 방역팀',
  },
  CLUSTER: {
    steps: [
      '동일 농장 3두 이상 동시 발열 → 집단발생 간주',
      '외부 차량·사람 출입 즉시 통제',
      '모든 이상 개체 체온 재측정 및 임상 기록',
      '사료·음수·TMR 성분 조사 (비전염성 배제)',
      '역학조사: 최근 14일 이동이력 및 공동 방목 여부',
      '의심 축 혈액·비강 도말 채취 즉시 의뢰',
      '인근 농장(반경 5km) 경보 발령 및 관찰 강화',
    ],
    timeframe: '집단발생 인지 즉시',
    authority: '방역관 현장 지휘',
  },
};

// ── 헬퍼 컴포넌트 ─────────────────────────────────────────────────────

function RiskBadge({ level }: { level: RiskLevel }): React.JSX.Element {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 10px',
      borderRadius: 10,
      background: RISK_BG[level],
      color: RISK_COLORS[level],
      fontWeight: 800,
      fontSize: 12,
      border: `1px solid ${RISK_COLORS[level]}40`,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: RISK_COLORS[level],
        animation: level === 'red' || level === 'orange' ? 'pulse 1.5s infinite' : undefined,
      }} />
      {RISK_LABELS[level]}
    </span>
  );
}

function KpiBox({
  label, value, sub, color, icon, blink,
}: {
  label: string; value: string | number; sub?: string; color: string; icon: string; blink?: boolean;
}): React.JSX.Element {
  return (
    <div style={{
      padding: '12px 10px',
      borderRadius: 10,
      background: `${color}10`,
      border: `1px solid ${color}30`,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 16, marginBottom: 2 }}>{icon}</div>
      <div style={{
        fontSize: 24, fontWeight: 800, color,
        animation: blink ? 'pulse 1.5s infinite' : undefined,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────

interface Props {
  readonly onFarmClick?: (farmId: string) => void;
}

export function QuarantineDashboard({ onFarmClick }: Props): React.JSX.Element {
  const [dashboard, setDashboard] = useState<QuarantineDashboardData | null>(null);
  const [national, setNational] = useState<NationalSituationData | null>(null);
  const [metrics, setMetrics] = useState<EarlyDetectionMetrics | null>(null);
  const [actionQueue, setActionQueue] = useState<readonly ActionQueueItem[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'national' | 'actions' | 'metrics'>('overview');
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [completingAction, setCompletingAction] = useState<string | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    Promise.all([
      apiGet<{ data: QuarantineDashboardData }>('/quarantine/dashboard'),
      apiGet<{ data: NationalSituationData }>('/quarantine/national-situation'),
      apiGet<{ data: EarlyDetectionMetrics }>('/quarantine/early-detection-metrics'),
      apiGet<{ data: readonly ActionQueueItem[] }>('/quarantine/action-queue'),
    ]).then(([db, nat, met, aq]) => {
      setDashboard(db.data);
      setNational(nat.data);
      setMetrics(met.data);
      setActionQueue(aq.data);
    }).catch(() => {});
  }, []);

  const handleCompleteAction = useCallback(async (actionId: string) => {
    setCompletingAction(actionId);
    try {
      await apiPatch(`/quarantine/action/${actionId}`, { status: 'completed' });
      setActionQueue((prev) =>
        prev.map((a) => a.actionId === actionId ? { ...a, status: 'completed' } : a)
      );
    } catch {
      // silent
    } finally {
      setCompletingAction(null);
    }
  }, []);

  if (!dashboard) {
    return (
      <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--ct-text-muted)' }}>
        🛡️ 방역 대시보드 로딩 중...
      </div>
    );
  }

  const { kpi, top5RiskFarms, hourlyFever24h, activeAlerts } = dashboard;

  // 24h 발열 추이 차트 데이터
  const maxFever = Math.max(...hourlyFever24h.map((h) => h.count), 1);

  // 전국 위험 시도 정렬
  const sortedProvinces = national
    ? [...national.provinces].sort((a, b) => {
        const order: Record<RiskLevel, number> = { red: 4, orange: 3, yellow: 2, green: 1 };
        return (order[b.riskLevel] ?? 0) - (order[a.riskLevel] ?? 0);
      })
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── 전국 경보 배너 ── */}
      {national?.nationalSummary.broadAlertActive && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(239,68,68,0.12)',
          border: '2px solid #ef4444',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 22 }}>🚨</span>
          <div>
            <div style={{ fontWeight: 800, color: '#ef4444', fontSize: 14 }}>전국 방역 경보 발령</div>
            <div style={{ fontSize: 12, color: 'var(--ct-text-secondary)', marginTop: 2 }}>
              {national.nationalSummary.broadAlertMessage}
            </div>
          </div>
        </div>
      )}

      {/* ── 위험 등급 헤더 ── */}
      <div style={{
        background: 'var(--ct-card)',
        border: `2px solid ${RISK_COLORS[kpi.riskLevel]}40`,
        borderRadius: 12,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🛡️</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ct-text)' }}>방역 상황실</div>
            <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 1 }}>
              {new Date(dashboard.computedAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 기준
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <RiskBadge level={kpi.riskLevel} />
          <div style={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>
            발열률 <strong style={{ color: RISK_COLORS[kpi.riskLevel] }}>{(kpi.feverRate * 100).toFixed(2)}%</strong>
          </div>
        </div>
      </div>

      {/* ── 6개 핵심 KPI ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
        gap: 8,
      }}>
        <KpiBox icon="🐄" label="감시 두수" value={kpi.totalAnimals.toLocaleString()} color="#6366f1" />
        <KpiBox icon="📡" label="센서 장착률" value={`${(kpi.sensorRate * 100).toFixed(0)}%`} color="#22c55e" />
        <KpiBox
          icon="🌡️"
          label="발열 두수 (6h)"
          value={kpi.feverAnimals}
          sub={kpi.feverAnimals > 10 ? '집단발생 주의' : undefined}
          color={kpi.feverAnimals > 20 ? '#ef4444' : kpi.feverAnimals > 5 ? '#f97316' : '#eab308'}
          blink={kpi.feverAnimals > 20}
        />
        <KpiBox
          icon="🏚️"
          label="집단발열 농장"
          value={kpi.clusterFarms}
          sub={kpi.clusterFarms > 0 ? '역학조사 필요' : undefined}
          color={kpi.clusterFarms > 0 ? '#ef4444' : '#22c55e'}
          blink={kpi.clusterFarms > 0}
        />
        <KpiBox
          icon="⚠️"
          label="법정전염병 의심"
          value={kpi.legalDiseaseSuspects}
          sub={kpi.legalDiseaseSuspects > 0 ? '즉시 신고 필요' : undefined}
          color={kpi.legalDiseaseSuspects > 0 ? '#ef4444' : '#22c55e'}
          blink={kpi.legalDiseaseSuspects > 0}
        />
        <KpiBox icon="📊" label="고위험 농장" value={top5RiskFarms.filter((f) => f.riskScore >= 70).length} color="#f97316" />
      </div>

      {/* ── 탭 메뉴 ── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--ct-border)', paddingBottom: 0 }}>
        {(['overview', 'national', 'actions', 'metrics'] as const).map((tab) => {
          const labels: Record<string, string> = {
            overview: '📊 현황',
            national: '🗺️ 전국',
            actions: '📋 업무큐',
            metrics: '📈 성과',
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: activeTab === tab ? 800 : 500,
                color: activeTab === tab ? '#6366f1' : 'var(--ct-text-muted)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* ── 탭: 현황 ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 24h 발열 추이 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: 0 }}>🌡️ 24시간 발열 추이</h3>
              <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>시간별 발열 두수</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80, overflowX: 'auto' }}>
              {hourlyFever24h.map((h, idx) => {
                const barH = Math.max(Math.round((h.count / maxFever) * 72), h.count > 0 ? 4 : 1);
                const isHigh = h.count > (maxFever * 0.7);
                const hourLabel = new Date(h.hour).getHours();
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto', width: isMobile ? 14 : 18 }}>
                    {h.count > 0 && (
                      <div style={{ fontSize: 8, color: isHigh ? '#ef4444' : 'var(--ct-text-muted)', marginBottom: 1, fontWeight: isHigh ? 800 : 400 }}>
                        {h.count}
                      </div>
                    )}
                    <div style={{
                      width: '100%',
                      height: barH,
                      background: isHigh ? '#ef4444' : h.count > 0 ? '#f97316' : 'var(--ct-border)',
                      borderRadius: '2px 2px 0 0',
                      opacity: h.count > 0 ? 0.9 : 0.3,
                    }} />
                    {hourLabel % 6 === 0 && (
                      <div style={{ fontSize: 8, color: 'var(--ct-text-muted)', marginTop: 2 }}>{hourLabel}h</div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* 기준선 표시 */}
            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 10, height: 10, background: '#ef4444', borderRadius: 2, display: 'inline-block' }} /> 경보 수준
              </span>
              <span style={{ fontSize: 10, color: '#f97316', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 10, height: 10, background: '#f97316', borderRadius: 2, display: 'inline-block' }} /> 주의 수준
              </span>
              <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
                * 집단발생 기준: 1농장 3두 이상 동시 발열 (OIE 기준)
              </span>
            </div>
          </div>

          {/* TOP5 위험 농장 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: 0 }}>🏚️ 위험도 상위 농장</h3>
              <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>위험점수 = 발열+집단+법정전염병</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {top5RiskFarms.length === 0 && (
                <div style={{ textAlign: 'center', padding: 16, color: 'var(--ct-text-muted)', fontSize: 13 }}>
                  ✅ 위험 농장 없음 — 방역 양호
                </div>
              )}
              {top5RiskFarms.map((farm, idx) => {
                const riskColor = farm.riskScore >= 80 ? '#ef4444' : farm.riskScore >= 60 ? '#f97316' : farm.riskScore >= 40 ? '#eab308' : '#22c55e';
                return (
                  <div
                    key={farm.farmId}
                    onClick={() => onFarmClick?.(farm.farmId)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--ct-bg)',
                      border: `1px solid ${farm.legalSuspect ? '#ef4444' : farm.clusterAlert ? '#f97316' : 'var(--ct-border)'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    {/* 순위 */}
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: riskColor, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, flexShrink: 0,
                    }}>
                      {idx + 1}
                    </div>
                    {/* 농장 정보 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>
                          {farm.farmName}
                        </span>
                        {farm.legalSuspect && (
                          <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                            ⚠️ 법정전염병 의심
                          </span>
                        )}
                        {farm.clusterAlert && !farm.legalSuspect && (
                          <span style={{ fontSize: 10, background: 'rgba(249,115,22,0.15)', color: '#f97316', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                            🔴 집단발생
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#ef4444' }}>발열 {farm.feverCount}두</span>
                        <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>반추저하 {farm.ruminationCount}두</span>
                        <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>집단발생률 {(farm.groupRate * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    {/* 위험 점수 */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: riskColor }}>{farm.riskScore}</div>
                      <div style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>위험점수</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 현재 활성 알림 */}
          {activeAlerts.length > 0 && (
            <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 10px' }}>
                🚨 현재 활성 알림 ({activeAlerts.length}건)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 200, overflowY: 'auto' }}>
                {activeAlerts.map((alert) => (
                  <div
                    key={alert.alertId}
                    onClick={() => onFarmClick?.(alert.farmId)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: alert.priority === 'critical' ? 'rgba(239,68,68,0.08)' : 'var(--ct-bg)',
                      border: `1px solid ${alert.priority === 'critical' ? '#ef444440' : 'var(--ct-border)'}`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text)' }}>{alert.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
                        {alert.farmName} · {new Date(alert.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 8,
                      background: alert.priority === 'critical' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
                      color: alert.priority === 'critical' ? '#ef4444' : '#eab308',
                      fontWeight: 700,
                    }}>
                      {alert.priority === 'critical' ? '긴급' : '주의'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 법정전염병 대응 액션플랜 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 10px' }}>
              📋 법정전염병 대응 절차 (OIE/KAHIS 기준)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(ACTION_PLANS).map(([disease, plan]) => (
                <div key={disease} style={{ border: '1px solid var(--ct-border)', borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedPlan(expandedPlan === disease ? null : disease)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: expandedPlan === disease ? 'rgba(99,102,241,0.08)' : 'var(--ct-bg)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>
                        {disease === 'FMD' ? '🦷 구제역(FMD)' :
                         disease === 'HPAI' ? '🦜 고병원성AI(HPAI)' :
                         disease === 'BRUCELLA' ? '🧬 브루셀라' :
                         '🔴 집단발생 대응'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>{plan.timeframe}</span>
                      <span style={{ color: 'var(--ct-text-muted)', fontSize: 12 }}>
                        {expandedPlan === disease ? '▲' : '▼'}
                      </span>
                    </div>
                  </button>
                  {expandedPlan === disease && (
                    <div style={{ padding: '10px 14px 14px', background: 'var(--ct-card)' }}>
                      <div style={{ fontSize: 10, color: '#6366f1', marginBottom: 8, fontWeight: 700 }}>
                        📌 관할: {plan.authority}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {plan.steps.map((step, si) => (
                          <div key={si} style={{
                            display: 'flex', gap: 8, alignItems: 'flex-start',
                            padding: '6px 10px',
                            borderRadius: 6,
                            background: si === 0 ? 'rgba(239,68,68,0.06)' : 'var(--ct-bg)',
                            border: `1px solid ${si === 0 ? '#ef444420' : 'var(--ct-border)'}`,
                          }}>
                            <span style={{
                              width: 20, height: 20, borderRadius: '50%',
                              background: si === 0 ? '#ef4444' : 'var(--ct-border)',
                              color: si === 0 ? '#fff' : 'var(--ct-text-muted)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 800, flexShrink: 0,
                            }}>
                              {si + 1}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--ct-text)', lineHeight: 1.5 }}>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 탭: 전국 현황 ── */}
      {activeTab === 'national' && national && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 전국 요약 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 10px' }}>전국 방역 현황</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#6366f1' }}>{national.nationalSummary.totalFarms}</div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>감시 농장</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: national.nationalSummary.nationalFeverRate > 0.05 ? '#ef4444' : '#22c55e' }}>
                  {(national.nationalSummary.nationalFeverRate * 100).toFixed(2)}%
                </div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>전국 발열률</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: national.nationalSummary.highRiskProvinces > 0 ? '#f97316' : '#22c55e' }}>
                  {national.nationalSummary.highRiskProvinces}
                </div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>고위험 시도</div>
              </div>
            </div>
          </div>

          {/* 시도별 위험등급 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 10px' }}>시도별 위험 등급</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {sortedProvinces.map((prov) => (
                <div key={prov.province} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: `${RISK_COLORS[prov.riskLevel]}08`,
                  border: `1px solid ${RISK_COLORS[prov.riskLevel]}30`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: RISK_COLORS[prov.riskLevel],
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ct-text)' }}>{prov.province}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>{prov.farmCount}농장</span>
                    <span style={{ fontSize: 11, color: '#ef4444' }}>발열 {prov.feverAnimals}두</span>
                    <span style={{ fontSize: 11, color: RISK_COLORS[prov.riskLevel], fontWeight: 700 }}>
                      {(prov.feverRate * 100).toFixed(1)}%
                    </span>
                    <RiskBadge level={prov.riskLevel} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 주간 발열률 추이 */}
          {national.weeklyFeverTrend.length > 0 && (
            <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>📈 4주 전국 발열률 추이</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80 }}>
                {national.weeklyFeverTrend.map((w, idx) => {
                  const maxR = Math.max(...national.weeklyFeverTrend.map((x) => x.feverRate), 0.01);
                  const barH = Math.max(Math.round((w.feverRate / maxR) * 70), 2);
                  const color = w.feverRate >= 0.10 ? '#ef4444' : w.feverRate >= 0.05 ? '#f97316' : w.feverRate >= 0.02 ? '#eab308' : '#22c55e';
                  return (
                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div style={{ fontSize: 9, color, fontWeight: 700 }}>{(w.feverRate * 100).toFixed(1)}%</div>
                      <div style={{ width: '100%', height: barH, background: color, borderRadius: '2px 2px 0 0', opacity: 0.85 }} />
                      <div style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>{w.week}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--ct-text-muted)' }}>
                ※ OIE 기준: 2% 이상 주의 / 5% 이상 경계 / 10% 이상 심각
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 탭: 업무큐 ── */}
      {activeTab === 'actions' && (
        <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>
            📋 오늘 방역 업무 큐 ({actionQueue.filter((a) => a.status !== 'completed').length}건 미완료)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {actionQueue.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--ct-text-muted)', fontSize: 13 }}>
                ✅ 오늘 방역 업무 없음
              </div>
            )}
            {actionQueue.map((action) => {
              const isDone = action.status === 'completed';
              const isUrgent = action.priority === 'critical' || action.priority === 'high';
              return (
                <div
                  key={action.actionId}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: isDone ? 'var(--ct-bg)' : isUrgent ? 'rgba(239,68,68,0.05)' : 'var(--ct-bg)',
                    border: `1px solid ${isDone ? 'var(--ct-border)' : isUrgent ? '#ef444430' : 'var(--ct-border)'}`,
                    opacity: isDone ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: isDone ? 'var(--ct-text-muted)' : 'var(--ct-text)', textDecoration: isDone ? 'line-through' : 'none' }}>
                        {action.title}
                      </span>
                      {isUrgent && !isDone && (
                        <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                          긴급
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 2 }}>
                      {action.farmName} · {new Date(action.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {!isDone && (
                    <button
                      onClick={() => handleCompleteAction(action.actionId)}
                      disabled={completingAction === action.actionId}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 6,
                        background: '#22c55e',
                        color: '#fff',
                        border: 'none',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        opacity: completingAction === action.actionId ? 0.6 : 1,
                        flexShrink: 0,
                      }}
                    >
                      완료
                    </button>
                  )}
                  {isDone && (
                    <span style={{ fontSize: 20 }}>✅</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* 역학조사 체크리스트 */}
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#6366f1', marginBottom: 8 }}>
              📑 역학조사 체크리스트 (현장 출동 시)
            </div>
            {[
              '발병 첫 확인 일시·경로 기록',
              '동일 수원·사료 공유 농장 식별',
              '최근 14일 이내 차량 출입 기록 확보 (방문 수의사·정자차·사료차)',
              '이력제 시스템으로 최근 이동 이력 조회',
              '분변·비강 도말·혈액 시료 채취 → 냉장 보관 즉시 의뢰',
              '살처분 후보 개체 식별 및 농장주 동의서 확보',
              '역학 지도: 발병 농장 → 접촉 농장 연결선 작성',
            ].map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: '#6366f1', flexShrink: 0 }}>□</span>
                <span style={{ fontSize: 11, color: 'var(--ct-text)', lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 탭: 성과 지표 ── */}
      {activeTab === 'metrics' && metrics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 이번 달 조기감지 성과 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>
              📊 이번 달 조기감지 성과 ({metrics.monthlyStats.month})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#6366f1' }}>
                  {metrics.monthlyStats.avgLeadTimeHours.toFixed(1)}h
                </div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>평균 조기감지 선행시간</div>
                <div style={{ fontSize: 10, color: '#22c55e', marginTop: 2, fontWeight: 600 }}>
                  기존 대비 {(36 - metrics.monthlyStats.avgLeadTimeHours).toFixed(0)}h 앞당김
                </div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>
                  {metrics.monthlyStats.preventedAnimals}두
                </div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>예방 도태</div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.15)', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#eab308' }}>
                  {(metrics.monthlyStats.economicSavingsKrw / 1_000_000).toFixed(0)}M
                </div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>절감 경제효과 (원)</div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#6366f1' }}>
                  {(metrics.monthlyStats.truePositiveRate * 100).toFixed(0)}%
                </div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>정탐률</div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 1 }}>
                  오탐률 {(metrics.monthlyStats.falsePositiveRate * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          </div>

          {/* 시나리오 비교 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>
              ⚖️ CowTalk 도입 효과 비교
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              {/* CowTalk */}
              <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', marginBottom: 8 }}>✅ CowTalk 도입</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>
                  {metrics.comparisonScenario.withCowTalk.avgResponseHours}h
                </div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>평균 대응 시간</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e', marginTop: 8 }}>
                  {metrics.comparisonScenario.withCowTalk.estimatedSpreadAnimals}두
                </div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>예상 전파 두수</div>
              </div>
              {/* 미도입 */}
              <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#ef4444', marginBottom: 8 }}>❌ CowTalk 미도입</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444' }}>
                  {metrics.comparisonScenario.withoutCowTalk.avgResponseHours}h
                </div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>평균 대응 시간</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444', marginTop: 8 }}>
                  {metrics.comparisonScenario.withoutCowTalk.estimatedSpreadAnimals}두
                </div>
                <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>예상 전파 두수</div>
              </div>
            </div>
            {/* 절감 효과 요약 */}
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginBottom: 4 }}>CowTalk 도입으로 절감</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
                <div>
                  <span style={{ fontSize: 18, fontWeight: 900, color: '#22c55e' }}>
                    {metrics.comparisonScenario.savedAnimals}두
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginLeft: 4 }}>도태 예방</span>
                </div>
                <div>
                  <span style={{ fontSize: 18, fontWeight: 900, color: '#22c55e' }}>
                    {(metrics.comparisonScenario.savedEconomicKrw / 100_000_000).toFixed(1)}억
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginLeft: 4 }}>경제효과</span>
                </div>
              </div>
            </div>
          </div>

          {/* 역학 감시 가이드라인 */}
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#6366f1', marginBottom: 8 }}>
              📖 역학 감시 지표 해석 기준 (OIE/KAHIS)
            </div>
            {[
              { indicator: '발열률 < 2%', meaning: '정상 (계절·스트레스 요인 내)', action: '정기 모니터링 유지' },
              { indicator: '발열률 2~5%', meaning: '주의 (증가 추세 확인 필요)', action: '원인 조사 + 7일 집중 감시' },
              { indicator: '발열률 5~10%', meaning: '경계 (집단 감염 가능성)', action: '역학조사 즉시 착수' },
              { indicator: '발열률 ≥ 10%', meaning: '심각 (법정전염병 의심)', action: 'KAHIS 긴급 신고 + 이동 통제' },
              { indicator: '동일 농장 3두+ 동시 발열', meaning: '집단발생 (전염성 의심)', action: '역학조사 + 시료 채취' },
              { indicator: '7일 내 인접 농장 연속 발생', meaning: '수평 전파 의심', action: '경계구역 설정 + 전파경로 추적' },
            ].map((row, idx) => (
              <div key={idx} style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '2fr 2fr 2fr',
                gap: 6,
                padding: '6px 8px',
                borderRadius: 6,
                background: idx % 2 === 0 ? 'var(--ct-bg)' : 'transparent',
                marginBottom: 4,
              }}>
                <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>{row.indicator}</span>
                <span style={{ fontSize: 11, color: 'var(--ct-text)' }}>{row.meaning}</span>
                <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>{row.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CSS 애니메이션 */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
