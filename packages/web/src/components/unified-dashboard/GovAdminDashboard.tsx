// 정부 행정관 전용 대시보드 — 전국 축산 행정 디지털 전환
//
// 역할: 수급 조절·정책 집행·디지털 행정 전환
// 데이터: 전국 농장/두수 통계 + 시도별 현황 + 방역 성과 + 정책 지원 대상

import React, { useEffect, useState } from 'react';
import { apiGet } from '@web/api/client';
import { useIsMobile } from '@web/hooks/useIsMobile';

// ── 타입 ─────────────────────────────────────────────────────────────

type RiskLevel = 'green' | 'yellow' | 'orange' | 'red';

interface ProvinceStats {
  readonly province: string;
  readonly farmCount: number;
  readonly monitoredAnimals: number;
  readonly totalAnimals: number;
  readonly feverAnimals: number;
  readonly feverRate: number;
  readonly clusterFarms: number;
  readonly legalSuspects: number;
  readonly riskLevel: RiskLevel;
}

interface NationalSummary {
  readonly totalFarms: number;
  readonly totalAnimals: number;
  readonly monitoredAnimals: number;
  readonly feverAnimals: number;
  readonly nationalFeverRate: number;
  readonly highRiskProvinces: number;
  readonly broadAlertActive: boolean;
  readonly broadAlertMessage: string | null;
}

interface NationalSituationData {
  readonly provinces: readonly ProvinceStats[];
  readonly nationalSummary: NationalSummary;
  readonly weeklyFeverTrend: readonly { week: string; feverRate: number }[];
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
  readonly yearlyStats: {
    readonly year: number;
    readonly totalDetections: number;
    readonly totalPreventedAnimals: number;
    readonly totalEconomicSavingsKrw: number;
    readonly avgLeadTimeHours: number;
    readonly monthlyTrend: readonly { month: string; detections: number; savingsKrw: number }[];
  };
  readonly comparisonScenario: {
    readonly withCowTalk: { readonly avgResponseHours: number; readonly estimatedSpreadAnimals: number };
    readonly withoutCowTalk: { readonly avgResponseHours: number; readonly estimatedSpreadAnimals: number };
    readonly savedAnimals: number;
    readonly savedEconomicKrw: number;
  };
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

// 정책 지원 기준 (농림부 고시 기준)
const POLICY_CRITERIA = [
  { name: '방역 취약 농장', condition: '발열률 5%+ 또는 집단발생', icon: '🛡️', color: '#ef4444' },
  { name: 'DHI 참여 대상', condition: '젖소 50두 이상 미참여 농장', icon: '📋', color: '#6366f1' },
  { name: '스마트 축산 지원', condition: '센서 미장착 농장 (농진청 사업)', icon: '📡', color: '#22c55e' },
  { name: '경영 위기 농장', condition: '생산성 하위 20% + 부채비율 200%+', icon: '💰', color: '#eab308' },
];

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────

interface Props {
  readonly onFarmClick?: (farmId: string) => void;
}

export function GovAdminDashboard({ onFarmClick: _onFarmClick }: Props): React.JSX.Element {
  const [national, setNational] = useState<NationalSituationData | null>(null);
  const [metrics, setMetrics] = useState<EarlyDetectionMetrics | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'provinces' | 'policy' | 'performance'>('overview');
  const isMobile = useIsMobile();

  useEffect(() => {
    // apiGet는 이미 res.data.data를 언래핑하므로 직접 타입으로 호출
    Promise.all([
      apiGet<NationalSituationData>('/quarantine/national-situation'),
      apiGet<EarlyDetectionMetrics>('/quarantine/early-detection-metrics'),
    ]).then(([nat, met]) => {
      setNational(nat);
      setMetrics(met);
    }).catch(() => {});
  }, []);

  if (!national) {
    return (
      <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--ct-text-muted)' }}>
        🏛️ 행정 현황 로딩 중...
      </div>
    );
  }

  const { nationalSummary, provinces } = national;
  const monitoringRate = nationalSummary.totalAnimals > 0
    ? Math.round((nationalSummary.monitoredAnimals / nationalSummary.totalAnimals) * 100)
    : 0;

  const sortedProvinces = [...provinces].sort((a, b) => {
    const order: Record<RiskLevel, number> = { red: 4, orange: 3, yellow: 2, green: 1 };
    return (order[b.riskLevel] ?? 0) - (order[a.riskLevel] ?? 0);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── 헤더 ── */}
      <div style={{
        background: 'var(--ct-card)',
        border: '1px solid var(--ct-border)',
        borderRadius: 12,
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 22 }}>🏛️</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ct-text)' }}>축산 행정 현황판</div>
            <div style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
              {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} 기준
            </div>
          </div>
        </div>
        {nationalSummary.broadAlertActive && (
          <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, padding: '4px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            🚨 전국 방역 경보 발령 중
          </div>
        )}
      </div>

      {/* ── 전국 KPI ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: 8,
      }}>
        {[
          { icon: '🏚️', label: '관리 농장', value: nationalSummary.totalFarms.toLocaleString(), unit: '개', color: '#6366f1' },
          { icon: '🐄', label: '총 두수', value: nationalSummary.totalAnimals.toLocaleString(), unit: '두', color: '#22c55e' },
          { icon: '📡', label: '센서 모니터링', value: `${monitoringRate}%`, unit: `${nationalSummary.monitoredAnimals.toLocaleString()}두`, color: '#3b82f6' },
          {
            icon: '⚠️', label: '고위험 시도',
            value: nationalSummary.highRiskProvinces,
            unit: nationalSummary.highRiskProvinces > 0 ? '즉시 조치 필요' : '이상 없음',
            color: nationalSummary.highRiskProvinces > 0 ? '#ef4444' : '#22c55e',
          },
        ].map((kpi) => (
          <div key={kpi.label} style={{
            padding: '12px 10px',
            borderRadius: 10,
            background: `${kpi.color}08`,
            border: `1px solid ${kpi.color}25`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 16, marginBottom: 4 }}>{kpi.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 2 }}>{kpi.label}</div>
            <div style={{ fontSize: 10, color: kpi.color, fontWeight: 600, marginTop: 1 }}>{kpi.unit}</div>
          </div>
        ))}
      </div>

      {/* ── 탭 ── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--ct-border)', overflowX: 'auto' }}>
        {(['overview', 'provinces', 'policy', 'performance'] as const).map((tab) => {
          const labels: Record<string, string> = {
            overview: '📊 전국 현황',
            provinces: '🗺️ 시도별',
            policy: '📋 정책 지원',
            performance: '📈 성과 지표',
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 12px',
                fontSize: 11,
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

      {/* ── 탭: 전국 현황 ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 주간 발열률 추이 */}
          {national.weeklyFeverTrend.length > 0 && (
            <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: 0 }}>📈 전국 발열률 추이</h3>
                <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
                  현재 {(nationalSummary.nationalFeverRate * 100).toFixed(2)}%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 80 }}>
                {national.weeklyFeverTrend.map((w, idx) => {
                  const maxR = Math.max(...national.weeklyFeverTrend.map((x) => x.feverRate), 0.01);
                  const barH = Math.max(Math.round((w.feverRate / maxR) * 70), 2);
                  const color = w.feverRate >= 0.10 ? '#ef4444' : w.feverRate >= 0.05 ? '#f97316' : w.feverRate >= 0.02 ? '#eab308' : '#22c55e';
                  return (
                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div style={{ fontSize: 9, color, fontWeight: 700 }}>{(w.feverRate * 100).toFixed(1)}%</div>
                      <div style={{ width: '100%', height: barH, background: color, borderRadius: '2px 2px 0 0' }} />
                      <div style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>{w.week}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 디지털 전환 현황 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>
              📡 축산 디지털 전환 현황
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                {
                  label: '위내 센서 장착률',
                  current: monitoringRate,
                  target: 100,
                  color: '#3b82f6',
                  note: `${nationalSummary.monitoredAnimals.toLocaleString()}두 / ${nationalSummary.totalAnimals.toLocaleString()}두`,
                },
                {
                  label: '실시간 방역 모니터링',
                  current: Math.min(Math.round((provinces.filter((p) => p.farmCount > 0).length / 9) * 100), 100),
                  target: 100,
                  color: '#22c55e',
                  note: `${provinces.filter((p) => p.farmCount > 0).length}개 시도 연결`,
                },
                {
                  label: '이력제 연동',
                  current: 85,
                  target: 100,
                  color: '#6366f1',
                  note: '축산물이력추적 API 연동',
                },
              ].map((item) => (
                <div key={item.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--ct-text)' }}>{item.label}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>{item.note}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: item.color }}>{item.current}%</span>
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--ct-border)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${item.current}%`,
                      background: item.color,
                      borderRadius: 3,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 수급 동향 안내 */}
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#6366f1', marginBottom: 8 }}>
              📊 축산 수급 행정 연계 가이드
            </div>
            {[
              'CowTalk 발열률 급등 → 수급 충격 사전 예측 (2~4주 선행 지표)',
              '집단발생 발생 농장 → 즉시 가축 이동 통제 → 수급 안정 조치',
              '번식 성적(수태율·분만간격) → 다음 분기 송아지 수급 예측',
              '도태 예상 두수(장기공태우·고령우) → 육류 공급량 예측',
              '시도별 발병 현황 → 지역 특별 지원 대상 선정',
            ].map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: '#6366f1', flexShrink: 0 }}>→</span>
                <span style={{ fontSize: 11, color: 'var(--ct-text)', lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 탭: 시도별 현황 ── */}
      {activeTab === 'provinces' && (
        <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>
            시도별 방역·축산 현황 (위험도 순)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {sortedProvinces.length === 0 && (
              <div style={{ textAlign: 'center', padding: 16, color: 'var(--ct-text-muted)' }}>데이터 없음</div>
            )}
            {sortedProvinces.map((prov) => {
              const pct = prov.totalAnimals > 0
                ? Math.round((prov.monitoredAnimals / prov.totalAnimals) * 100)
                : 0;
              return (
                <div key={prov.province} style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'var(--ct-bg)',
                  border: `1px solid ${RISK_COLORS[prov.riskLevel]}30`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  {/* 위험 등급 dot */}
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: RISK_COLORS[prov.riskLevel],
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>{prov.province}</span>
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 4,
                        background: `${RISK_COLORS[prov.riskLevel]}15`,
                        color: RISK_COLORS[prov.riskLevel],
                        fontWeight: 700,
                      }}>
                        {RISK_LABELS[prov.riskLevel]}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>{prov.farmCount}농장</span>
                      <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
                        센서 {pct}% ({prov.monitoredAnimals}두)
                      </span>
                      <span style={{ fontSize: 11, color: prov.feverAnimals > 0 ? '#ef4444' : 'var(--ct-text-muted)' }}>
                        발열 {prov.feverAnimals}두 ({(prov.feverRate * 100).toFixed(1)}%)
                      </span>
                      {prov.clusterFarms > 0 && (
                        <span style={{ fontSize: 11, color: '#f97316', fontWeight: 700 }}>
                          집단 {prov.clusterFarms}농장
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 탭: 정책 지원 ── */}
      {activeTab === 'policy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>
              📋 정책 지원 대상 분류 기준
            </h3>
            {POLICY_CRITERIA.map((pc, idx) => (
              <div key={idx} style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--ct-bg)',
                border: `1px solid ${pc.color}25`,
                marginBottom: 6,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{pc.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: pc.color }}>{pc.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 2 }}>{pc.condition}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 행정 업무 자동화 가이드 */}
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', marginBottom: 8 }}>
              🤖 아날로그 → 디지털 행정 전환 항목
            </div>
            {[
              { before: '방역 일지 수기 작성', after: 'smaXtec 이벤트 자동 기록 + KAHIS 연동' },
              { before: '농장 전화 조사', after: 'CowTalk 실시간 현황 대시보드 조회' },
              { before: '이력제 수동 입력', after: '출생·이동·도태 자동 연동 (개발 예정)' },
              { before: '방역 성과 엑셀 집계', after: '조기감지 성과 지표 자동 산출' },
              { before: '현장 지도 점검', after: '원격 센서 데이터 + 알람 기반 선별 점검' },
            ].map((item, idx) => (
              <div key={idx} style={{
                display: 'flex',
                gap: 8,
                padding: '6px 8px',
                borderRadius: 6,
                background: idx % 2 === 0 ? 'var(--ct-bg)' : 'transparent',
                marginBottom: 4,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: 11, color: 'var(--ct-text-muted)', flex: 1 }}>📄 {item.before}</span>
                <span style={{ fontSize: 11, color: 'var(--ct-text-muted)', flexShrink: 0 }}>→</span>
                <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, flex: 1 }}>✅ {item.after}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 탭: 성과 지표 ── */}
      {activeTab === 'performance' && metrics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 연간 성과 요약 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>
              📊 {metrics.yearlyStats.year}년 스마트 방역 성과
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10 }}>
              {[
                {
                  label: '조기감지 건수',
                  value: metrics.yearlyStats.totalDetections.toLocaleString(),
                  unit: '건',
                  color: '#6366f1',
                },
                {
                  label: '예방 도태',
                  value: metrics.yearlyStats.totalPreventedAnimals.toLocaleString(),
                  unit: '두',
                  color: '#22c55e',
                },
                {
                  label: '평균 선행감지',
                  value: metrics.yearlyStats.avgLeadTimeHours.toFixed(1),
                  unit: '시간',
                  color: '#3b82f6',
                },
                {
                  label: '절감 경제효과',
                  value: `${(metrics.yearlyStats.totalEconomicSavingsKrw / 100_000_000).toFixed(1)}억`,
                  unit: '원',
                  color: '#f59e0b',
                },
              ].map((kpi) => (
                <div key={kpi.label} style={{
                  textAlign: 'center',
                  padding: '10px',
                  borderRadius: 8,
                  background: `${kpi.color}08`,
                  border: `1px solid ${kpi.color}20`,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                  <div style={{ fontSize: 9, color: kpi.color, marginBottom: 2 }}>{kpi.unit}</div>
                  <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>{kpi.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 월별 조기감지 추이 */}
          {metrics.yearlyStats.monthlyTrend.length > 0 && (
            <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>월별 조기감지 건수</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 70 }}>
                {metrics.yearlyStats.monthlyTrend.map((m, idx) => {
                  const maxD = Math.max(...metrics.yearlyStats.monthlyTrend.map((x) => x.detections), 1);
                  const barH = Math.max(Math.round((m.detections / maxD) * 60), m.detections > 0 ? 4 : 1);
                  return (
                    <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      {m.detections > 0 && (
                        <div style={{ fontSize: 8, color: '#6366f1', fontWeight: 700 }}>{m.detections}</div>
                      )}
                      <div style={{
                        width: '100%',
                        height: barH,
                        background: '#6366f1',
                        borderRadius: '2px 2px 0 0',
                        opacity: 0.8,
                      }} />
                      <div style={{ fontSize: 8, color: 'var(--ct-text-muted)' }}>
                        {m.month.slice(5)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 정책 근거 자료 */}
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#6366f1', marginBottom: 8 }}>
              📑 CowTalk 성과의 정책 활용 방안
            </div>
            {[
              '조기감지 선행시간 평균 → FMD 대응 체계 고도화 근거 (기존 36h → CowTalk 2h)',
              '절감 경제효과 → 스마트 방역 예산 편성 근거 자료',
              '시도별 발열률 → 지역 방역 인프라 투자 우선순위 선정',
              '센서 장착률 → 스마트 축산 확산 정책 KPI',
              '정탐률/오탐률 → 방역관 현장 출동 효율화 지표',
            ].map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: '#6366f1', flexShrink: 0 }}>•</span>
                <span style={{ fontSize: 11, color: 'var(--ct-text)', lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
