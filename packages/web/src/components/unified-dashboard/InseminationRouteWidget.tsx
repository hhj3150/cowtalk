// 인공수정 경로 최적화 위젯

import React, { useState } from 'react';
import type {
  InseminationRoutePlan,
  InseminationRouteStop,
  InseminationAnimalBriefing,
} from '@cowtalk/shared';

// ── 상수 ──

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: '긴급',
  high: '우선',
  medium: '일반',
  low: '여유',
};

const INTENSITY_COLORS: Record<string, string> = {
  strong: '#ef4444',
  moderate: '#f97316',
  weak: '#eab308',
};

const INTENSITY_LABELS: Record<string, string> = {
  strong: '강한 발정',
  moderate: '보통 발정',
  weak: '약한 발정',
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
  base.setHours(8, 0, 0, 0); // 인공수정사는 8시 출발
  const arrival = new Date(base.getTime() + minutes * 60 * 1000);
  return arrival.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function getPriorityColor(level: string): string {
  return PRIORITY_COLORS[level] ?? '#94a3b8';
}

// ── RouteSummaryBar ──

function RouteSummaryBar({ summary }: {
  readonly summary: InseminationRoutePlan['summary'];
}): React.JSX.Element {
  const chips: readonly {
    readonly label: string;
    readonly value: string;
    readonly color?: string;
  }[] = [
    { label: '방문 농장', value: `${summary.totalStops}개` },
    { label: '발정두수', value: `${summary.totalEstrusAnimals}두` },
    { label: '총 거리', value: `${summary.totalDistanceKm.toFixed(0)}km` },
    {
      label: '적기 임박',
      value: `${summary.windowClosingSoonCount}두`,
      color: summary.windowClosingSoonCount > 0 ? '#ef4444' : undefined,
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
              color: chip.color ?? '#ec4899',
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
      borderLeft: '3px solid #ec4899',
      padding: '12px 14px',
      marginBottom: 18,
      background: 'rgba(236,72,153,0.04)',
      borderRadius: '0 10px 10px 0',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: '#ec4899',
        marginBottom: 6,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
      }}>
        AI 인공수정 브리핑
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

// ── WindowGauge — 수정 적기 잔여시간 바 ──

function WindowGauge({ hoursRemaining }: {
  readonly hoursRemaining: number;
}): React.JSX.Element {
  const maxHours = 18;
  const pct = Math.max(0, Math.min(100, (hoursRemaining / maxHours) * 100));
  const color = hoursRemaining <= 2 ? '#ef4444'
    : hoursRemaining <= 6 ? '#f97316'
    : '#22c55e';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <div style={{
        flex: 1,
        height: 4,
        background: 'rgba(255,255,255,0.1)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        color,
        fontVariantNumeric: 'tabular-nums',
        minWidth: 36,
        textAlign: 'right',
      }}>
        {hoursRemaining.toFixed(1)}h
      </span>
    </div>
  );
}

// ── AnimalBriefingCard ──

function AnimalBriefingCard({ animal }: {
  readonly animal: InseminationAnimalBriefing;
}): React.JSX.Element {
  const intensityColor = INTENSITY_COLORS[animal.estrusIntensity] ?? '#94a3b8';
  const isUrgent = animal.hoursRemaining <= 2;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '10px 12px',
      borderRadius: 8,
      background: isUrgent ? 'rgba(239,68,68,0.08)' : 'rgba(0,0,0,0.1)',
      border: isUrgent ? '1px solid rgba(239,68,68,0.2)' : 'none',
      fontSize: 11,
    }}>
      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>🐄</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 헤더: 이표 + 발정 강도 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontWeight: 700, color: 'var(--ct-text)' }}>
            {animal.earTag}
          </span>
          <span style={{
            fontSize: 9,
            padding: '1px 6px',
            borderRadius: 4,
            background: `${intensityColor}22`,
            color: intensityColor,
            fontWeight: 600,
          }}>
            {INTENSITY_LABELS[animal.estrusIntensity] ?? animal.estrusIntensity}
          </span>
          {animal.lactationNumber > 0 && (
            <span style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>
              {animal.lactationNumber}산차
            </span>
          )}
          {animal.previousInseminationCount > 0 && (
            <span style={{ fontSize: 9, color: '#f97316' }}>
              재수정 {animal.previousInseminationCount}회
            </span>
          )}
        </div>

        {/* 수정 적기 게이지 */}
        <WindowGauge hoursRemaining={animal.hoursRemaining} />

        {/* 센서 데이터 요약 */}
        <div style={{
          display: 'flex',
          gap: 12,
          marginTop: 6,
          fontSize: 10,
          color: 'var(--ct-text-muted)',
        }}>
          <span>활동량 +{animal.activityIncreasePct}%</span>
          <span>체온 {animal.temperatureDelta > 0 ? '+' : ''}{animal.temperatureDelta.toFixed(1)}℃</span>
          {animal.daysSinceLastCalving > 0 && (
            <span>분만 후 {animal.daysSinceLastCalving}일</span>
          )}
        </div>

        {/* 추천 정액 + 액션 */}
        <div style={{
          marginTop: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          <div style={{ color: '#ec4899', fontWeight: 600 }}>
            💉 {animal.suggestedSemen}
          </div>
          <div style={{ color: 'var(--ct-primary)', fontWeight: 600 }}>
            → {animal.suggestedAction}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── RouteStopCard ──

function RouteStopCard({ stop, isLast, isExpanded, onToggle }: {
  readonly stop: InseminationRouteStop;
  readonly isLast: boolean;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}): React.JSX.Element {
  const color = getPriorityColor(stop.priorityLevel);

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
        {/* 헤더 */}
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
              {PRIORITY_LABELS[stop.priorityLevel] ?? stop.priorityLevel}
            </span>
            {stop.windowClosingSoonCount > 0 && (
              <span style={{
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(239,68,68,0.15)',
                color: '#ef4444',
                fontWeight: 700,
                animation: 'ct-pulse 2s ease-in-out infinite',
              }}>
                ⏰ 적기 임박 {stop.windowClosingSoonCount}두
              </span>
            )}
          </div>
          <span style={{
            fontSize: 16,
            fontWeight: 800,
            color,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {stop.priorityScore}점
          </span>
        </div>

        {/* 발정 요약 */}
        <div style={{
          fontSize: 11,
          color: 'var(--ct-text-secondary)',
          marginBottom: 8,
          paddingLeft: 2,
        }}>
          발정 감지 {stop.totalEstrusAnimals}두
        </div>

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
          <span>수정 {formatMinutes(stop.estimatedDurationMinutes)}</span>
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
                color: '#ec4899',
                fontSize: 11,
                cursor: 'pointer',
                padding: 0,
                fontWeight: 600,
              }}
            >
              {isExpanded
                ? '접기 ▲'
                : `수정 대상 (${stop.animalBriefings.length}두) ▼`}
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
  readonly stops: readonly InseminationRouteStop[];
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
        인공수정 순회 경로
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
  readonly data: InseminationRoutePlan;
}

export function InseminationRouteWidget({ data }: Props): React.JSX.Element {
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
          <span style={{ fontSize: 18 }}>💉</span>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ct-text)' }}>
            인공수정 경로 최적화
          </span>
        </div>
        <p style={{
          fontSize: 13,
          color: 'var(--ct-text-muted)',
          marginTop: 16,
          textAlign: 'center',
        }}>
          오늘 인공수정이 필요한 발정 감지 동물이 없습니다.
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
          <span style={{ fontSize: 18 }}>💉</span>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ct-text)', letterSpacing: '-0.3px' }}>
            인공수정 경로 최적화
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
      {data.aiBriefing && <AiBriefingBox text={data.aiBriefing} />}

      {/* ── 타임라인 ── */}
      <RouteTimeline stops={data.stops} />
    </div>
  );
}
