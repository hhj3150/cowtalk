// 수의사 진료경로 최적화 위젯

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VetRoutePlan, VetRouteStop, VetRouteAnimalBriefing } from '@cowtalk/shared';

// ── 상수 ──

const URGENCY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

const URGENCY_LABELS: Record<string, string> = {
  critical: '긴급',
  high: '경계',
  medium: '주의',
  low: '정상',
};

const MAX_VISIBLE_STOPS = 8;

// ── 유틸 ──

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

function formatArrivalTime(minutes: number): string {
  const base = new Date();
  base.setHours(8, 30, 0, 0);
  const arrival = new Date(base.getTime() + minutes * 60 * 1000);
  return arrival.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function getUrgencyColor(level: string): string {
  return URGENCY_COLORS[level] ?? '#94a3b8';
}

// ── RouteSummaryBar ──

function RouteSummaryBar({ summary }: {
  readonly summary: VetRoutePlan['summary'];
}): React.JSX.Element {
  const chips: readonly { readonly label: string; readonly value: string; readonly color?: string }[] = [
    { label: '총 농장', value: `${summary.totalStops}개` },
    { label: '총 거리', value: `${summary.totalDistanceKm.toFixed(0)}km` },
    { label: '예상 시간', value: formatMinutes(summary.estimatedTotalTimeMinutes) },
    {
      label: '긴급 건',
      value: `${summary.criticalStops}건`,
      color: summary.criticalStops > 0 ? '#ef4444' : undefined,
    },
  ];

  return (
    <div style={{
      display: 'flex',
      gap: 8,
      marginBottom: 16,
      background: 'rgba(0,0,0,0.2)',
      borderRadius: 12,
      padding: '12px 8px',
    }}>
      {chips.map((chip, i) => (
        <React.Fragment key={chip.label}>
          {i > 0 && (
            <div style={{ width: 1, background: 'var(--ct-border)', margin: '4px 0' }} />
          )}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              fontSize: 20,
              fontWeight: 800,
              color: chip.color ?? 'var(--ct-primary)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.5px',
            }}>
              {chip.value}
            </div>
            <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 2 }}>
              {chip.label}
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ── AiBriefingBox ──

function AiBriefingBox({ text }: {
  readonly text: string;
}): React.JSX.Element {
  return (
    <div style={{
      borderLeft: '3px solid var(--ct-primary)',
      padding: '12px 14px',
      marginBottom: 18,
      background: 'rgba(0,214,126,0.04)',
      borderRadius: '0 10px 10px 0',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--ct-primary)',
        marginBottom: 6,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
      }}>
        AI 브리핑
      </div>
      <p style={{
        fontSize: 12,
        lineHeight: 1.7,
        color: 'var(--ct-text-secondary)',
        margin: 0,
      }}>
        {text}
      </p>
    </div>
  );
}

// ── AnimalBriefingCard ──

function AnimalBriefingCard({ animal }: {
  readonly animal: VetRouteAnimalBriefing;
}): React.JSX.Element {
  const color = getUrgencyColor(animal.severity);
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/cow/${animal.animalId}`)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.1)',
        fontSize: 11,
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>&#x1F404;</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontWeight: 700, color: 'var(--ct-text)', textDecoration: 'underline', textDecorationColor: 'var(--ct-border)' }}>
            {animal.earTag}
          </span>
          <span style={{
            fontSize: 9,
            padding: '1px 6px',
            borderRadius: 4,
            background: `${color}22`,
            color,
            fontWeight: 600,
          }}>
            {animal.issue}
          </span>
          {animal.daysActive > 1 && (
            <span style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>
              {animal.daysActive}일째
            </span>
          )}
        </div>
        <div style={{ color: 'var(--ct-text-secondary)', lineHeight: 1.5 }}>
          {animal.sensorSummary}
        </div>
        <div style={{ color: 'var(--ct-primary)', marginTop: 2, fontWeight: 600 }}>
          {animal.suggestedAction}
        </div>
      </div>
    </div>
  );
}

// ── RouteStopCard ──

function RouteStopCard({ stop, isLast, isExpanded, onToggle }: {
  readonly stop: VetRouteStop;
  readonly isLast: boolean;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  const color = getUrgencyColor(stop.urgencyLevel);
  const alarmsByType = stop.animalBriefings.reduce<Record<string, number>>((acc, b) => {
    return { ...acc, [b.issue]: (acc[b.issue] ?? 0) + 1 };
  }, {});
  const alarmSummary = Object.entries(alarmsByType)
    .map(([type, count]) => `${type} ${count}건`)
    .join(' | ');

  return (
    <div style={{ display: 'flex', gap: 14 }}>
      {/* 타임라인 도트 + 라인 */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: 28,
        flexShrink: 0,
      }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: `${color}22`,
          border: `2px solid ${color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 800,
          color,
          flexShrink: 0,
        }}>
          {stop.order}
        </div>
        {!isLast && (
          <div style={{
            flex: 1,
            width: 2,
            borderLeft: '2px dotted var(--ct-border)',
            marginTop: 4,
            minHeight: 20,
          }} />
        )}
      </div>

      {/* 카드 본체 */}
      <div style={{
        flex: 1,
        background: 'rgba(0,0,0,0.15)',
        borderRadius: 10,
        border: `1px solid ${color}33`,
        padding: 14,
        marginBottom: isLast ? 0 : 12,
      }}>
        {/* 헤더: 농장명 + 배지 + 점수 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ct-text)' }}>
              {stop.farmName}
            </span>
            <span style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 6,
              background: `${color}22`,
              color,
              fontWeight: 600,
            }}>
              {URGENCY_LABELS[stop.urgencyLevel] ?? stop.urgencyLevel}
            </span>
          </div>
          <span style={{
            fontSize: 16,
            fontWeight: 800,
            color,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {stop.urgencyScore}점
          </span>
        </div>

        {/* 알람 요약 */}
        {alarmSummary && (
          <div style={{
            fontSize: 11,
            color: 'var(--ct-text-secondary)',
            marginBottom: 8,
            paddingLeft: 2,
          }}>
            {alarmSummary}
          </div>
        )}

        {/* 메타 정보 */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: 11,
          color: 'var(--ct-text-muted)',
          marginBottom: 8,
        }}>
          {stop.distanceFromPrevKm > 0 && (
            <span>{stop.distanceFromPrevKm.toFixed(1)}km</span>
          )}
          <span>도착 {formatArrivalTime(stop.estimatedArrivalMinutes)}</span>
          <span>진료 {formatMinutes(stop.estimatedDurationMinutes)}</span>
          {stop.pendingTreatments > 0 && (
            <span style={{ color: '#f97316' }}>미처리 {stop.pendingTreatments}건</span>
          )}
        </div>

        {/* 동물 브리핑 토글 */}
        {stop.animalBriefings.length > 0 && (
          <>
            <button
              type="button"
              onClick={onToggle}
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
              {isExpanded
                ? '접기 \u25B2'
                : `동물 브리핑 (${stop.animalBriefings.length}두) \u25BC`}
            </button>

            {isExpanded && (
              <div style={{
                marginTop: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                {stop.animalBriefings.map((animal) => (
                  <AnimalBriefingCard key={animal.animalId} animal={animal} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── RouteTimeline ──

function RouteTimeline({ stops }: {
  readonly stops: readonly VetRouteStop[];
}): React.JSX.Element {
  const [expandedStops, setExpandedStops] = useState<ReadonlySet<number>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const visibleStops = showAll ? stops : stops.slice(0, MAX_VISIBLE_STOPS);
  const hasMore = stops.length > MAX_VISIBLE_STOPS;

  const handleToggle = (order: number): void => {
    setExpandedStops((prev) => {
      const next = new Set(prev);
      if (next.has(order)) {
        next.delete(order);
      } else {
        next.add(order);
      }
      return next;
    });
  };

  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--ct-text-muted)',
        marginBottom: 12,
        letterSpacing: '0.3px',
      }}>
        순회 경로
      </div>

      {visibleStops.map((stop, i) => (
        <RouteStopCard
          key={stop.farmId}
          stop={stop}
          isLast={i === visibleStops.length - 1 && (showAll || !hasMore)}
          isExpanded={expandedStops.has(stop.order)}
          onToggle={() => handleToggle(stop.order)}
        />
      ))}

      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          style={{
            display: 'block',
            margin: '12px auto 0',
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid var(--ct-border)',
            borderRadius: 8,
            padding: '8px 20px',
            color: 'var(--ct-text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          나머지 {stops.length - MAX_VISIBLE_STOPS}개 농장 더 보기
        </button>
      )}
    </div>
  );
}

// ── 메인 컴포넌트 ──

interface Props {
  readonly data: VetRoutePlan;
}

export function VetRouteWidget({ data }: Props): React.JSX.Element {
  const dateLabel = (() => {
    const d = new Date(data.date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  })();

  if (data.stops.length === 0) {
    return (
      <div
        className="ct-fade-up"
        style={{
          background: 'var(--ct-card)',
          borderRadius: 14,
          border: '1px solid var(--ct-border)',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>&#x1F690;</span>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ct-text)' }}>
            수의사 진료 경로 최적화
          </span>
        </div>
        <p style={{
          fontSize: 13,
          color: 'var(--ct-text-muted)',
          marginTop: 16,
          textAlign: 'center',
        }}>
          오늘 예정된 순회 경로가 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div
      className="ct-fade-up"
      style={{
        background: 'var(--ct-card)',
        borderRadius: 14,
        border: '1px solid var(--ct-border)',
        padding: '20px 20px 16px',
      }}
    >
      {/* ── 헤더 ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>&#x1F690;</span>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ct-text)', letterSpacing: '-0.3px' }}>
            수의사 진료 경로 최적화
          </span>
        </div>
        <span style={{
          fontSize: 12,
          color: 'var(--ct-text-muted)',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}>
          오늘 {dateLabel}
        </span>
      </div>

      {/* ── KPI 요약 ── */}
      <RouteSummaryBar summary={data.summary} />

      {/* ── AI 브리핑 ── */}
      {data.aiDayBriefing && <AiBriefingBox text={data.aiDayBriefing} />}

      {/* ── 타임라인 ── */}
      <RouteTimeline stops={data.stops} />
    </div>
  );
}
