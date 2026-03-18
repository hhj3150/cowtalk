// 드릴다운 오버레이 — 4단계 네비게이션 컨테이너, CowTalk 디자인

import React, { useEffect } from 'react';
import { useDrilldownStore } from '@web/stores/drilldown.store';
import { Breadcrumb } from './Breadcrumb';
import { FarmListLevel } from './FarmListLevel';
import { AnimalListLevel } from './AnimalListLevel';
import { AnimalDetailLevel } from './AnimalDetailLevel';
import { EstrusFarmListLevel } from './EstrusFarmListLevel';
import { EstrusAnimalListLevel } from './EstrusAnimalListLevel';
import { EstrusRoutePanel } from './EstrusRoutePanel';

export function DrilldownOverlay(): React.JSX.Element | null {
  const { isOpen, level, animalId, farmId, filter, close, goBack } = useDrilldownStore();

  // ESC 키로 닫기
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') close();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-12 lg:pt-20">
      <div
        className="relative mx-4 flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden shadow-2xl"
        style={{
          background: 'var(--ct-card)',
          borderRadius: '16px',
        }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: 'var(--ct-border)' }}
        >
          <div className="flex items-center gap-4">
            {level !== 'summary' && (
              <button
                type="button"
                onClick={goBack}
                className="rounded-lg p-1.5 transition-colors hover:bg-[#F0F0EE]"
                style={{ color: 'var(--ct-text-secondary)' }}
                aria-label="뒤로"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
            )}
            <Breadcrumb />
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 transition-colors hover:bg-[#F0F0EE]"
            style={{ color: 'var(--ct-text-secondary)' }}
            aria-label="닫기"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 컨텐츠 */}
        <div className="flex-1 overflow-y-auto p-6">
          <DrilldownContent level={level} farmId={farmId} animalId={animalId} filter={filter} />
        </div>
      </div>
    </div>
  );
}

function DrilldownContent({
  level,
  farmId,
  animalId,
  filter,
}: {
  level: string;
  farmId: string | null;
  animalId: string | null;
  filter: string;
}): React.JSX.Element {
  const isEstrusFilter = filter === 'estrus_candidate';

  switch (level) {
    case 'summary':
      return isEstrusFilter
        ? <EstrusOverview />
        : <FarmListLevel filter={filter} />;
    case 'farm':
      if (!farmId) return <div className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>농장을 선택해 주세요.</div>;
      return isEstrusFilter
        ? <EstrusAnimalListLevel farmId={farmId} />
        : <AnimalListLevel farmId={farmId} />;
    case 'animal':
    case 'detail':
      return animalId ? <AnimalDetailLevel animalId={animalId} /> : <div className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>동물을 선택해 주세요.</div>;
    default:
      return <div />;
  }
}

/** 발정 드릴다운 요약 — 목장 목록 + 수정 동선 탭 */
function EstrusOverview(): React.JSX.Element {
  const [tab, setTab] = React.useState<'farms' | 'route'>('farms');

  return (
    <div>
      {/* 탭 */}
      <div className="mb-4 flex gap-1 rounded-lg p-1" style={{ background: 'var(--ct-bg)' }}>
        <TabButton label="발정 목장별" active={tab === 'farms'} onClick={() => setTab('farms')} />
        <TabButton label="수정 동선" active={tab === 'route'} onClick={() => setTab('route')} />
      </div>

      {tab === 'farms' ? <EstrusFarmListLevel /> : <EstrusRoutePanel />}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all"
      style={{
        background: active ? 'var(--ct-card)' : 'transparent',
        color: active ? 'var(--ct-primary)' : 'var(--ct-text-secondary)',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      {label}
    </button>
  );
}
