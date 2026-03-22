// 번식성적 커맨드센터 — Kanban 파이프라인 + KPI + 긴급 조치

import React, { useState } from 'react';
import type {
  BreedingPipelineData,
  BreedingKpis,
  BreedingStageGroup,
  BreedingUrgentAction,
  BreedingStage,
} from '@cowtalk/shared';

// ── Constants ──

const STAGE_COLORS: Record<BreedingStage, string> = {
  open: '#94a3b8',
  estrus_detected: '#ef4444',
  inseminated: '#f97316',
  pregnancy_confirmed: '#22c55e',
  late_gestation: '#3b82f6',
  calving_expected: '#8b5cf6',
} as const;

const STAGE_LABELS: Record<BreedingStage, string> = {
  open: '공태',
  estrus_detected: '발정',
  inseminated: '수정',
  pregnancy_confirmed: '임신',
  late_gestation: '후기',
  calving_expected: '분만',
} as const;

const URGENCY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
} as const;

const URGENCY_LABELS: Record<string, string> = {
  critical: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
} as const;

// ── KPI Helpers ──

interface KpiChipDef {
  readonly key: keyof BreedingKpis;
  readonly label: string;
  readonly unit: string;
  readonly evaluate: (v: number) => 'green' | 'orange' | 'red';
}

// 수의번식학 핵심 6대 지표 (KPI 순서: 중요도순)
const KPI_DEFS: readonly KpiChipDef[] = [
  {
    key: 'pregnancyRate',
    label: '임신율(PR)',
    unit: '%',
    evaluate: (v) => (v >= 25 ? 'green' : v >= 15 ? 'orange' : 'red'),
  },
  {
    key: 'conceptionRate',
    label: '수태율(CR)',
    unit: '%',
    evaluate: (v) => (v >= 50 ? 'green' : v >= 35 ? 'orange' : 'red'),
  },
  {
    key: 'estrusDetectionRate',
    label: '발정탐지율',
    unit: '%',
    evaluate: (v) => (v >= 70 ? 'green' : v >= 50 ? 'orange' : 'red'),
  },
  {
    key: 'avgDaysOpen',
    label: '공태일수',
    unit: '일',
    evaluate: (v) => (v < 130 ? 'green' : v < 160 ? 'orange' : 'red'),
  },
  {
    key: 'avgDaysToFirstService',
    label: '첫수정일수',
    unit: '일',
    evaluate: (v) => (v < 80 ? 'green' : v < 100 ? 'orange' : 'red'),
  },
  {
    key: 'avgCalvingInterval',
    label: '분만간격',
    unit: '일',
    evaluate: (v) => (v < 400 ? 'green' : v < 420 ? 'orange' : 'red'),
  },
] as const;

const STATUS_COLORS: Record<string, string> = {
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
} as const;

// ── Sub-components ──

function BreedingKpiBar({ kpis }: { readonly kpis: BreedingKpis }): React.JSX.Element {
  return (
    <div style={{
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      marginBottom: 20,
    }}>
      {KPI_DEFS.map((def) => {
        const value = kpis[def.key];
        const status = def.evaluate(value);
        const color = STATUS_COLORS[status];

        return (
          <div
            key={def.key}
            style={{
              flex: '1 1 100px',
              minWidth: 90,
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 10,
              padding: '10px 8px',
              textAlign: 'center',
              borderBottom: `2px solid ${color}`,
            }}
          >
            <div style={{
              fontSize: 18,
              fontWeight: 800,
              color,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.5px',
            }}>
              {typeof value === 'number' && def.unit === '%'
                ? value.toFixed(1)
                : value}
              <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 1 }}>
                {def.unit}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 3 }}>
              {def.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StageCard({
  group,
  total,
}: {
  readonly group: BreedingStageGroup;
  readonly total: number;
}): React.JSX.Element {
  const color = STAGE_COLORS[group.stage];
  const pct = total > 0 ? (group.count / total) * 100 : 0;
  const isEstrus = group.stage === 'estrus_detected' && group.count > 0;

  return (
    <div
      style={{
        flex: '1 1 100px',
        minWidth: 100,
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 12,
        padding: '14px 10px',
        textAlign: 'center',
        border: `1px solid ${color}33`,
        position: 'relative',
        overflow: 'hidden',
        animation: isEstrus ? 'ct-breeding-pulse 2s ease-in-out infinite' : undefined,
      }}
    >
      {/* Background bar */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: `${Math.max(pct, 4)}%`,
        background: `${color}15`,
        transition: 'height 0.5s ease',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color,
          letterSpacing: '0.3px',
          marginBottom: 6,
          textTransform: 'uppercase',
        }}>
          {STAGE_LABELS[group.stage]}
        </div>
        <div style={{
          fontSize: 22,
          fontWeight: 800,
          color: 'var(--ct-text)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {group.count.toLocaleString()}
          <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--ct-text-muted)', marginLeft: 2 }}>
            두
          </span>
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--ct-text-muted)',
          marginTop: 4,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {pct.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function PipelineArrow(): React.JSX.Element {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      width: 20,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ct-text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </div>
  );
}

function PipelineKanban({
  pipeline,
  total,
}: {
  readonly pipeline: readonly BreedingStageGroup[];
  readonly total: number;
}): React.JSX.Element {
  const stageOrder: readonly BreedingStage[] = [
    'open', 'estrus_detected', 'inseminated',
    'pregnancy_confirmed', 'late_gestation', 'calving_expected',
  ];

  const orderedGroups = stageOrder.map((stage) => {
    const found = pipeline.find((g) => g.stage === stage);
    return found ?? { stage, label: STAGE_LABELS[stage], count: 0, animals: [] };
  });

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--ct-text-muted)',
        marginBottom: 10,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
      }}>
        번식 파이프라인
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
      }}>
        {orderedGroups.map((group, idx) => (
          <React.Fragment key={group.stage}>
            {idx > 0 && <PipelineArrow />}
            <StageCard group={group} total={total} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function UrgentActionItem({
  action,
}: {
  readonly action: BreedingUrgentAction;
}): React.JSX.Element {
  const urgencyColor = URGENCY_COLORS[action.hoursRemaining <= 4 ? 'critical' : action.hoursRemaining <= 12 ? 'high' : action.hoursRemaining <= 48 ? 'medium' : 'low'];
  const urgencyKey = action.hoursRemaining <= 4 ? 'critical' : action.hoursRemaining <= 12 ? 'high' : action.hoursRemaining <= 48 ? 'medium' : 'low';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      borderRadius: 8,
      background: `${urgencyColor}08`,
      borderLeft: `3px solid ${urgencyColor}`,
    }}>
      {/* Badge */}
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: 4,
        background: `${urgencyColor}20`,
        color: urgencyColor,
        letterSpacing: '0.3px',
        flexShrink: 0,
      }}>
        {URGENCY_LABELS[urgencyKey]}
      </span>

      {/* Ear tag */}
      <span style={{
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--ct-text)',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
        minWidth: 50,
      }}>
        {action.earTag}번
      </span>

      {/* Farm name */}
      <span style={{
        fontSize: 11,
        color: 'var(--ct-text-muted)',
        flexShrink: 0,
      }}>
        ({action.farmName})
      </span>

      {/* Description */}
      <span style={{
        fontSize: 12,
        color: 'var(--ct-text-secondary)',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {action.description}
      </span>

      {/* Hours remaining */}
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: urgencyColor,
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {action.hoursRemaining > 0 ? `${action.hoursRemaining}h` : '즉시'}
      </span>
    </div>
  );
}

function UrgentActionsPanel({
  actions,
}: {
  readonly actions: readonly BreedingUrgentAction[];
}): React.JSX.Element {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...actions].sort((a, b) => a.hoursRemaining - b.hoursRemaining);
  const displayed = showAll ? sorted : sorted.slice(0, 5);

  if (actions.length === 0) {
    return (
      <div style={{
        padding: '16px 0',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--ct-text-muted)',
      }}>
        현재 긴급 조치가 필요한 개체가 없습니다
      </div>
    );
  }

  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--ct-text-muted)',
        marginBottom: 10,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
      }}>
        긴급 조치 필요 ({actions.length}건)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {displayed.map((action, idx) => (
          <UrgentActionItem key={`${action.animalId}-${action.actionType}-${idx}`} action={action} />
        ))}
      </div>
      {actions.length > 5 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            marginTop: 10,
            background: 'none',
            border: '1px solid var(--ct-border)',
            borderRadius: 8,
            color: 'var(--ct-primary)',
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 16px',
            cursor: 'pointer',
            width: '100%',
          }}
        >
          더 보기 (+{actions.length - 5}건)
        </button>
      )}
    </div>
  );
}

// ── Pulse animation style tag ──

function PulseStyle(): React.JSX.Element {
  return (
    <style>{`
      @keyframes ct-breeding-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.3); }
        50% { box-shadow: 0 0 12px 4px rgba(239, 68, 68, 0.15); }
      }
    `}</style>
  );
}

// ── Main Widget ──

interface BreedingPipelineWidgetProps {
  readonly data: BreedingPipelineData;
}

export function BreedingPipelineWidget({ data }: BreedingPipelineWidgetProps): React.JSX.Element {
  return (
    <div
      className="ct-fade-up"
      style={{
        background: 'var(--ct-card)',
        borderRadius: 14,
        padding: '20px 20px 16px',
        border: '1px solid var(--ct-border)',
      }}
    >
      <PulseStyle />

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: '1px solid var(--ct-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #f97316, #ef4444)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12l3 3 5-5" />
            </svg>
          </span>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ct-text)' }}>
            번식성적 커맨드센터
          </span>
        </div>
        <span style={{
          fontSize: 12,
          color: 'var(--ct-text-muted)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {data.totalAnimals.toLocaleString()}두 관리
        </span>
      </div>

      {/* KPI Bar */}
      <BreedingKpiBar kpis={data.kpis} />

      {/* Pipeline Kanban */}
      <PipelineKanban pipeline={data.pipeline} total={data.totalAnimals} />

      {/* Urgent Actions */}
      <UrgentActionsPanel actions={data.urgentActions} />
    </div>
  );
}
