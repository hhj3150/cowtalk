// 소버린 AI 학습 현황 위젯 — 지식 강화 루프 진행 상태 시각화

import React, { useMemo } from 'react';
import type { SovereignAiStats } from '@cowtalk/shared';

// ── 상수 ──

const VERDICT_COLORS: Record<string, string> = {
  confirmed: '#22c55e',
  false_positive: '#ef4444',
  modified: '#eab308',
  missed: '#8b5cf6',
};

const VERDICT_LABELS: Record<string, string> = {
  confirmed: '정확',
  false_positive: '오탐',
  modified: '수정',
  missed: '미탐',
};

const ROLE_LABELS: Record<string, string> = {
  veterinarian: '수의사',
  government_admin: '행정',
  quarantine_officer: '방역',
  farmer: '농장주',
};

// ── AccuracyGauge ──

function AccuracyGauge({ rate, improvement }: {
  readonly rate: number;
  readonly improvement: number;
}): React.JSX.Element {
  const color = rate >= 85 ? '#22c55e' : rate >= 70 ? '#eab308' : '#ef4444';
  const improvementColor = improvement > 0 ? '#22c55e' : improvement < 0 ? '#ef4444' : '#94a3b8';
  const pct = Math.min(100, Math.max(0, rate));

  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto' }}>
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="8"
          />
          <circle
            cx="50" cy="50" r="42"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${pct * 2.64} ${264 - pct * 2.64}`}
            strokeDashoffset="66"
            style={{ transition: 'stroke-dasharray 1s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 22,
            fontWeight: 800,
            color,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {rate.toFixed(1)}
          </span>
          <span style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>%</span>
        </div>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ct-text-muted)' }}>
        AI 정확도
      </div>
      <div style={{ fontSize: 10, color: improvementColor, fontWeight: 600, marginTop: 2 }}>
        {improvement > 0 ? '↑' : improvement < 0 ? '↓' : '→'} {Math.abs(improvement).toFixed(1)}% (30일)
      </div>
    </div>
  );
}

// ── VerdictBar ──

function VerdictBar({ stats }: {
  readonly stats: SovereignAiStats;
}): React.JSX.Element {
  const total = stats.totalLabels || 1;

  const segments = [
    { key: 'confirmed', count: stats.confirmedCount },
    { key: 'modified', count: stats.modifiedCount },
    { key: 'false_positive', count: stats.falsePositiveCount },
    { key: 'missed', count: stats.missedCount },
  ];

  return (
    <div>
      {/* 바 */}
      <div style={{
        display: 'flex',
        height: 10,
        borderRadius: 5,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.05)',
      }}>
        {segments.map((s) => (
          <div
            key={s.key}
            style={{
              width: `${(s.count / total) * 100}%`,
              background: VERDICT_COLORS[s.key],
              transition: 'width 0.6s ease',
              minWidth: s.count > 0 ? 3 : 0,
            }}
          />
        ))}
      </div>

      {/* 범례 */}
      <div style={{
        display: 'flex',
        gap: 12,
        marginTop: 8,
        flexWrap: 'wrap',
      }}>
        {segments.map((s) => (
          <div key={s.key} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
          }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: 2,
              background: VERDICT_COLORS[s.key],
              display: 'inline-block',
            }} />
            <span style={{ color: 'var(--ct-text-muted)' }}>
              {VERDICT_LABELS[s.key]}
            </span>
            <span style={{ color: 'var(--ct-text-secondary)', fontWeight: 600 }}>
              {s.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DailyActivity ──

function DailyActivity({ counts }: {
  readonly counts: readonly { readonly date: string; readonly count: number }[];
}): React.JSX.Element {
  const maxCount = Math.max(...counts.map((c) => c.count), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 36 }}>
      {counts.slice(-14).map((c) => (
        <div
          key={c.date}
          title={`${c.date}: ${c.count}건`}
          style={{
            flex: 1,
            height: Math.max(2, (c.count / maxCount) * 32),
            background: c.count > 0 ? '#6366f1' : 'rgba(255,255,255,0.05)',
            borderRadius: 2,
            opacity: 0.7,
            transition: 'height 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

// ── 메인 ──

interface Props {
  readonly stats: SovereignAiStats;
  readonly onOpenLabelChat?: () => void;
}

export function SovereignAiWidget({ stats, onOpenLabelChat }: Props): React.JSX.Element {
  const roleLabels = useMemo(() => {
    return [...stats.labelsByRole].sort((a, b) => b.count - a.count);
  }, [stats.labelsByRole]);

  return (
    <div
      className="ct-fade-up"
      style={{
        background: 'var(--ct-card)',
        borderRadius: 14,
        border: '1px solid var(--ct-border)',
        padding: '18px 16px 14px',
      }}
    >
      {/* 헤더 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid var(--ct-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🌏</span>
          <div>
            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--ct-text)' }}>
              Sovereign AI Knowledge Loop
            </span>
            <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 1 }}>
              {stats.regionName} 지식 강화 현황
            </div>
          </div>
        </div>
        <span style={{
          fontSize: 22,
          fontWeight: 800,
          color: '#6366f1',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {stats.totalLabels.toLocaleString()}
        </span>
      </div>

      {/* 메인 콘텐츠 */}
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16 }}>
        {/* 좌측: 정확도 게이지 */}
        <AccuracyGauge rate={stats.accuracyRate} improvement={stats.improvementRate} />

        {/* 우측: 판정 분포 + 활동 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <VerdictBar stats={stats} />

          {/* 일별 활동 */}
          {stats.dailyLabelCounts.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginBottom: 4 }}>
                최근 14일 레이블 활동
              </div>
              <DailyActivity counts={stats.dailyLabelCounts} />
            </div>
          )}
        </div>
      </div>

      {/* 역할별 기여 */}
      {roleLabels.length > 0 && (
        <div style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: '1px solid var(--ct-border)',
        }}>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginBottom: 6 }}>
            역할별 기여
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {roleLabels.map((r) => (
              <div key={r.role} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
              }}>
                <span style={{ color: 'var(--ct-text-secondary)', fontWeight: 600 }}>
                  {ROLE_LABELS[r.role] ?? r.role}
                </span>
                <span style={{
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(99,102,241,0.15)',
                  color: '#6366f1',
                  fontWeight: 700,
                  fontSize: 10,
                }}>
                  {r.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 오분류 패턴 */}
      {stats.topMisclassifications.length > 0 && (
        <div style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--ct-border)',
        }}>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginBottom: 6 }}>
            주요 오분류 패턴 (학습 대상)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stats.topMisclassifications.slice(0, 3).map((m, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--ct-text-secondary)',
              }}>
                <span style={{ color: '#ef4444' }}>{m.predictedType}</span>
                <span style={{ color: 'var(--ct-text-muted)' }}>→</span>
                <span style={{ color: '#22c55e' }}>{m.actualType}</span>
                <span style={{
                  fontSize: 9,
                  padding: '1px 4px',
                  borderRadius: 3,
                  background: 'rgba(239,68,68,0.1)',
                  color: '#f97316',
                  fontWeight: 600,
                }}>
                  {m.count}건
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA 버튼 */}
      {onOpenLabelChat && (
        <button
          type="button"
          onClick={onOpenLabelChat}
          style={{
            width: '100%',
            marginTop: 14,
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid rgba(99,102,241,0.3)',
            background: 'rgba(99,102,241,0.1)',
            color: '#6366f1',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '-0.2px',
          }}
        >
          🧚 팅커벨 AI 현장 확인 → 지식 강화
        </button>
      )}
    </div>
  );
}
