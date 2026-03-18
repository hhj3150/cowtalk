// 발정 드릴다운 2단계 — 특정 목장의 발정 개체 목록
// NOW/SOON/WATCH 단계별 색상 표시, 클릭 시 개체 상세로 이동

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import { useDrilldown } from '@web/hooks/useDrilldown';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { Badge } from '@web/components/common/Badge';

interface EstrusAnimal {
  readonly eventId: string;
  readonly animalId: string;
  readonly earTag: string;
  readonly confidence: number;
  readonly detectedAt: string;
  readonly stage: string;
}

interface EstrusFarmGroup {
  readonly farmId: string;
  readonly farmName: string;
  readonly nowCount: number;
  readonly soonCount: number;
  readonly watchCount: number;
  readonly totalEstrus: number;
  readonly animals: readonly EstrusAnimal[];
}

interface EstrusByFarmResponse {
  readonly todayTotal: number;
  readonly farmGroups: readonly EstrusFarmGroup[];
}

interface Props {
  readonly farmId: string;
}

const STAGE_CONFIG: Record<string, { label: string; variant: 'critical' | 'high' | 'info'; borderColor: string }> = {
  now: { label: 'NOW — 수정 적기', variant: 'critical', borderColor: 'var(--ct-danger)' },
  soon: { label: 'SOON — 24~48시간', variant: 'high', borderColor: 'var(--ct-warning)' },
  watch: { label: 'WATCH — 관찰', variant: 'info', borderColor: 'var(--ct-info)' },
};

export function EstrusAnimalListLevel({ farmId }: Props): React.JSX.Element {
  const { navigateToAnimal } = useDrilldown();

  const { data, isLoading } = useQuery({
    queryKey: ['drilldown', 'estrus-by-farm'],
    queryFn: () => apiGet<EstrusByFarmResponse>('/dashboard/estrus-by-farm'),
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingSkeleton lines={6} />;

  const farmGroup = data?.farmGroups.find((fg) => fg.farmId === farmId);
  const animals = farmGroup?.animals ?? [];

  // 단계별 그룹핑
  const nowAnimals = animals.filter((a) => a.stage === 'now');
  const soonAnimals = animals.filter((a) => a.stage === 'soon');
  const watchAnimals = animals.filter((a) => a.stage === 'watch');

  return (
    <div>
      {/* 요약 헤더 */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
          발정 {animals.length}두
        </span>
        {farmGroup && (
          <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
            NOW {farmGroup.nowCount} / SOON {farmGroup.soonCount} / WATCH {farmGroup.watchCount}
          </span>
        )}
      </div>

      {/* NOW 그룹 */}
      <StageSection stage="now" animals={nowAnimals} onClickAnimal={navigateToAnimal} />
      <StageSection stage="soon" animals={soonAnimals} onClickAnimal={navigateToAnimal} />
      <StageSection stage="watch" animals={watchAnimals} onClickAnimal={navigateToAnimal} />

      {animals.length === 0 && (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
          이 목장에 발정 감지된 소가 없습니다.
        </p>
      )}
    </div>
  );
}

function StageSection({
  stage,
  animals,
  onClickAnimal,
}: {
  readonly stage: string;
  readonly animals: readonly EstrusAnimal[];
  readonly onClickAnimal: (animalId: string, earTag: string) => void;
}): React.JSX.Element | null {
  if (animals.length === 0) return null;

  const config = STAGE_CONFIG[stage] ?? STAGE_CONFIG.watch!;

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: config.borderColor }} />
        <span className="text-xs font-bold" style={{ color: config.borderColor }}>
          {config.label} ({animals.length}두)
        </span>
      </div>
      <div className="space-y-2">
        {animals.map((animal) => (
          <button
            key={animal.eventId}
            type="button"
            onClick={() => onClickAnimal(animal.animalId, animal.earTag)}
            className="ct-card flex w-full items-center justify-between p-3 text-left transition-all hover:bg-[#FAFAF8]"
            style={{ borderLeft: `3px solid ${config.borderColor}` }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-primary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ct-border)'; }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--ct-text)' }}>
                {animal.earTag}
              </p>
              <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                신뢰도 {Math.round(animal.confidence * 100)}%
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge label={stage.toUpperCase()} variant={config.variant} />
              <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                {new Date(animal.detectedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              <svg className="h-4 w-4" style={{ color: 'var(--ct-border)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
