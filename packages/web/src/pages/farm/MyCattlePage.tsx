// 내 소 — 사용자 담당 목장의 전체 소 목록
// "내 소" 탭 클릭 → 이 페이지 → 소 클릭 → 개체 대시보드(CowProfilePage)

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

type FilterTab = 'all' | 'sensor' | 'noSensor';
type SortField = 'earTag' | 'traceId' | 'lactationStatus' | 'daysInMilk';

const STATUS_MAP: Readonly<Record<string, string>> = {
  Lactating_Cow: '착유우',
  Dry_Cow: '건유우',
  Heifer: '육성우',
  Calf: '송아지',
  Bull: '종모우',
};

function MyCattlePage(): React.JSX.Element {
  const navigate = useNavigate();
  const farmIds = useAuthStore((s) => s.user?.farmIds);
  const farms = useFarmStore((s) => s.farms);
  const primaryFarmId = farmIds?.[0];

  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('earTag');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const farmName = useMemo(() => {
    if (!primaryFarmId || !farms) return '내 목장';
    const farm = farms.find((f) => f.farmId === primaryFarmId);
    return farm?.name ?? '내 목장';
  }, [primaryFarmId, farms]);

  const { data, isLoading } = useQuery({
    queryKey: ['my-cattle', primaryFarmId],
    queryFn: () => apiGet<readonly AnimalRecord[]>('/animals', { farmId: primaryFarmId, limit: 500 }),
    staleTime: 30 * 1000,
    enabled: !!primaryFarmId,
  });

  const animals = useMemo(() => {
    let list = [...(data ?? [])] as AnimalRecord[];

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

    list.sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[sortField] ?? '');
      const bv = String((b as unknown as Record<string, unknown>)[sortField] ?? '');
      const cmp = av.localeCompare(bv, 'ko', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [data, filterTab, search, sortField, sortDir]);

  const totalCount = (data ?? []).length;
  const sensorCount = (data ?? []).filter((a: AnimalRecord) => a.currentDeviceId).length;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortIcon = (field: string) =>
    sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  // 목장 미배정
  if (!primaryFarmId) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
        <p style={{ fontSize: 48, marginBottom: 16 }}>🐄</p>
        <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>담당 목장이 없습니다</p>
        <p style={{ fontSize: 13 }}>관리자에게 목장 배정을 요청하세요</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* 헤더 */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--ct-border, #334155)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'linear-gradient(135deg, rgba(16,185,129,0.08), transparent)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 20 }}>🐄</span>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ct-text, #f1f5f9)', margin: 0 }}>
            내 소
          </h1>
          <p style={{ fontSize: 12, color: 'var(--ct-text-muted, #94a3b8)', margin: '2px 0 0' }}>
            {farmName} · 총 {totalCount}두 · 센서 {sensorCount}두
          </p>
        </div>
      </div>

      {/* 필터 탭 + 검색 */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--ct-border, #1e293b)',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        {([
          { id: 'all' as const, label: `전체 (${totalCount})` },
          { id: 'sensor' as const, label: `센서 (${sensorCount})` },
          { id: 'noSensor' as const, label: `없음 (${totalCount - sensorCount})` },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterTab(tab.id)}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid',
              borderColor: filterTab === tab.id ? '#10b981' : 'var(--ct-border, #334155)',
              background: filterTab === tab.id ? 'rgba(16,185,129,0.15)' : 'transparent',
              color: filterTab === tab.id ? '#10b981' : 'var(--ct-text-muted, #94a3b8)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="이름 / 이력번호 검색..."
          aria-label="소 검색"
          style={{
            marginLeft: 'auto',
            width: 160,
            maxWidth: '40%',
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--ct-border, #334155)',
            background: 'rgba(255,255,255,0.05)',
            color: 'var(--ct-text, #f1f5f9)',
            fontSize: 12,
            outline: 'none',
          }}
        />
      </div>

      {/* 소 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 70 }}>
        {isLoading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            로딩 중...
          </div>
        )}

        {!isLoading && animals.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            {search ? '검색 결과가 없습니다' : '등록된 소가 없습니다'}
          </div>
        )}

        {/* 데스크톱: 테이블 헤더 */}
        {!isLoading && animals.length > 0 && (
          <div
            className="hidden md:grid"
            style={{
              gridTemplateColumns: '1fr 1fr 160px 80px 60px 60px',
              padding: '8px 16px',
              borderBottom: '1px solid var(--ct-border, #334155)',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--ct-text-muted, #94a3b8)',
              background: 'var(--ct-bg, #1e293b)',
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}
          >
            <div onClick={() => handleSort('earTag')} style={{ cursor: 'pointer' }}>
              이름/관리번호{sortIcon('earTag')}
            </div>
            <div onClick={() => handleSort('traceId')} style={{ cursor: 'pointer' }}>
              개체식별번호{sortIcon('traceId')}
            </div>
            <div onClick={() => handleSort('lactationStatus')} style={{ cursor: 'pointer' }}>
              상태{sortIcon('lactationStatus')}
            </div>
            <div>센서</div>
            <div onClick={() => handleSort('daysInMilk')} style={{ cursor: 'pointer' }}>
              DIM{sortIcon('daysInMilk')}
            </div>
            <div />
          </div>
        )}

        {/* 모바일: 카드 / 데스크톱: 행 */}
        {animals.map((animal) => {
          const hasSensor = !!animal.currentDeviceId;
          const tag = animal.earTag ?? animal.name ?? '-';
          const statusLabel = STATUS_MAP[animal.lactationStatus ?? ''] ?? animal.lactationStatus ?? '-';

          return (
            <div
              key={animal.animalId}
              onClick={() => navigate(`/cow/${animal.animalId}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/cow/${animal.animalId}`); }}
              style={{ cursor: 'pointer', borderBottom: '1px solid var(--ct-border, #1e293b)' }}
            >
              {/* 모바일 카드 */}
              <div
                className="md:hidden"
                style={{
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: hasSensor ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  flexShrink: 0,
                }}>
                  {hasSensor ? '🟢' : '⚪'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>{tag}</span>
                    <span style={{
                      fontSize: 10,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'rgba(16,185,129,0.12)',
                      color: '#10b981',
                      fontWeight: 600,
                    }}>
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ct-text-muted, #94a3b8)', fontFamily: 'monospace' }}>
                    {animal.traceId ?? '이력번호 없음'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {animal.daysInMilk != null && (
                    <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                      DIM {animal.daysInMilk}
                    </div>
                  )}
                  <div style={{ fontSize: 18, color: '#64748b' }}>›</div>
                </div>
              </div>

              {/* 데스크톱 행 */}
              <div
                className="hidden md:grid"
                style={{
                  gridTemplateColumns: '1fr 1fr 160px 80px 60px 60px',
                  padding: '10px 16px',
                  fontSize: 12,
                  color: 'var(--ct-text, #e2e8f0)',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16,185,129,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ fontWeight: 700, color: '#22c55e' }}>{tag}</div>
                <div style={{ color: 'var(--ct-text-muted, #94a3b8)', fontFamily: 'monospace', fontSize: 11 }}>
                  {animal.traceId ?? '-'}
                </div>
                <div style={{ color: 'var(--ct-text-muted, #94a3b8)' }}>{statusLabel}</div>
                <div>{hasSensor ? '🟢' : '⚪'}</div>
                <div style={{ color: '#f59e0b', fontWeight: 600 }}>
                  {animal.daysInMilk ?? '-'}
                </div>
                <div style={{ color: '#64748b' }}>›</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 카운트 */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid var(--ct-border, #334155)',
        fontSize: 11,
        color: '#64748b',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--ct-bg, #1e293b)',
        flexShrink: 0,
      }}>
        <span>{animals.length}두 표시 {search && `(검색: "${search}")`}</span>
        <span style={{ color: '#10b981', fontSize: 10 }}>
          소를 터치하면 개체 대시보드로 이동
        </span>
      </div>
    </div>
  );
}

export default MyCattlePage;
