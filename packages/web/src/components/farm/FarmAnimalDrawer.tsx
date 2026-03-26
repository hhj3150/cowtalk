// 목장 소 목록 드로어 — smaXtec 스타일 개체 리스트
// 목장 클릭 시 전체 센서 삽입 개체 표시 → 소 클릭 → 개체 대시보드

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';

interface Props {
  readonly farmId: string;
  readonly farmName: string;
  readonly onClose: () => void;
  readonly onAnimalClick: (animalId: string) => void;
}

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

const STATUS_MAP: Readonly<Record<string, string>> = {
  Lactating_Cow: '착유우',
  Dry_Cow: '건유우',
  Heifer: '육성우',
  Calf: '송아지',
  Bull: '종모우',
};

export function FarmAnimalDrawer({ farmId, farmName, onClose, onAnimalClick }: Props): React.JSX.Element {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<'earTag' | 'traceId' | 'lactationStatus' | 'daysInMilk'>('earTag');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { data, isLoading } = useQuery({
    queryKey: ['farm-animals', farmId],
    queryFn: () => apiGet<readonly AnimalRecord[]>(`/animals`, { farmId, limit: 500 }),
    staleTime: 30 * 1000,
  });

  const animals = useMemo(() => {
    let list = [...(data ?? [])] as AnimalRecord[];

    // 필터
    if (filterTab === 'sensor') {
      list = list.filter((a) => a.currentDeviceId);
    } else if (filterTab === 'noSensor') {
      list = list.filter((a) => !a.currentDeviceId);
    }

    // 검색
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) =>
        (a.earTag ?? '').toLowerCase().includes(q) ||
        (a.traceId ?? '').toLowerCase().includes(q) ||
        (a.name ?? '').toLowerCase().includes(q)
      );
    }

    // 정렬
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

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortIcon = (field: string) =>
    sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <>
      {/* 오버레이 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 9990,
        }}
      />

      {/* 드로어 패널 — 전체 너비 (smaXtec 스타일) */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 700,
        maxWidth: '100vw',
        background: '#0f172a',
        borderLeft: '1px solid #334155',
        zIndex: 9991,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
      }}>
        {/* 헤더 — smaXtec 스타일 */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid #334155',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.08), transparent)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🐄</span>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
                {farmName}
              </h2>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>
                &gt; 개체 · 총 {totalCount}두 · 센서 {sensorCount}두
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid #334155',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 14,
              padding: '4px 10px',
              borderRadius: 6,
            }}
          >✕ 닫기</button>
        </div>

        {/* 필터 탭 + 검색 */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #1e293b', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {([
            { id: 'all' as const, label: `전체 (${totalCount})` },
            { id: 'sensor' as const, label: `센서 활성 (${sensorCount})` },
            { id: 'noSensor' as const, label: `센서 없음 (${totalCount - sensorCount})` },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                border: '1px solid',
                borderColor: filterTab === tab.id ? '#10b981' : '#334155',
                background: filterTab === tab.id ? 'rgba(16,185,129,0.15)' : 'transparent',
                color: filterTab === tab.id ? '#10b981' : '#94a3b8',
                fontSize: 11,
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
            placeholder="검색..."
            style={{
              marginLeft: 'auto',
              width: 160,
              padding: '5px 10px',
              borderRadius: 6,
              border: '1px solid #334155',
              background: 'rgba(255,255,255,0.05)',
              color: '#f1f5f9',
              fontSize: 12,
              outline: 'none',
            }}
          />
        </div>

        {/* 테이블 헤더 — smaXtec 스타일 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '80px 80px 140px 80px 70px 60px 50px',
          gap: 0,
          padding: '8px 20px',
          borderBottom: '1px solid #334155',
          fontSize: 11,
          fontWeight: 600,
          color: '#94a3b8',
          background: '#1e293b',
        }}>
          <div onClick={() => handleSort('earTag')} style={{ cursor: 'pointer' }}>
            이름{sortIcon('earTag')}
          </div>
          <div>관리번호</div>
          <div onClick={() => handleSort('traceId')} style={{ cursor: 'pointer' }}>
            개체식별번호{sortIcon('traceId')}
          </div>
          <div onClick={() => handleSort('lactationStatus')} style={{ cursor: 'pointer' }}>
            우군{sortIcon('lactationStatus')}
          </div>
          <div>센서</div>
          <div onClick={() => handleSort('daysInMilk')} style={{ cursor: 'pointer' }}>
            착유일{sortIcon('daysInMilk')}
          </div>
          <div>기능</div>
        </div>

        {/* 소 목록 — 테이블 형태 */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
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

          {animals.map((animal) => {
            const hasSensor = !!animal.currentDeviceId;
            const tag = animal.earTag ?? animal.name ?? '-';
            return (
              <div
                key={animal.animalId}
                onClick={() => onAnimalClick(animal.animalId)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 80px 140px 80px 70px 60px 50px',
                  gap: 0,
                  padding: '10px 20px',
                  borderBottom: '1px solid #1e293b',
                  cursor: 'pointer',
                  fontSize: 12,
                  color: '#e2e8f0',
                  transition: '0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16,185,129,0.08)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* 이름 (클릭 가능 — 초록색) */}
                <div style={{ fontWeight: 700, color: '#22c55e' }}>
                  {tag}
                </div>

                {/* 관리번호 */}
                <div style={{ color: '#cbd5e1' }}>
                  {tag}
                </div>

                {/* 개체식별번호 (이력번호) */}
                <div style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>
                  {animal.traceId ?? '-'}
                </div>

                {/* 우군 */}
                <div style={{ color: '#94a3b8' }}>
                  {STATUS_MAP[animal.lactationStatus ?? ''] ?? animal.lactationStatus ?? '-'}
                </div>

                {/* 센서 */}
                <div>
                  {hasSensor ? (
                    <span style={{ color: '#22c55e', fontSize: 14 }}>🟢</span>
                  ) : (
                    <span style={{ color: '#475569', fontSize: 14 }}>⚪</span>
                  )}
                </div>

                {/* 착유일 */}
                <div style={{ color: '#f59e0b', fontWeight: 600 }}>
                  {animal.daysInMilk ?? '-'}
                </div>

                {/* 기능 아이콘들 */}
                <div style={{ display: 'flex', gap: 4, color: '#64748b', fontSize: 12 }}>
                  <span title="개체 정보">📋</span>
                  <span title="차트">📈</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 하단 — 결과 수 */}
        <div style={{
          padding: '8px 20px',
          borderTop: '1px solid #334155',
          fontSize: 11,
          color: '#64748b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#1e293b',
        }}>
          <span>{animals.length}두 표시 {search && `(검색: "${search}")`}</span>
          <span style={{ color: '#10b981', fontWeight: 600 }}>
            소를 클릭하면 개체 대시보드로 이동합니다
          </span>
        </div>
      </div>
    </>
  );
}
