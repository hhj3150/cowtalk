// 번식 커맨드센터 — 발정알람 → 수정적기 → 정액추천 → 기록 완결 루프
// 공모사업 핵심 시연 화면: 30초 안에 "알람 → 행동 → 기록" 보여줌

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getBreedingPipeline } from '@web/api/breeding.api';
import { InseminationPanel } from '@web/components/breeding/InseminationPanel';
import { BreedingInsightsPanel } from '@web/components/breeding/BreedingInsightsPanel';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import type {
  BreedingPipelineData,
  BreedingAnimalSummary,
  BreedingUrgentAction,
  BreedingKpis,
  BreedingStage,
} from '@cowtalk/shared';
import { useFarmStore } from '@web/stores/farm.store';

// ===========================
// 상수
// ===========================

const STAGE_META: Readonly<Record<BreedingStage, { label: string; color: string; bg: string; icon: string }>> = {
  open:                 { label: '공태',     color: '#6b7280', bg: '#f9fafb',           icon: '⬜' },
  estrus_detected:      { label: '발정감지', color: '#dc2626', bg: 'rgba(220,38,38,0.06)', icon: '🔴' },
  inseminated:          { label: '수정완료', color: '#2563eb', bg: 'rgba(37,99,235,0.06)', icon: '💉' },
  pregnancy_confirmed:  { label: '임신확인', color: '#16a34a', bg: 'rgba(22,163,74,0.06)', icon: '🤰' },
  late_gestation:       { label: '임신후기', color: '#7c3aed', bg: 'rgba(124,58,237,0.06)', icon: '🟣' },
  calving_expected:     { label: '분만예정', color: '#d97706', bg: 'rgba(217,119,6,0.06)', icon: '🐄' },
};

const URGENCY_COLORS: Readonly<Record<string, string>> = {
  critical: '#dc2626',
  high:     '#ea580c',
  medium:   '#d97706',
  low:      '#6b7280',
};

const ACTION_META: Readonly<Record<string, { label: string; icon: string; color: string; bg: string }>> = {
  inseminate_now:      { label: '즉시 수정 필요',   icon: '💉', color: '#dc2626', bg: 'rgba(220,38,38,0.06)' },
  pregnancy_check_due: { label: '임신감정 예정',    icon: '🔍', color: '#d97706', bg: 'rgba(217,119,6,0.06)' },
  calving_imminent:    { label: '분만 임박',         icon: '🐄', color: '#7c3aed', bg: 'rgba(124,58,237,0.06)' },
  repeat_breeder:      { label: '반복 미수태',       icon: '⚠️', color: '#ea580c', bg: 'rgba(234,88,12,0.06)' },
};

// ===========================
// KPI 카드
// ===========================

interface KpiCardProps {
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly target?: string;
  readonly status: 'good' | 'warn' | 'bad';
}

function KpiCard({ label, value, unit, target, status }: KpiCardProps): React.JSX.Element {
  const statusColor = status === 'good' ? '#16a34a' : status === 'warn' ? '#d97706' : '#dc2626';
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1"
      style={{ background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
    >
      <p className="text-xs font-medium" style={{ color: 'var(--ct-text-secondary)' }}>{label}</p>
      <div className="flex items-end gap-1">
        <p className="text-2xl font-bold" style={{ color: statusColor }}>{value}</p>
        <p className="text-sm mb-0.5" style={{ color: 'var(--ct-text-secondary)' }}>{unit}</p>
      </div>
      {target && (
        <p className="text-[11px]" style={{ color: 'var(--ct-text-secondary)' }}>목표 {target}</p>
      )}
    </div>
  );
}

function buildKpiCards(kpis: BreedingKpis): readonly KpiCardProps[] {
  return [
    {
      label: '수태율',
      value: kpis.conceptionRate.toFixed(1),
      unit: '%',
      target: '≥ 65%',
      status: kpis.conceptionRate >= 65 ? 'good' : kpis.conceptionRate >= 50 ? 'warn' : 'bad',
    },
    {
      label: '발정탐지율',
      value: kpis.estrusDetectionRate.toFixed(1),
      unit: '%',
      target: '≥ 80%',
      status: kpis.estrusDetectionRate >= 80 ? 'good' : kpis.estrusDetectionRate >= 60 ? 'warn' : 'bad',
    },
    {
      label: '평균 공태일',
      value: kpis.avgDaysOpen.toFixed(0),
      unit: '일',
      target: '≤ 120일',
      status: kpis.avgDaysOpen <= 120 ? 'good' : kpis.avgDaysOpen <= 160 ? 'warn' : 'bad',
    },
    {
      label: '평균 분만간격',
      value: kpis.avgCalvingInterval.toFixed(0),
      unit: '일',
      target: '≤ 400일',
      status: kpis.avgCalvingInterval <= 400 ? 'good' : kpis.avgCalvingInterval <= 450 ? 'warn' : 'bad',
    },
  ];
}

// ===========================
// 긴급 조치 카드
// ===========================

interface UrgentCardProps {
  readonly action: BreedingUrgentAction;
  readonly onClick: (animalId: string) => void;
}

function UrgentCard({ action, onClick }: UrgentCardProps): React.JSX.Element {
  const meta = ACTION_META[action.actionType] ?? (ACTION_META.inseminate_now as NonNullable<typeof ACTION_META[string]>);
  const hoursLabel = action.hoursRemaining < 1
    ? `${Math.round(action.hoursRemaining * 60)}분 남음`
    : `${action.hoursRemaining.toFixed(0)}시간 남음`;

  return (
    <button
      type="button"
      onClick={() => onClick(action.animalId)}
      className="rounded-xl p-3 text-left w-full transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={{
        background: meta.bg,
        border: `1.5px solid ${meta.color}30`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">{meta.icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: meta.color }}>
              #{action.earTag} — {action.farmName}
            </p>
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--ct-text-secondary)' }}>
              {action.description}
            </p>
          </div>
        </div>
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: meta.color, color: '#fff' }}
        >
          {hoursLabel}
        </span>
      </div>
    </button>
  );
}

// ===========================
// 파이프라인 칸반 컬럼
// ===========================

interface PipelineColumnProps {
  readonly stage: BreedingStage;
  readonly label: string;
  readonly count: number;
  readonly animals: readonly BreedingAnimalSummary[];
  readonly onAnimalClick: (animalId: string) => void;
}

function AnimalChip({ animal, onClick }: { animal: BreedingAnimalSummary; onClick: () => void }): React.JSX.Element {
  const urgencyColor = URGENCY_COLORS[animal.urgency] ?? '#6b7280';
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:opacity-80"
      style={{ background: 'var(--ct-bg)', border: `1px solid var(--ct-border)` }}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="text-xs font-semibold truncate" style={{ color: 'var(--ct-text)' }}>#{animal.earTag}</p>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: urgencyColor }}
          aria-label={`긴급도: ${animal.urgency}`}
        />
      </div>
      <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--ct-text-secondary)' }}>
        {animal.farmName} · {animal.daysInStage}일째
      </p>
    </button>
  );
}

function PipelineColumn({ stage, label, count, animals, onAnimalClick }: PipelineColumnProps): React.JSX.Element {
  const meta = STAGE_META[stage];
  const visibleAnimals = animals.slice(0, 8);
  const hiddenCount = animals.length - visibleAnimals.length;

  return (
    <div
      className="flex flex-col gap-2 min-w-[140px] rounded-xl p-3"
      style={{ background: meta.bg, border: `1px solid ${meta.color}20`, minHeight: 200 }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{meta.icon}</span>
          <p className="text-xs font-bold" style={{ color: meta.color }}>{label}</p>
        </div>
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: meta.color, color: '#fff' }}
        >
          {count}
        </span>
      </div>

      {/* 개체 칩 */}
      <div className="flex flex-col gap-1.5">
        {visibleAnimals.map((a) => (
          <AnimalChip key={a.animalId} animal={a} onClick={() => onAnimalClick(a.animalId)} />
        ))}
        {hiddenCount > 0 && (
          <p className="text-[11px] text-center py-1" style={{ color: 'var(--ct-text-secondary)' }}>
            +{hiddenCount}두 더보기
          </p>
        )}
        {animals.length === 0 && (
          <p className="text-[11px] text-center py-3" style={{ color: 'var(--ct-text-secondary)' }}>
            없음
          </p>
        )}
      </div>
    </div>
  );
}

// ===========================
// 수정 적기 슬라이드오버
// ===========================

interface SlideOverProps {
  readonly animalId: string | null;
  readonly onClose: () => void;
}

function InseminationSlideOver({ animalId, onClose }: SlideOverProps): React.JSX.Element | null {
  if (!animalId) return null;

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* 슬라이드오버 패널 */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-y-auto"
        style={{
          width: 'min(380px, 100vw)',
          background: 'var(--ct-surface)',
          borderLeft: '1px solid var(--ct-border)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--ct-border)' }}>
          <p className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>번식 액션 센터</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:opacity-70"
            style={{ color: 'var(--ct-text-secondary)' }}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <div className="p-4 flex-1">
          <InseminationPanel animalId={animalId} onClose={onClose} />
        </div>
      </div>
    </>
  );
}

// ===========================
// 메인 페이지
// ===========================

export default function BreedingCommandPage(): React.JSX.Element {
  const { selectedFarmId } = useFarmStore();
  const navigate = useNavigate();
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<BreedingPipelineData>({
    queryKey: ['breeding-pipeline', selectedFarmId],
    queryFn: () => getBreedingPipeline(selectedFarmId ?? undefined),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000, // 5분마다 자동 갱신
  });

  const handleAnimalClick = (animalId: string): void => {
    setSelectedAnimalId(animalId);
  };

  const handleSlideOverClose = (): void => {
    setSelectedAnimalId(null);
    void refetch(); // 기록 후 파이프라인 갱신
  };

  // ── 로딩
  if (isLoading) {
    return (
      <div className="space-y-6 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <LoadingSkeleton key={i} lines={2} />)}
        </div>
        <LoadingSkeleton lines={4} />
      </div>
    );
  }

  // ── 에러
  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
          번식 데이터를 불러올 수 없습니다
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: 'var(--ct-primary)', color: '#fff' }}
        >
          다시 시도
        </button>
      </div>
    );
  }

  const kpiCards = buildKpiCards(data.kpis);
  const urgentInseminate = data.urgentActions.filter((a) => a.actionType === 'inseminate_now');
  const urgentOther = data.urgentActions.filter((a) => a.actionType !== 'inseminate_now');

  return (
    <div className="space-y-5 pb-8">
      {/* ── 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>번식 커맨드센터</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
            전체 {data.totalAnimals}두 · 최종 업데이트 {new Date(data.lastUpdated).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/breeding/performance')}
            className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70 font-medium"
            style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb', border: '1px solid rgba(37,99,235,0.2)' }}
          >
            📊 성과 분석
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ background: 'var(--ct-surface)', color: 'var(--ct-text-secondary)', border: '1px solid var(--ct-border)' }}
          >
            새로고침
          </button>
        </div>
      </div>

      {/* ── KPI 바 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpiCards.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* ── 즉시 수정 필요 (가장 중요) */}
      {urgentInseminate.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}
            >
              🚨 즉시 수정 필요 {urgentInseminate.length}두
            </span>
            <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>클릭하면 수정 적기·정액 추천이 즉시 표시됩니다</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {urgentInseminate.map((action) => (
              <UrgentCard key={action.animalId} action={action} onClick={handleAnimalClick} />
            ))}
          </div>
        </section>
      )}

      {/* ── 기타 긴급 조치 */}
      {urgentOther.length > 0 && (
        <section>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ct-text-secondary)' }}>기타 확인 필요</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {urgentOther.map((action) => (
              <UrgentCard key={`${action.animalId}-${action.actionType}`} action={action} onClick={handleAnimalClick} />
            ))}
          </div>
        </section>
      )}

      {/* ── 번식 파이프라인 칸반 */}
      <section>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--ct-text)' }}>번식 현황 파이프라인</p>
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-2" style={{ minWidth: 900 }}>
            {data.pipeline.map((group) => (
              <div key={group.stage} className="flex-1">
                <PipelineColumn
                  stage={group.stage}
                  label={group.label}
                  count={group.count}
                  animals={group.animals}
                  onAnimalClick={handleAnimalClick}
                />
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] mt-2" style={{ color: 'var(--ct-text-secondary)' }}>
          개체를 클릭하면 수정 적기·정액 추천·기록 패널이 열립니다
        </p>
      </section>

      {/* ── 번식 인사이트 (무발정/불규칙/유산의심/수정실패) */}
      <section>
        <p className="text-sm font-bold mb-3" style={{ color: 'var(--ct-text)' }}>번식 인사이트</p>
        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
        >
          <BreedingInsightsPanel farmId={selectedFarmId ?? undefined} />
        </div>
      </section>

      {/* ── 수정 액션 슬라이드오버 */}
      <InseminationSlideOver animalId={selectedAnimalId} onClose={handleSlideOverClose} />
    </div>
  );
}
