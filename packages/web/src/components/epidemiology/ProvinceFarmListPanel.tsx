// 시도 → 농장 → 개체 3레벨 드릴다운 패널
// 우측 슬라이드인 — fixed z-40 (AnimalDrilldownPanel z-50보다 낮음)

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import { listAnimals } from '@web/api/animal.api';
import type { AnimalSummary } from '@web/api/animal.api';
import { RiskLevelBadge } from '@web/components/epidemiology/RiskLevelBadge';
import type { RiskLevel } from '@web/components/epidemiology/RiskLevelBadge';
import { BreadcrumbNav } from '@web/components/epidemiology/BreadcrumbNav';

// ===========================
// 타입
// ===========================

interface ProvinceFarmItem {
  readonly farmId: string;
  readonly farmName: string;
  readonly district: string;
  readonly currentHeadCount: number;
  readonly feverCount: number;
  readonly riskLevel: RiskLevel;
}

interface Props {
  readonly province: string;
  readonly onClose: () => void;
  readonly onAnimalSelect: (animalId: string, farmId: string, farmName: string) => void;
}

// ===========================
// 발열 개체 뱃지
// ===========================

function FeverBadge({ count }: { count: number }): React.JSX.Element | null {
  if (count === 0) return null;
  return (
    <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
      발열 {count}두
    </span>
  );
}

// ===========================
// 농장 내 개체 목록
// ===========================

interface AnimalListProps {
  readonly farmId: string;
  readonly farmName: string;
  readonly onSelect: (animalId: string) => void;
}

function AnimalList({ farmId, farmName, onSelect }: AnimalListProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['animals-list', farmId],
    queryFn: () => listAnimals({ farmId, limit: 100, status: 'active' }) as unknown as Promise<AnimalSummary[]>,
    staleTime: 30_000,
  });

  const animals: readonly AnimalSummary[] = data ?? [];
  const filtered = search
    ? animals.filter((a: AnimalSummary) => a.earTag.toLowerCase().includes(search.toLowerCase()))
    : animals;

  // 발열 개체 우선 정렬
  const sorted = [...filtered].sort((a: AnimalSummary, b: AnimalSummary) => {
    const aFever = (a.latestTemperature ?? 0) >= 38.5 ? 1 : 0;
    const bFever = (b.latestTemperature ?? 0) >= 38.5 ? 1 : 0;
    return bFever - aFever;
  });

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="이표번호 검색..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border px-3 py-1.5 text-xs"
        style={{ background: 'var(--ct-card)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
      />
      {isLoading ? (
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'var(--ct-border)' }} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-center py-4" style={{ color: 'var(--ct-text-secondary)' }}>
          {search ? '검색 결과 없음' : `${farmName}에 등록된 개체가 없습니다`}
        </p>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {sorted.map((animal) => (
            <AnimalRow key={animal.animalId} animal={animal} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnimalRow({ animal, onSelect }: { animal: AnimalSummary; onSelect: (id: string) => void }): React.JSX.Element {
  const isFever = (animal.latestTemperature ?? 0) >= 38.5;
  return (
    <button
      type="button"
      onClick={() => onSelect(animal.animalId)}
      className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition-colors"
      style={{
        background: isFever ? 'rgba(239,68,68,0.06)' : 'var(--ct-bg)',
        border: isFever ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--ct-border)',
      }}
    >
      <div>
        <p className="text-xs font-medium" style={{ color: isFever ? '#ef4444' : 'var(--ct-text)' }}>
          {animal.earTag}
          {isFever && ' 🌡️'}
        </p>
        <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
          {animal.status} · {animal.breed}
        </p>
      </div>
      {animal.latestTemperature != null && (
        <span
          className="text-xs font-semibold"
          style={{ color: isFever ? '#ef4444' : 'var(--ct-text-secondary)' }}
        >
          {animal.latestTemperature.toFixed(1)}°
        </span>
      )}
    </button>
  );
}

// ===========================
// 메인 컴포넌트
// ===========================

export function ProvinceFarmListPanel({ province, onClose, onAnimalSelect }: Props): React.JSX.Element {
  const [selectedFarm, setSelectedFarm] = useState<ProvinceFarmItem | null>(null);

  const { data: farms, isLoading } = useQuery<ProvinceFarmItem[]>({
    queryKey: ['province-farms', province],
    queryFn: () => apiGet<ProvinceFarmItem[]>(`/quarantine/province-farms/${encodeURIComponent(province)}`),
    staleTime: 60_000,
  });

  const breadcrumbs = selectedFarm
    ? [
        { label: '전국', onClick: onClose },
        { label: province, onClick: () => setSelectedFarm(null) },
        { label: selectedFarm.farmName },
      ]
    : [
        { label: '전국', onClick: onClose },
        { label: province },
      ];

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 z-30"
        style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      {/* 패널 */}
      <div
        className="fixed right-0 top-0 z-40 flex flex-col overflow-hidden"
        style={{
          width: 'min(100vw, 360px)',
          height: 'calc(100vh - env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 60px)',
          background: 'var(--ct-card)',
          borderLeft: '1px solid var(--ct-border)',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.12)',
        }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--ct-border)' }}
        >
          <div className="min-w-0 flex-1 mr-2">
            <BreadcrumbNav items={breadcrumbs} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-2 py-1 rounded flex-shrink-0"
            style={{ background: 'var(--ct-border)', color: 'var(--ct-text-secondary)' }}
          >
            ✕
          </button>
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {selectedFarm ? (
            // 레벨 2: 농장 내 개체 목록
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>
                    {selectedFarm.farmName}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
                    {selectedFarm.district} · {selectedFarm.currentHeadCount}두
                    {selectedFarm.feverCount > 0 && (
                      <span className="ml-1.5 text-red-500 font-medium">
                        발열 {selectedFarm.feverCount}두
                      </span>
                    )}
                  </p>
                </div>
                <RiskLevelBadge level={selectedFarm.riskLevel} size="sm" />
              </div>
              <AnimalList
                farmId={selectedFarm.farmId}
                farmName={selectedFarm.farmName}
                onSelect={(animalId) => onAnimalSelect(animalId, selectedFarm.farmId, selectedFarm.farmName)}
              />
            </div>
          ) : (
            // 레벨 1: 시도 내 농장 목록
            <div className="space-y-2">
              <p className="text-xs font-semibold" style={{ color: 'var(--ct-text)' }}>
                {province} 농장 목록
              </p>
              {isLoading ? (
                <div className="space-y-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-14 rounded-lg animate-pulse" style={{ background: 'var(--ct-border)' }} />
                  ))}
                </div>
              ) : (farms ?? []).length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--ct-text-secondary)' }}>
                  등록된 농장이 없습니다
                </p>
              ) : (
                <div className="space-y-1.5">
                  {(farms ?? []).map((farm) => (
                    <button
                      key={farm.farmId}
                      type="button"
                      onClick={() => setSelectedFarm(farm)}
                      className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors"
                      style={{
                        background: farm.feverCount > 0 ? 'rgba(239,68,68,0.05)' : 'var(--ct-bg)',
                        border: farm.feverCount > 0 ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--ct-border)',
                      }}
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--ct-text)' }}>
                          {farm.farmName}
                        </p>
                        <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--ct-text-secondary)' }}>
                          {farm.district} · {farm.currentHeadCount}두
                          <FeverBadge count={farm.feverCount} />
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <RiskLevelBadge level={farm.riskLevel} size="sm" />
                        <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>›</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
