// 내 소 — 3단계 탐색: 전체선택→목장리스트 / 목장선택→센서소목록 / 소클릭→개체대시보드

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import { useAuthStore } from '@web/stores/auth.store';
import { useFarmStore } from '@web/stores/farm.store';

interface AnimalRecord {
  readonly animalId: string;
  readonly earTag: string | null;
  readonly traceId: string | null;
  readonly name: string | null;
  readonly breed: string | null;
  readonly sex: string | null;
  readonly birthDate: string | null;
  readonly parity: number | null;
  readonly daysInMilk: number | null;
  readonly lactationStatus: string | null;
  readonly currentDeviceId: string | null;
  readonly status: string;
}

interface FarmSummary {
  readonly farmId: string;
  readonly name: string;
  readonly totalAnimals?: number;
  readonly address?: string | null;
}

type FilterTab = 'sensor' | 'all' | 'noSensor';

const STATUS_MAP: Readonly<Record<string, string>> = {
  Lactating_Cow: '착유우',
  Dry_Cow: '건유우',
  Heifer: '육성우',
  Calf: '송아지',
  Bull: '종모우',
};

// ── 공통 스타일 헬퍼 ──────────────────────────────

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    borderRadius: 6,
    border: '1px solid',
    borderColor: active ? '#10b981' : 'var(--ct-border, #334155)',
    background: active ? 'rgba(16,185,129,0.15)' : 'transparent',
    color: active ? '#10b981' : 'var(--ct-text-muted, #94a3b8)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}

// ── 목장 리스트 뷰 ────────────────────────────────

interface FarmListViewProps {
  readonly farms: readonly FarmSummary[];
  readonly onSelect: (farmId: string) => void;
}

function FarmListView({ farms, onSelect }: FarmListViewProps): React.JSX.Element {
  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 70 }}>
      {farms.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
          등록된 목장이 없습니다
        </div>
      )}
      {farms.map((farm) => (
        <button
          key={farm.farmId}
          type="button"
          onClick={() => onSelect(farm.farmId)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 16px',
            borderBottom: '1px solid var(--ct-border, #1e293b)',
            background: 'transparent',
            border: 'none',
            borderBottomWidth: 1,
            borderBottomStyle: 'solid',
            borderBottomColor: 'var(--ct-border, #1e293b)',
            cursor: 'pointer',
            textAlign: 'left',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16,185,129,0.06)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(16,185,129,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>
            🏡
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ct-text, #f1f5f9)', marginBottom: 2 }}>
              {farm.name}
            </div>
            {farm.address && (
              <div style={{ fontSize: 11, color: '#64748b' }}>{farm.address}</div>
            )}
            {farm.totalAnimals != null && (
              <div style={{ fontSize: 11, color: '#10b981', marginTop: 1 }}>
                총 {farm.totalAnimals}두
              </div>
            )}
          </div>
          <span style={{ fontSize: 18, color: '#64748b' }}>›</span>
        </button>
      ))}
    </div>
  );
}

// ── 개체 리스트 뷰 ────────────────────────────────

interface AnimalListViewProps {
  readonly animals: readonly AnimalRecord[];
  readonly isLoading: boolean;
  readonly filterTab: FilterTab;
  readonly onFilterChange: (f: FilterTab) => void;
  readonly search: string;
  readonly onSearchChange: (s: string) => void;
  readonly totalCount: number;
  readonly sensorCount: number;
  readonly onAnimalClick: (animalId: string) => void;
}

function AnimalListView({
  animals, isLoading, filterTab, onFilterChange,
  search, onSearchChange, totalCount, sensorCount, onAnimalClick,
}: AnimalListViewProps): React.JSX.Element {
  return (
    <>
      {/* 필터 탭 + 검색 */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--ct-border, #1e293b)',
        display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0,
      }}>
        {([
          { id: 'sensor' as const, label: `센서 (${sensorCount})` },
          { id: 'all' as const,    label: `전체 (${totalCount})` },
          { id: 'noSensor' as const, label: `미장착 (${totalCount - sensorCount})` },
        ]).map((tab) => (
          <button key={tab.id} type="button" onClick={() => onFilterChange(tab.id)} style={tabStyle(filterTab === tab.id)}>
            {tab.label}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="번호·이력번호 검색..."
          aria-label="소 검색"
          style={{
            marginLeft: 'auto', width: 160, maxWidth: '40%',
            padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--ct-border, #334155)',
            background: 'rgba(255,255,255,0.05)', color: 'var(--ct-text, #f1f5f9)',
            fontSize: 12, outline: 'none',
          }}
        />
      </div>

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 70 }}>
        {isLoading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>로딩 중...</div>
        )}
        {!isLoading && animals.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            {search ? '검색 결과가 없습니다' : filterTab === 'sensor' ? '센서 장착 개체가 없습니다' : '등록된 소가 없습니다'}
          </div>
        )}

        {/* 데스크톱 헤더 */}
        {!isLoading && animals.length > 0 && (
          <div
            className="hidden md:grid"
            style={{
              gridTemplateColumns: '1fr 1fr 140px 70px 60px 40px',
              padding: '8px 16px',
              borderBottom: '1px solid var(--ct-border, #334155)',
              fontSize: 11, fontWeight: 600, color: 'var(--ct-text-muted, #94a3b8)',
              background: 'var(--ct-bg, #1e293b)', position: 'sticky', top: 0, zIndex: 1,
            }}
          >
            <div>이름/관리번호</div>
            <div>개체식별번호</div>
            <div>상태</div>
            <div>센서</div>
            <div>DIM</div>
            <div />
          </div>
        )}

        {animals.map((animal) => {
          const hasSensor = !!animal.currentDeviceId;
          const tag = animal.earTag ?? animal.name ?? '-';
          const statusLabel = STATUS_MAP[animal.lactationStatus ?? ''] ?? animal.lactationStatus ?? '-';

          return (
            <div
              key={animal.animalId}
              onClick={() => onAnimalClick(animal.animalId)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onAnimalClick(animal.animalId); }}
              style={{ cursor: 'pointer', borderBottom: '1px solid var(--ct-border, #1e293b)' }}
            >
              {/* 모바일 카드 */}
              <div className="md:hidden" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: hasSensor ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0,
                }}>
                  {hasSensor ? '🟢' : '⚪'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>{tag}</span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 600 }}>
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ct-text-muted, #94a3b8)', fontFamily: 'monospace' }}>
                    {animal.traceId ?? '이력번호 없음'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {animal.daysInMilk != null && (
                    <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>DIM {animal.daysInMilk}</div>
                  )}
                  <div style={{ fontSize: 18, color: '#64748b' }}>›</div>
                </div>
              </div>

              {/* 데스크톱 행 */}
              <div
                className="hidden md:grid"
                style={{ gridTemplateColumns: '1fr 1fr 140px 70px 60px 40px', padding: '10px 16px', fontSize: 12, color: 'var(--ct-text, #e2e8f0)', alignItems: 'center' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16,185,129,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ fontWeight: 700, color: '#22c55e' }}>{tag}</div>
                <div style={{ color: 'var(--ct-text-muted, #94a3b8)', fontFamily: 'monospace', fontSize: 11 }}>{animal.traceId ?? '-'}</div>
                <div style={{ color: 'var(--ct-text-muted, #94a3b8)' }}>{statusLabel}</div>
                <div>{hasSensor ? '🟢' : '⚪'}</div>
                <div style={{ color: '#f59e0b', fontWeight: 600 }}>{animal.daysInMilk ?? '-'}</div>
                <div style={{ color: '#64748b' }}>›</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 카운트 */}
      <div style={{
        padding: '8px 16px', borderTop: '1px solid var(--ct-border, #334155)',
        fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--ct-bg, #1e293b)', flexShrink: 0,
      }}>
        <span>{animals.length}두 표시 {search && `(검색: "${search}")`}</span>
        <span style={{ color: '#10b981', fontSize: 10 }}>소를 터치하면 개체 대시보드로 이동</span>
      </div>
    </>
  );
}

// ── 메인 페이지 ──────────────────────────────────

function MyCattlePage(): React.JSX.Element {
  const navigate = useNavigate();
  const farmIds = useAuthStore((s) => s.user?.farmIds);
  const { farms, selectedFarmId } = useFarmStore();

  // 전체 선택 모드일 때 로컬에서 선택한 목장 ID (드릴다운)
  const [browseFarmId, setBrowseFarmId] = useState<string | null>(null);

  const [filterTab, setFilterTab] = useState<FilterTab>('sensor');
  const [search, setSearch] = useState('');

  // 실제로 소 목록을 보여줄 farmId 결정
  // 1) 전역 farmId 선택 → 그 농장
  // 2) 전체 선택 + 로컬 드릴다운 → browseFarmId
  // 3) 사용자 계정의 첫 번째 farmId → fallback
  const activeFarmId = selectedFarmId ?? browseFarmId ?? farmIds?.[0] ?? null;

  // 화면 모드: farm-list(전체선택+드릴다운 없음) vs animal-list
  const showFarmList = !selectedFarmId && !browseFarmId && !farmIds?.length;

  // 현재 뷰에서 보여줄 목장 정보
  const activeFarm = useMemo(
    () => farms.find((f) => f.farmId === activeFarmId),
    [farms, activeFarmId],
  );

  // 소 목록 조회
  const { data, isLoading } = useQuery({
    queryKey: ['my-cattle', activeFarmId],
    queryFn: () => apiGet<readonly AnimalRecord[]>('/animals', { farmId: activeFarmId, limit: 500 }),
    staleTime: 30 * 1000,
    enabled: !!activeFarmId && !showFarmList,
  });

  const allAnimals = data ?? [];
  const sensorCount = allAnimals.filter((a) => a.currentDeviceId).length;

  const filtered = useMemo(() => {
    let list = [...allAnimals] as AnimalRecord[];
    if (filterTab === 'sensor') {
      list = list.filter((a) => a.currentDeviceId);
    } else if (filterTab === 'noSensor') {
      list = list.filter((a) => !a.currentDeviceId);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) =>
        (a.earTag ?? '').toLowerCase().includes(q) ||
        (a.traceId ?? '').toLowerCase().includes(q) ||
        (a.name ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [allAnimals, filterTab, search]);

  // 전체선택 모드에서 보여줄 목장 리스트
  const farmListToShow = useMemo(
    () => (farmIds?.length
      ? farms.filter((f) => farmIds.includes(f.farmId))
      : farms),
    [farms, farmIds],
  );

  // 헤더 타이틀·부제
  const headerTitle = showFarmList
    ? '내 소'
    : (browseFarmId && !selectedFarmId)
      ? (activeFarm?.name ?? '목장')
      : (activeFarm?.name ?? '내 소');

  const headerSub = showFarmList
    ? `${farmListToShow.length}개 목장`
    : `총 ${allAnimals.length}두 · 센서 ${sensorCount}두`;

  const canGoBack = !!browseFarmId && !selectedFarmId;

  const handleFarmSelect = (farmId: string) => {
    setBrowseFarmId(farmId);
    setFilterTab('sensor');
    setSearch('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* 헤더 */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--ct-border, #334155)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'linear-gradient(135deg, rgba(16,185,129,0.08), transparent)',
        flexShrink: 0,
      }}>
        {canGoBack && (
          <button
            type="button"
            onClick={() => { setBrowseFarmId(null); setSearch(''); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: '#10b981', padding: '0 4px',
              flexShrink: 0,
            }}
            aria-label="목장 목록으로 돌아가기"
          >
            ‹
          </button>
        )}
        <span style={{ fontSize: 20 }}>🐄</span>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ct-text, #f1f5f9)', margin: 0 }}>
            {headerTitle}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--ct-text-muted, #94a3b8)', margin: '2px 0 0' }}>
            {headerSub}
          </p>
        </div>
      </div>

      {/* 컨텐츠 */}
      {showFarmList ? (
        /* 전체선택 + 드릴다운 없음 → 목장 리스트 */
        <FarmListView farms={farmListToShow} onSelect={handleFarmSelect} />
      ) : (
        /* 목장 선택됨 → 개체 리스트 */
        <AnimalListView
          animals={filtered}
          isLoading={isLoading}
          filterTab={filterTab}
          onFilterChange={setFilterTab}
          search={search}
          onSearchChange={setSearch}
          totalCount={allAnimals.length}
          sensorCount={sensorCount}
          onAnimalClick={(id) => navigate(`/cow/${id}`)}
        />
      )}
    </div>
  );
}

export default MyCattlePage;
