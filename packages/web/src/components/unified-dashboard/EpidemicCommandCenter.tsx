// 역학 감시 커맨드센터 — 체온 상승 중심 전국 전염병 조기경보 위젯
// 산출 기준:
//   1차 지표: temperature_high (발열) — 전염성 질병의 최초 생체 신호
//   2차 지표: rumination_decrease (반추 감소) — 발열 후 2~4일 뒤 동반 발현 시 질병 진행 확인
//   근거: smaXtec 연구 — 체온은 모든 파라미터 중 가장 먼저 변화
//   제외: 활동량, 발정, 분만, 음수, 수정 → 전염성 질병 역학과 무관

import React, { useState, useEffect } from 'react';
import {
  Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart, Line,
} from 'recharts';
import { fetchEpidemicDrilldown } from '@web/api/unified-dashboard.api';
import type { EpidemicDrilldownData, EpidemicDrilldownAnimal } from '@web/api/unified-dashboard.api';

// ── 타입 ──

interface ClusterFarm {
  readonly farmId: string;
  readonly name: string;
  readonly healthAlarmRate: number;
  readonly tempAnomalyRate: number;
  readonly headCount: number;
  readonly alarmCount: number;
  readonly feverCount?: number;
  readonly comorbidCount?: number;
}

interface Cluster {
  readonly clusterId: string;
  readonly center: { readonly lat: number; readonly lng: number };
  readonly riskLevel: string;
  readonly affectedFarms: readonly ClusterFarm[];
  readonly dominantAlarmType: string;
  readonly trend: 'rising' | 'stable' | 'declining';
  readonly firstDetected: string;
  readonly estimatedSpreadVelocity: number;
  readonly recommendation: string;
}

interface NationalSummary {
  readonly totalFarmsMonitored: number;
  readonly farmsWithAnomalies: number;
  readonly anomalyRate: number;
  readonly topAlarmTypes: readonly { readonly type: string; readonly count: number }[];
  readonly last24hTrend: 'rising' | 'stable' | 'declining';
}

interface TimelinePoint {
  readonly hour: string;
  readonly alarmCount: number;
  readonly farmCount: number;
  readonly riskScore: number;
}

interface Escalation {
  readonly level: 'farm' | 'regional' | 'national';
  readonly reason: string;
  readonly suggestedActions: readonly string[];
}

export interface EpidemicIntelligence {
  readonly overallRiskLevel: 'low' | 'moderate' | 'high' | 'critical';
  readonly riskScore: number;
  readonly clusters: readonly Cluster[];
  readonly nationalSummary: NationalSummary;
  readonly timeline: readonly TimelinePoint[];
  readonly escalation: Escalation;
}

interface Props {
  readonly data: EpidemicIntelligence;
  readonly height?: number;
  readonly onAnimalClick?: (animalId: string) => void;
}

// ── 상수 ──

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  moderate: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

const RISK_LABELS: Record<string, string> = {
  low: '안전',
  moderate: '관심',
  high: '주의',
  critical: '경계',
};

const TREND_ICONS: Record<string, string> = {
  rising: '↗',
  stable: '→',
  declining: '↘',
};

const TREND_LABELS: Record<string, string> = {
  rising: '상승',
  stable: '유지',
  declining: '하락',
};

const TREND_COLORS: Record<string, string> = {
  rising: '#ef4444',
  stable: '#eab308',
  declining: '#22c55e',
};

const ESCALATION_LABELS: Record<string, string> = {
  farm: '농장 단위',
  regional: '지역 단위',
  national: '전국 단위',
};

const ESCALATION_COLORS: Record<string, string> = {
  farm: '#22c55e',
  regional: '#f97316',
  national: '#ef4444',
};

const ALARM_TYPE_LABELS: Record<string, string> = {
  temperature_high: '🌡️ 고체온',
  rumination_decrease: '🔄 반추↓',
  '체온+반추 동반': '⚠️ 동반',
};

// ── 유틸 ──

function formatHour(val: string): string {
  const d = new Date(val);
  return `${d.getHours()}시`;
}

function getRiskColor(level: string): string {
  return RISK_COLORS[level] ?? '#94a3b8';
}

function getFarmRiskLevel(tempAnomalyRate: number): string {
  if (tempAnomalyRate >= 0.15) return 'critical';
  if (tempAnomalyRate >= 0.10) return 'high';
  if (tempAnomalyRate >= 0.05) return 'moderate';
  return 'low';
}

// ── 리스크 게이지 ──

function RiskGauge({ score, level }: {
  readonly score: number;
  readonly level: string;
}): React.JSX.Element {
  const color = getRiskColor(level);
  const circumference = 2 * Math.PI * 40;
  const filled = (score / 100) * circumference * 0.75;

  return (
    <div style={{ position: 'relative', width: 96, height: 72 }}>
      <svg viewBox="0 0 100 70" width={96} height={72}>
        <circle
          cx={50} cy={55} r={40}
          fill="none"
          stroke="var(--ct-border)"
          strokeWidth={6}
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform="rotate(135 50 55)"
        />
        <circle
          cx={50} cy={55} r={40}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform="rotate(135 50 55)"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute',
        bottom: 4,
        left: 0,
        right: 0,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
          {score}
        </div>
      </div>
    </div>
  );
}

// ── KPI 미니 카드 ──

function KpiMiniCard({ label, value, sub, color }: {
  readonly label: string;
  readonly value: string | number;
  readonly sub?: string;
  readonly color?: string;
}): React.JSX.Element {
  return (
    <div style={{
      flex: 1,
      background: 'rgba(0,0,0,0.2)',
      borderRadius: 10,
      padding: '14px 12px',
      textAlign: 'center',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginBottom: 6, whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{
        fontSize: 20,
        fontWeight: 800,
        color: color ?? 'var(--ct-text)',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.5px',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── 타임라인 툴팁 ──

function TimelineTooltip({
  active,
  payload,
  label,
}: {
  readonly active?: boolean;
  readonly payload?: readonly { readonly dataKey: string; readonly value: number; readonly color: string }[];
  readonly label?: string;
}): React.JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid var(--ct-border)',
      borderRadius: 8,
      padding: '8px 12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      minWidth: 130,
    }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{label}</div>
      {payload.map((entry) => {
        const labels: Record<string, string> = {
          riskScore: '위험도',
          alarmCount: '발열 알림 수',
          farmCount: '발열 농장 수',
        };
        return (
          <div key={entry.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 2 }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{labels[entry.dataKey] ?? entry.dataKey}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc' }}>{entry.value}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── 개체 드릴다운 모달 ──

function AnimalDrilldownModal({
  farmId,
  onClose,
  onAnimalClick,
}: {
  readonly farmId: string;
  readonly onClose: () => void;
  readonly onAnimalClick?: (animalId: string) => void;
}): React.JSX.Element {
  const [data, setData] = useState<EpidemicDrilldownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEpidemicDrilldown(farmId)
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [farmId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--ct-card)',
          border: '1px solid var(--ct-border)',
          borderRadius: 16,
          width: 'min(580px, 90vw)',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
        }}
      >
        {/* 헤더 */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--ct-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ct-text)' }}>
              🌡️ {data?.farmName ?? '로딩 중...'}
            </div>
            {data && (
              <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 4 }}>
                전체 {data.headCount}두 · 발열 {data.feverCount}두 ({data.feverRate}%)
                {data.comorbidCount > 0 && (
                  <span style={{ color: '#ef4444', fontWeight: 700 }}>
                    {' '}· 동반 {data.comorbidCount}두
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ct-text-muted)',
              fontSize: 18,
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div style={{
          overflowY: 'auto',
          padding: '12px 20px 20px',
          flex: 1,
        }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ct-text-muted)' }}>
              로딩 중...
            </div>
          )}
          {error && (
            <div style={{ textAlign: 'center', padding: 40, color: '#ef4444' }}>
              오류: {error}
            </div>
          )}
          {data && data.animals.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ct-text-muted)' }}>
              48시간 내 발열/반추감소 이벤트 없음
            </div>
          )}
          {data && data.animals.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* 범례 */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 10, color: 'var(--ct-text-muted)' }}>
                <span>🔴 발열+반추 동반 (질병 진행)</span>
                <span>🟠 발열만</span>
                <span>🟡 반추감소만</span>
              </div>

              {data.animals.map((animal) => (
                <AnimalRow
                  key={animal.animalId}
                  animal={animal}
                  onAnimalClick={onAnimalClick}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnimalRow({
  animal,
  onAnimalClick,
}: {
  readonly animal: EpidemicDrilldownAnimal;
  readonly onAnimalClick?: (animalId: string) => void;
}): React.JSX.Element {
  const isComorbid = animal.hasFever && animal.hasRuminationDrop;
  const statusColor = isComorbid ? '#ef4444' : animal.hasFever ? '#f97316' : '#eab308';
  const statusLabel = isComorbid ? '발열+반추↓' : animal.hasFever ? '발열' : '반추↓';

  return (
    <button
      type="button"
      onClick={() => onAnimalClick?.(animal.animalId)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderRadius: 8,
        background: isComorbid ? 'rgba(239,68,68,0.08)' : 'rgba(0,0,0,0.1)',
        border: `1px solid ${isComorbid ? 'rgba(239,68,68,0.2)' : 'transparent'}`,
        fontSize: 12,
        cursor: onAnimalClick ? 'pointer' : 'default',
        width: '100%',
        textAlign: 'left',
        color: 'var(--ct-text)',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = isComorbid ? 'rgba(239,68,68,0.14)' : 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={(e) => { (e.target as HTMLElement).style.background = isComorbid ? 'rgba(239,68,68,0.08)' : 'rgba(0,0,0,0.1)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: statusColor,
          flexShrink: 0,
          boxShadow: isComorbid ? `0 0 6px ${statusColor}80` : 'none',
        }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            {animal.earTag}
            {animal.animalName && (
              <span style={{ fontWeight: 400, color: 'var(--ct-text-muted)', marginLeft: 6 }}>
                {animal.animalName}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 2 }}>
            이벤트 {animal.eventCount}건 · {new Date(animal.latestDetectedAt).toLocaleString('ko-KR', {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 10,
          padding: '3px 8px',
          borderRadius: 6,
          background: `${statusColor}22`,
          color: statusColor,
          fontWeight: 700,
        }}>
          {statusLabel}
        </span>
        {onAnimalClick && (
          <span style={{ fontSize: 11, color: 'var(--ct-primary)', fontWeight: 600 }}>
            소버린 →
          </span>
        )}
      </div>
    </button>
  );
}

// ── 통합 영향 농장 패널 (클러스터 없이 통합) ──

function UnifiedFarmPanel({
  clusters,
  onFarmClick,
}: {
  readonly clusters: readonly Cluster[];
  readonly onFarmClick: (farmId: string) => void;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  // 모든 클러스터의 농장을 통합하고, 중복 제거 (farmId 기준, 이상률 높은 쪽 우선)
  const allFarmsMap = new Map<string, ClusterFarm & { readonly riskLevel: string }>();
  for (const cluster of clusters) {
    for (const farm of cluster.affectedFarms) {
      const existing = allFarmsMap.get(farm.farmId);
      if (!existing || farm.tempAnomalyRate > existing.tempAnomalyRate) {
        allFarmsMap.set(farm.farmId, { ...farm, riskLevel: getFarmRiskLevel(farm.tempAnomalyRate) });
      }
    }
  }
  // 발열 비율 내림차순 정렬 + 발열 없는 농장 제외
  const allFarms = [...allFarmsMap.values()]
    .filter((f) => f.tempAnomalyRate > 0 || (f.feverCount ?? 0) > 0)
    .sort((a, b) => b.tempAnomalyRate - a.tempAnomalyRate);

  if (allFarms.length === 0) {
    return (
      <div style={{
        background: 'rgba(0,0,0,0.15)',
        borderRadius: 10,
        padding: '20px 14px',
        textAlign: 'center',
        color: 'var(--ct-text-muted)',
        fontSize: 12,
      }}>
        48시간 내 발열 이상 농장 없음 — 정상 범위
      </div>
    );
  }

  const totalFever = allFarms.reduce((sum, f) => sum + (f.feverCount ?? f.alarmCount), 0);
  const totalComorbid = allFarms.reduce((sum, f) => sum + (f.comorbidCount ?? 0), 0);
  const totalHead = allFarms.reduce((sum, f) => sum + f.headCount, 0);

  // 추천사항 통합
  const recommendations = [...new Set(clusters.map((c) => c.recommendation))];

  return (
    <div style={{
      background: 'rgba(0,0,0,0.15)',
      borderRadius: 10,
      padding: 14,
    }}>
      {/* 요약 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>🌡️</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>
            발열 감시 현황
          </span>
          <span style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 6,
            background: 'rgba(239,68,68,0.15)',
            color: '#ef4444',
            fontWeight: 600,
          }}>
            {allFarms.length}개 농장
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--ct-text-secondary)' }}>
          <span>총 <strong style={{ color: 'var(--ct-text)' }}>{totalHead.toLocaleString()}두</strong></span>
          <span>발열 <strong style={{ color: '#ef4444' }}>{totalFever}두</strong></span>
          {totalComorbid > 0 && (
            <span>동반 <strong style={{ color: '#ef4444' }}>{totalComorbid}두</strong></span>
          )}
        </div>
      </div>

      {/* 산출 기준 뱃지 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{
          fontSize: 10, padding: '3px 10px', borderRadius: 6,
          background: 'rgba(239,68,68,0.1)', color: '#f87171',
        }}>
          🌡️ 경계: 두수의 15%+ 발열
        </span>
        <span style={{
          fontSize: 10, padding: '3px 10px', borderRadius: 6,
          background: 'rgba(249,115,22,0.1)', color: '#fb923c',
        }}>
          ⚡ 주의: 10%+ 발열
        </span>
        <span style={{
          fontSize: 10, padding: '3px 10px', borderRadius: 6,
          background: 'rgba(234,179,8,0.1)', color: '#facc15',
        }}>
          👁️ 관심: 5%+ 발열
        </span>
      </div>

      {/* 추천사항 */}
      {recommendations.length > 0 && (
        <div style={{
          fontSize: 12,
          color: 'var(--ct-text-secondary)',
          lineHeight: 1.6,
          padding: '8px 10px',
          background: 'rgba(0,0,0,0.15)',
          borderRadius: 8,
          marginBottom: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          {recommendations.map((rec) => (
            <div key={rec}>• {rec}</div>
          ))}
        </div>
      )}

      {/* 농장 목록 토글 */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--ct-primary)',
          fontSize: 11,
          cursor: 'pointer',
          padding: 0,
          fontWeight: 600,
        }}
      >
        {expanded ? '접기 ▲' : `농장별 발열 현황 보기 (${allFarms.length}개) ▼`}
      </button>

      {expanded && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {allFarms.map((farm) => {
            const farmRiskColor = getRiskColor(farm.riskLevel);
            const feverRate = (farm.tempAnomalyRate * 100).toFixed(1);
            const hasComorbid = (farm.comorbidCount ?? 0) > 0;

            return (
              <button
                key={farm.farmId}
                type="button"
                onClick={() => onFarmClick(farm.farmId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: hasComorbid ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.1)',
                  border: `1px solid ${hasComorbid ? 'rgba(239,68,68,0.15)' : 'transparent'}`,
                  fontSize: 11,
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  color: 'var(--ct-text)',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: farmRiskColor,
                    flexShrink: 0,
                    boxShadow: `0 0 4px ${farmRiskColor}60`,
                  }} />
                  <span style={{ fontWeight: 600 }}>{farm.name}</span>
                  <span style={{
                    fontSize: 9,
                    padding: '1px 5px',
                    borderRadius: 4,
                    background: `${farmRiskColor}22`,
                    color: farmRiskColor,
                    fontWeight: 700,
                  }}>
                    {RISK_LABELS[farm.riskLevel]}
                  </span>
                  {hasComorbid && (
                    <span style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: 'rgba(239,68,68,0.15)',
                      color: '#ef4444',
                      fontWeight: 700,
                    }}>
                      동반 {farm.comorbidCount}두
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ct-text-secondary)' }}>
                  <span>{farm.headCount}두</span>
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>
                    발열 {feverRate}%
                  </span>
                  <span style={{ color: 'var(--ct-primary)', fontWeight: 600 }}>
                    상세 →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ──

export function EpidemicCommandCenter({ data, height = 220, onAnimalClick }: Props): React.JSX.Element {
  const [drilldownFarmId, setDrilldownFarmId] = useState<string | null>(null);
  const riskColor = getRiskColor(data.overallRiskLevel);
  const isCritical = data.overallRiskLevel === 'critical';
  const summary = data.nationalSummary;
  const trendColor = TREND_COLORS[summary.last24hTrend] ?? '#94a3b8';

  return (
    <div
      className={`ct-fade-up${isCritical ? ' ct-pulse-critical' : ''}`}
      style={{
        background: 'var(--ct-card)',
        borderRadius: 14,
        border: `1px solid ${riskColor}44`,
        padding: '20px 20px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 좌상단 그로우 */}
      {isCritical && (
        <div style={{
          position: 'absolute',
          top: -60,
          right: -60,
          width: 160,
          height: 160,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${riskColor}15, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}

      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🛡️</span>
          <div>
            <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ct-text)', letterSpacing: '-0.3px' }}>
              역학 감시 커맨드센터
            </span>
            <div style={{ fontSize: 9, color: 'var(--ct-text-muted)', marginTop: 2 }}>
              기준: 체온상승(1차) + 반추감소(2차 동반확인)
            </div>
          </div>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '4px 12px',
          borderRadius: 8,
          background: `${riskColor}22`,
          color: riskColor,
          border: `1px solid ${riskColor}44`,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }}>
          {RISK_LABELS[data.overallRiskLevel]} ({data.riskScore}점)
        </span>
      </div>

      {/* ── KPI 카드 4개 ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        <div style={{
          flex: 1,
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 10,
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minWidth: 0,
        }}>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginBottom: 4 }}>전국 위험도</div>
          <RiskGauge score={data.riskScore} level={data.overallRiskLevel} />
        </div>

        <KpiMiniCard
          label="발열 이상 농장"
          value={`${summary.farmsWithAnomalies} / ${summary.totalFarmsMonitored}`}
          sub={`이상률 ${summary.anomalyRate}%`}
          color={summary.farmsWithAnomalies > 5 ? '#f97316' : 'var(--ct-text)'}
        />

        <KpiMiniCard
          label="24시간 추세"
          value={`${TREND_ICONS[summary.last24hTrend]} ${TREND_LABELS[summary.last24hTrend]}`}
          color={trendColor}
        />

        <KpiMiniCard
          label="경보 단계"
          value={ESCALATION_LABELS[data.escalation.level] ?? data.escalation.level}
          sub={data.escalation.reason}
          color={ESCALATION_COLORS[data.escalation.level] ?? 'var(--ct-text)'}
        />
      </div>

      {/* ── 알림 유형 요약 (체온 중심) ── */}
      {summary.topAlarmTypes.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {summary.topAlarmTypes.map((t) => (
            <span key={t.type} style={{
              fontSize: 11,
              padding: '5px 12px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.2)',
              color: 'var(--ct-text-secondary)',
              fontWeight: 600,
            }}>
              {ALARM_TYPE_LABELS[t.type] ?? t.type}{' '}
              <strong style={{ color: t.type === 'temperature_high' ? '#ef4444' : 'var(--ct-text)' }}>
                {t.count}건
              </strong>
            </span>
          ))}
        </div>
      )}

      {/* ── 48시간 타임라인 ── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginBottom: 8, fontWeight: 600 }}>
          48시간 발열 위험도 타임라인
        </div>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data.timeline as unknown as Record<string, unknown>[]}>
            <defs>
              <linearGradient id="epidemic-risk-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={riskColor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={riskColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" strokeOpacity={0.3} vertical={false} />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 9, fill: 'var(--ct-text-muted)' }}
              tickFormatter={formatHour}
              stroke="var(--ct-border)"
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="risk"
              orientation="left"
              tick={{ fontSize: 9, fill: 'var(--ct-text-muted)' }}
              stroke="var(--ct-border)"
              tickLine={false}
              axisLine={false}
              domain={[0, 100]}
              label={{ value: '위험도', angle: -90, position: 'insideLeft', style: { fontSize: 9, fill: 'var(--ct-text-muted)' } }}
            />
            <YAxis
              yAxisId="count"
              orientation="right"
              tick={{ fontSize: 9, fill: 'var(--ct-text-muted)' }}
              stroke="var(--ct-border)"
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              label={{ value: '발열 수', angle: 90, position: 'insideRight', style: { fontSize: 9, fill: 'var(--ct-text-muted)' } }}
            />
            <Tooltip content={<TimelineTooltip />} />
            <Area
              yAxisId="risk"
              type="monotone"
              dataKey="riskScore"
              fill="url(#epidemic-risk-gradient)"
              stroke={riskColor}
              strokeWidth={2}
              dot={false}
              animationDuration={1200}
            />
            <Bar
              yAxisId="count"
              dataKey="alarmCount"
              fill="rgba(239,68,68,0.3)"
              radius={[3, 3, 0, 0]}
              animationDuration={1200}
              barSize={8}
            />
            <Line
              yAxisId="count"
              type="monotone"
              dataKey="farmCount"
              stroke="#818cf8"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 4"
              animationDuration={1200}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── 영향 농장 통합 현황 ── */}
      {data.clusters.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginBottom: 10, fontWeight: 600 }}>
            발열 감시 농장 현황 (클릭하여 개체 확인)
          </div>
          <UnifiedFarmPanel
            clusters={data.clusters}
            onFarmClick={(farmId) => setDrilldownFarmId(farmId)}
          />
        </div>
      )}

      {/* ── 에스컬레이션 권장사항 ── */}
      {data.escalation.suggestedActions.length > 0 && (
        <div style={{
          marginTop: 16,
          padding: '12px 14px',
          background: `${ESCALATION_COLORS[data.escalation.level] ?? '#94a3b8'}11`,
          borderRadius: 10,
          border: `1px solid ${ESCALATION_COLORS[data.escalation.level] ?? '#94a3b8'}33`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: ESCALATION_COLORS[data.escalation.level] ?? 'var(--ct-text)', marginBottom: 8 }}>
            권장 조치
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {data.escalation.suggestedActions.map((action, i) => (
              <div key={i} style={{
                fontSize: 12,
                color: 'var(--ct-text-secondary)',
                lineHeight: 1.6,
                paddingLeft: 14,
                position: 'relative',
              }}>
                <span style={{
                  position: 'absolute',
                  left: 0,
                  top: 6,
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: ESCALATION_COLORS[data.escalation.level] ?? '#94a3b8',
                  opacity: 0.6,
                }} />
                {action}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 개체 드릴다운 모달 ── */}
      {drilldownFarmId && (
        <AnimalDrilldownModal
          farmId={drilldownFarmId}
          onClose={() => setDrilldownFarmId(null)}
          onAnimalClick={onAnimalClick}
        />
      )}
    </div>
  );
}
