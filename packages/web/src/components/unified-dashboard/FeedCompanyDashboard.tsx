// 사료회사 전용 대시보드 — 반추·사양 효율 실데이터 기반
//
// 핵심 지표:
//  - 반추 저하: SARA(아급성 반추위 산증) 조기 경고 신호
//  - 음수 저하: 탈수·전신 쇠약 → TMR 배합 재검토 필요
//  - 활동 저하: 에너지 부족(NEB) → 사료 에너지가 BCS 유지에 부족
//
// 판단 기준 (smaXtec 연구 기반):
//  - 반추 < 380min/day → 비정상 (정상: 400~600min)
//  - 반추 저하 + 발열 → SARA → BVD 합병 가능
//  - 반추 저하 → 케토시스 연관 가능성 (분만 후 30일 이내)

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '@web/api/client';
import { useIsMobile } from '@web/hooks/useIsMobile';
import { useFarmStore } from '@web/stores/farm.store';

// ── 타입 ─────────────────────────────────────────────────────────────

interface DrilldownItem {
  readonly eventId: string;
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly eventType: string;
  readonly detectedAt: string;
  readonly severity: string;
}

interface FarmRiskSummary {
  readonly farmId: string;
  readonly farmName: string;
  readonly ruminationCount: number;
  readonly activityCount: number;
  readonly drinkingCount: number;
  readonly saraRiskScore: number;   // 0~100
  readonly latestAt: string;
}

interface FeedStats {
  readonly totalRumination: number;
  readonly totalActivity: number;
  readonly totalDrinking: number;
  readonly farmRisks: readonly FarmRiskSummary[];
  readonly urgentAnimals: readonly DrilldownItem[];
}

// SARA 위험도 판정
function calcSaraRisk(rumCount: number, actCount: number, drinkCount: number): number {
  // 반추 저하 가중치 3, 음수 저하 2, 활동 저하 1 → 최대 60점 → 0~100 정규화
  const raw = rumCount * 3 + drinkCount * 2 + actCount * 1;
  return Math.min(Math.round((raw / 18) * 100), 100);
}

// SARA 위험 등급
function saraLevel(score: number): { label: string; color: string; bg: string } {
  if (score >= 70) return { label: '위험', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' };
  if (score >= 40) return { label: '주의', color: '#f97316', bg: 'rgba(249,115,22,0.1)' };
  if (score >= 20) return { label: '경계', color: '#eab308', bg: 'rgba(234,179,8,0.1)' };
  return { label: '정상', color: '#22c55e', bg: 'rgba(34,197,94,0.06)' };
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────

interface Props {
  readonly onFarmClick?: (farmId: string) => void;
}

export function FeedCompanyDashboard({ onFarmClick }: Props): React.JSX.Element {
  const [stats, setStats] = useState<FeedStats | null>(null);
  const [activeTab, setActiveTab] = useState<'farms' | 'animals' | 'guide'>('farms');
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const selectedFarmIds = useFarmStore((s) => s.selectedFarmIds);
  const farmIdsParam = selectedFarmIds.length > 0 ? `&farmIds=${selectedFarmIds.join(',')}` : '';

  useEffect(() => {
    Promise.all([
      apiGet<{ items: readonly DrilldownItem[]; total: number }>(
        `/unified-dashboard/drilldown?eventType=rumination_decrease&days=7${farmIdsParam}`
      ),
      apiGet<{ items: readonly DrilldownItem[]; total: number }>(
        `/unified-dashboard/drilldown?eventType=activity_decrease&days=7${farmIdsParam}`
      ),
    ]).then(([rumRes, actRes]) => {
      // 농장별 집계
      const farmMap = new Map<string, {
        farmId: string; farmName: string;
        rum: number; act: number; drink: number; latestAt: string;
      }>();

      const addEvent = (item: DrilldownItem, field: 'rum' | 'act' | 'drink') => {
        const existing = farmMap.get(item.farmId);
        if (existing) {
          farmMap.set(item.farmId, {
            ...existing,
            [field]: existing[field] + 1,
            latestAt: item.detectedAt > existing.latestAt ? item.detectedAt : existing.latestAt,
          });
        } else {
          farmMap.set(item.farmId, {
            farmId: item.farmId,
            farmName: item.farmName,
            rum: field === 'rum' ? 1 : 0,
            act: field === 'act' ? 1 : 0,
            drink: field === 'drink' ? 1 : 0,
            latestAt: item.detectedAt,
          });
        }
      };

      for (const item of rumRes.items) addEvent(item, 'rum');
      for (const item of actRes.items) addEvent(item, 'act');

      const farmRisks: FarmRiskSummary[] = Array.from(farmMap.values())
        .map((f) => ({
          farmId: f.farmId,
          farmName: f.farmName,
          ruminationCount: f.rum,
          activityCount: f.act,
          drinkingCount: f.drink,
          saraRiskScore: calcSaraRisk(f.rum, f.act, f.drink),
          latestAt: f.latestAt,
        }))
        .sort((a, b) => b.saraRiskScore - a.saraRiskScore);

      // 긴급 개체: 반추 저하 우선 (SARA 직결 지표)
      const urgentAnimals = [
        ...rumRes.items.map((i) => ({ ...i, eventType: 'rumination_decrease' })),
        ...actRes.items.map((i) => ({ ...i, eventType: 'activity_decrease' })),
      ]
        .sort((a, b) => {
          const sevOrder: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };
          return (sevOrder[b.severity] ?? 0) - (sevOrder[a.severity] ?? 0);
        })
        .slice(0, 30);

      setStats({
        totalRumination: rumRes.total,
        totalActivity: actRes.total,
        totalDrinking: 0,
        farmRisks,
        urgentAnimals,
      });
    }).catch(() => {});
  }, [farmIdsParam]);

  if (!stats) {
    return (
      <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--ct-text-muted)' }}>
        🌾 사료 효율 대시보드 로딩 중...
      </div>
    );
  }

  const highRiskFarms = stats.farmRisks.filter((f) => f.saraRiskScore >= 40);
  const saraRiskCount = stats.farmRisks.filter((f) => f.saraRiskScore >= 70).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── KPI ── */}
      <div style={{
        background: 'var(--ct-card)',
        border: '1px solid var(--ct-border)',
        borderRadius: 12,
        padding: '14px 18px',
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>
          🌾 사양 효율 모니터링 (최근 7일)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}>
          {[
            {
              label: '반추 저하',
              count: stats.totalRumination,
              color: stats.totalRumination > 20 ? '#ef4444' : stats.totalRumination > 5 ? '#f97316' : '#22c55e',
              icon: '🍃',
              sub: 'SARA 직접 지표',
            },
            {
              label: '활동 저하',
              count: stats.totalActivity,
              color: stats.totalActivity > 15 ? '#f97316' : '#eab308',
              icon: '🐄',
              sub: 'NEB(에너지 부족)',
            },
            {
              label: 'SARA 위험 농장',
              count: saraRiskCount,
              color: saraRiskCount > 0 ? '#ef4444' : '#22c55e',
              icon: '⚠️',
              sub: '즉시 TMR 검토',
            },
            {
              label: '사양 리스크 농장',
              count: highRiskFarms.length,
              color: highRiskFarms.length > 5 ? '#f97316' : '#eab308',
              icon: '🏚️',
              sub: '점수 40+ 농장',
            },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              textAlign: 'center',
              padding: '10px 6px',
              borderRadius: 8,
              background: kpi.count > 0 ? `${kpi.color}10` : 'var(--ct-bg)',
              border: `1px solid ${kpi.count > 0 ? kpi.color + '30' : 'var(--ct-border)'}`,
            }}>
              <div style={{ fontSize: 14, marginBottom: 2 }}>{kpi.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: kpi.count > 0 ? kpi.color : 'var(--ct-text-muted)' }}>
                {kpi.count}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>{kpi.label}</div>
              <div style={{ fontSize: 9, color: kpi.color, marginTop: 1, fontWeight: 600 }}>{kpi.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 탭 ── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--ct-border)' }}>
        {(['farms', 'animals', 'guide'] as const).map((tab) => {
          const labels: Record<string, string> = {
            farms: '🏚️ 농장별 SARA 위험도',
            animals: '🐄 이상 개체',
            guide: '📖 TMR 처방 가이드',
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 12px',
                fontSize: 11,
                fontWeight: activeTab === tab ? 800 : 500,
                color: activeTab === tab ? '#eab308' : 'var(--ct-text-muted)',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #eab308' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* ── 탭: 농장별 SARA 위험도 ── */}
      {activeTab === 'farms' && (
        <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
          {stats.farmRisks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--ct-text-muted)', fontSize: 13 }}>
              ✅ 모든 고객 농장 사양 이상 없음
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stats.farmRisks.map((farm, idx) => {
                const level = saraLevel(farm.saraRiskScore);
                return (
                  <div
                    key={farm.farmId}
                    onClick={() => onFarmClick?.(farm.farmId)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: level.bg,
                      border: `1px solid ${level.color}30`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    {/* 순위 */}
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: level.color, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, flexShrink: 0,
                    }}>
                      {idx + 1}
                    </div>
                    {/* 정보 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>{farm.farmName}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#ef4444' }}>반추↓ {farm.ruminationCount}두</span>
                        <span style={{ fontSize: 11, color: '#f97316' }}>활동↓ {farm.activityCount}두</span>
                        <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
                          {new Date(farm.latestAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} 최근
                        </span>
                      </div>
                    </div>
                    {/* SARA 점수 + 등급 */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: level.color }}>{farm.saraRiskScore}</div>
                      <div style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 4,
                        background: level.bg, color: level.color, fontWeight: 700,
                        border: `1px solid ${level.color}40`,
                      }}>
                        {level.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 탭: 이상 개체 ── */}
      {activeTab === 'animals' && (
        <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--ct-text-muted)' }}>
            심각도 순 정렬 · 클릭하면 개체 상세 이동
          </div>
          {stats.urgentAnimals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--ct-text-muted)', fontSize: 13 }}>
              ✅ 이상 개체 없음
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflowY: 'auto' }}>
              {stats.urgentAnimals.map((animal) => {
                const isRum = animal.eventType === 'rumination_decrease';
                const sevColors: Record<string, string> = {
                  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#6366f1',
                };
                const sevColor = sevColors[animal.severity] ?? '#6366f1';
                return (
                  <div
                    key={animal.eventId}
                    onClick={() => navigate(`/cow/${animal.animalId}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/cow/${animal.animalId}`); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: 'var(--ct-bg)',
                      border: `1px solid ${sevColor}30`,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: isRum ? 'rgba(239,68,68,0.1)' : 'rgba(249,115,22,0.1)',
                        color: isRum ? '#ef4444' : '#f97316',
                        fontWeight: 700,
                      }}>
                        {isRum ? '반추↓' : '활동↓'}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>#{animal.earTag}</span>
                      <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>{animal.farmName}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
                        {new Date(animal.detectedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </span>
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 4,
                        background: `${sevColor}15`, color: sevColor, fontWeight: 700,
                      }}>
                        {animal.severity}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 탭: TMR 처방 가이드 ── */}
      {activeTab === 'guide' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* SARA 판정 기준 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
            <h4 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 10px' }}>
              🧪 SARA(아급성 반추위 산증) 진단 기준
            </h4>
            {[
              { indicator: '반추 < 380 min/day', risk: '⚠️ SARA 의심', action: 'pH 측정 의뢰, NDF 비율 확인' },
              { indicator: '반추 < 300 min/day', risk: '🔴 SARA 확실', action: '즉시 TMR 고섬유질로 전환, 완충제 추가' },
              { indicator: '반추↓ + 발열 동반', risk: '🔴 BVD·SARA 합병', action: '수의사 진료 + TMR 검토 동시 진행' },
              { indicator: '반추↓ + 케토시스 이벤트', risk: '⚠️ 분만 후 NEB', action: 'PG 처치 + 에너지 보충제 투여' },
              { indicator: '활동 < 정상 40% 이하', risk: '⚠️ 전신 무력', action: 'BCS 측정, 에너지 사료 증량' },
            ].map((row, idx) => (
              <div key={idx} style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '2fr 1.5fr 2fr',
                gap: 6,
                padding: '8px 10px',
                borderRadius: 6,
                background: idx % 2 === 0 ? 'var(--ct-bg)' : 'transparent',
                marginBottom: 4,
              }}>
                <span style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>{row.indicator}</span>
                <span style={{ fontSize: 11, color: 'var(--ct-text)' }}>{row.risk}</span>
                <span style={{ fontSize: 11, color: '#eab308', fontWeight: 600 }}>{row.action}</span>
              </div>
            ))}
          </div>

          {/* TMR 처방 체크리스트 */}
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.2)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#eab308', marginBottom: 10 }}>
              📋 TMR 배합 변경 시 모니터링 프로토콜
            </div>
            {[
              'TMR 배합 변경 직후 7일간 반추 데이터 집중 모니터링',
              '변경 전 기준값 기록 → 변경 후 비교 (최소 ±15% 변동 감지 시 재검토)',
              'pH 측정: 반추↓ 지속 3일 이상 시 반추위액 pH 검사 의뢰',
              'NDF(중성세제불용섬유) 목표: 착유우 28~33%, 건유우 33~40%',
              '조사료 입자 크기: 팬 테스트(Penn State Particle Separator) 기준 충족 여부',
              '계절 전환 시 사료 성분 변동 보정 (여름: 낮은 섭취량 보정, 겨울: 에너지 증량)',
              '반추가 개선되지 않으면 완충제(탄산수소나트륨 0.75~1%) 추가 검토',
            ].map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#eab308', flexShrink: 0 }}>{idx + 1}.</span>
                <span style={{ fontSize: 11, color: 'var(--ct-text)', lineHeight: 1.6 }}>{item}</span>
              </div>
            ))}
          </div>

          {/* 영양 지표 해석 */}
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#6366f1', marginBottom: 8 }}>
              🌱 반추 데이터 해석 = 사료 처방의 근거
            </div>
            <div style={{ fontSize: 11, color: 'var(--ct-text)', lineHeight: 1.8 }}>
              <div>• 반추 시간은 TMR 조사료 품질의 직접적 지표</div>
              <div>• 반추 저하 → 소화기 산 부하 증가 → 사료 섭취량 감소 악순환</div>
              <div>• CowTalk 반추 알람 발생 즉시 해당 농장 담당자에게 TMR 재검토 요청</div>
              <div>• smaXtec 반추 데이터 정확도: ±5% 이내 (위내 센서 직접 측정)</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
