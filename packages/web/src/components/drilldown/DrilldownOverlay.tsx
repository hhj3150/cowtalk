// 드릴다운 오버레이 — 분할 패널: 왼쪽 목장 목록 + 오른쪽 개체 목록
// 목장을 클릭하면 왼쪽에 목장 목록이 유지되고 오른쪽에 개체 목록 표시
// 개체 클릭 시 상세 보기로 전환

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

  const isEstrusFilter = filter === 'estrus_candidate';
  const showSplitPanel = level === 'farm' && farmId;
  const showAnimalDetail = level === 'animal' || level === 'detail';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-6 sm:pt-12 lg:pt-16">
      <div
        className="relative mx-2 flex flex-col overflow-hidden shadow-2xl sm:mx-4"
        style={{
          background: 'var(--ct-card)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: showSplitPanel ? '1100px' : '900px',
          maxHeight: '88dvh',
          transition: 'max-width 0.25s ease',
        }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between border-b px-4 py-3 sm:px-6 sm:py-4"
          style={{ borderColor: 'var(--ct-border)', flexShrink: 0 }}
        >
          <div className="flex items-center gap-3">
            {level !== 'summary' && (
              <button
                type="button"
                onClick={goBack}
                className="rounded-lg p-1.5 transition-colors"
                style={{ color: 'var(--ct-text-secondary)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--ct-border)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
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
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: 'var(--ct-text-secondary)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--ct-border)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            aria-label="닫기"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 컨텐츠 */}
        <div className="flex-1 overflow-hidden">
          {/* 요약 레벨: 단일 패널 */}
          {level === 'summary' && (
            <div className="h-full overflow-y-auto p-4 sm:p-6">
              {isEstrusFilter ? <EstrusOverview /> : <FarmListLevel filter={filter} />}
            </div>
          )}

          {/* 목장 레벨: 분할 패널 (왼쪽=목장목록, 오른쪽=개체목록) */}
          {showSplitPanel && (
            <SplitFarmAnimalPanel
              farmId={farmId}
              filter={filter}
              isEstrusFilter={isEstrusFilter}
            />
          )}

          {/* 개체 상세 레벨 */}
          {showAnimalDetail && (
            <div className="h-full overflow-y-auto p-4 sm:p-6">
              {animalId
                ? <AnimalDetailLevel animalId={animalId} />
                : <div className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>동물을 선택해 주세요.</div>
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 분할 패널: 왼쪽 목장 목록(축소) + 오른쪽 개체 목록 */
function SplitFarmAnimalPanel({
  farmId,
  filter,
  isEstrusFilter,
}: {
  readonly farmId: string;
  readonly filter: string;
  readonly isEstrusFilter: boolean;
}): React.JSX.Element {
  return (
    <div className="flex h-full flex-col sm:flex-row">
      {/* 왼쪽: 목장 목록 (축소형) */}
      <div
        className="hidden sm:flex sm:w-[280px] flex-col border-r overflow-hidden"
        style={{ borderColor: 'var(--ct-border)', flexShrink: 0 }}
      >
        <div
          className="px-4 py-2.5 text-xs font-semibold"
          style={{ color: 'var(--ct-text-muted)', borderBottom: '1px solid var(--ct-border)', flexShrink: 0 }}
        >
          🏠 목장 목록
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {isEstrusFilter
            ? <EstrusFarmListLevel compact />
            : <FarmListLevel filter={filter} compact activeFarmId={farmId} />
          }
        </div>
      </div>

      {/* 모바일: 현재 목장 표시 바 */}
      <MobileFarmBar farmId={farmId} />

      {/* 오른쪽: 개체 목록 */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {isEstrusFilter
          ? <EstrusAnimalListLevel farmId={farmId} />
          : <AnimalListLevel farmId={farmId} />
        }
      </div>
    </div>
  );
}

/** 모바일: 뒤로가기 + 현재 목장명 바 */
function MobileFarmBar({ farmId: _farmId }: { readonly farmId: string }): React.JSX.Element {
  const { title, goBack } = useDrilldownStore();

  return (
    <div
      className="flex sm:hidden items-center gap-2 px-4 py-2.5 border-b"
      style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-bg)', flexShrink: 0 }}
    >
      <button
        type="button"
        onClick={goBack}
        className="text-xs font-medium px-2 py-1 rounded"
        style={{ color: 'var(--ct-primary)', background: 'rgba(59,130,246,0.08)' }}
      >
        ← 목장 목록
      </button>
      <span className="text-xs font-semibold" style={{ color: 'var(--ct-text)' }}>
        {title}
      </span>
    </div>
  );
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
