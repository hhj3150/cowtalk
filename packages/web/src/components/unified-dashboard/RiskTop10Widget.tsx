// AI 예측 위험 TOP 10 — 72시간 건강 이벤트 기반 개체별 위험도 순위

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '@web/api/client';

// ── 타입 ──

interface RiskAnimal {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly riskScore: number;
  readonly riskLevel: 'critical' | 'warning' | 'caution' | 'normal';
  readonly alertCount: number;
  readonly criticalCount: number;
  readonly latestEventType: string;
  readonly latestEventLabel: string;
  readonly latestAt: string;
}

interface RiskTop10Response {
  readonly rankings: readonly RiskAnimal[];
  readonly total: number;
}

interface Props {
  readonly farmId?: string | null;
  readonly onAnimalClick?: (animalId: string) => void;
}

// ── 유틸 ──

const RISK_COLORS: Readonly<Record<string, string>> = {
  critical: '#ef4444',
  warning: '#f97316',
  caution: '#eab308',
  normal: '#22c55e',
};

const RISK_LABELS: Readonly<Record<string, string>> = {
  critical: '위험',
  warning: '주의',
  caution: '관찰',
  normal: '정상',
};

function formatTimeAgo(iso: string): string {
  if (!iso) return '';
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

// ── 메인 컴포넌트 ──

export function RiskTop10Widget({ farmId, onAnimalClick }: Props): React.JSX.Element {
  const [data, setData] = useState<RiskTop10Response | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const query = farmId ? `?farmId=${farmId}` : '';
    apiGet<RiskTop10Response>(`/unified-dashboard/risk-top10${query}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [farmId]);

  const rankings = data?.rankings ?? [];

  return (
    <div style={{
      background: 'var(--ct-card)',
      border: '1px solid var(--ct-border)',
      borderRadius: 12,
      padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)', margin: 0 }}>
          🚨 AI 예측 위험 TOP 10 (72시간)
        </h3>
        <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
          건강 이벤트 기반
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{
            width: 16, height: 16, border: '2px solid var(--ct-primary)',
            borderTopColor: 'transparent', borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
        </div>
      ) : rankings.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '24px 0',
          color: 'var(--ct-text-secondary)', fontSize: 13,
        }}>
          ✅ 72시간 내 위험 개체가 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 420, overflowY: 'auto' }}>
          {rankings.map((animal, index) => {
            const color = RISK_COLORS[animal.riskLevel] ?? '#22c55e';
            const label = RISK_LABELS[animal.riskLevel] ?? '정상';

            return (
              <button
                key={animal.animalId}
                type="button"
                onClick={() => onAnimalClick?.(animal.animalId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8,
                  background: index < 3 ? `${color}10` : 'transparent',
                  border: index < 3 ? `1px solid ${color}30` : '1px solid transparent',
                  cursor: onAnimalClick ? 'pointer' : 'default',
                  width: '100%', textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `${color}15`; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = index < 3 ? `${color}10` : 'transparent'; }}
              >
                {/* 순위 */}
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  fontSize: 11, fontWeight: 800,
                  background: index < 3 ? color : 'var(--ct-border)',
                  color: index < 3 ? '#fff' : 'var(--ct-text-secondary)',
                }}>
                  {index + 1}
                </span>

                {/* 소 정보 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); navigate(`/cow/${animal.animalId}`); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/cow/${animal.animalId}`); }}
                      style={{
                        fontSize: 12, fontWeight: 700, color: 'var(--ct-primary)',
                        textDecoration: 'underline', textUnderlineOffset: '2px',
                        cursor: 'pointer',
                      }}
                      title="개체 프로필 보기"
                    >
                      {animal.earTag}번
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
                      {animal.farmName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--ct-text-secondary)' }}>
                      {animal.latestEventLabel}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>
                      {formatTimeAgo(animal.latestAt)}
                    </span>
                  </div>
                </div>

                {/* 위험 점수 바 */}
                <div style={{ width: 60, flexShrink: 0 }}>
                  <div style={{
                    height: 6, borderRadius: 3, background: 'var(--ct-border)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 3, background: color,
                      width: `${animal.riskScore}%`, transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ fontSize: 9, textAlign: 'center', marginTop: 2, color, fontWeight: 700 }}>
                    {animal.riskScore}점
                  </div>
                </div>

                {/* 위험 등급 뱃지 */}
                <span style={{
                  flexShrink: 0, padding: '2px 8px', borderRadius: 4,
                  fontSize: 10, fontWeight: 700,
                  background: `${color}20`, color,
                }}>
                  {label}
                </span>

                {/* 드릴다운 */}
                {onAnimalClick && (
                  <span style={{ fontSize: 12, color: 'var(--ct-primary)', flexShrink: 0 }}>›</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
