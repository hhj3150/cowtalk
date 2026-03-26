// 목장 소 목록 드로어 — 센서 클릭 시 해당 목장의 전체 소 표시
// 소 클릭 → /cow/{animalId} 개체 대시보드 이동

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
  readonly lactationStatus: string | null;
  readonly currentDeviceId: string | null;
  readonly status: string;
}

type FilterTab = 'all' | 'sensor' | 'noSensor';

const BREED_MAP: Readonly<Record<string, string>> = {
  holstein: '홀스타인',
  hanwoo: '한우',
  jersey: '저지',
};

const SEX_MAP: Readonly<Record<string, string>> = {
  female: '♀',
  male: '♂',
};

const STATUS_MAP: Readonly<Record<string, string>> = {
  Lactating_Cow: '착유',
  Dry_Cow: '건유',
  Heifer: '육성',
  Calf: '송아지',
  Bull: '종모우',
};

export function FarmAnimalDrawer({ farmId, farmName, onClose, onAnimalClick }: Props): React.JSX.Element {
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['farm-animals', farmId],
    queryFn: () => apiGet<readonly AnimalRecord[]>(`/animals`, { farmId, limit: 500 }),
    staleTime: 30 * 1000,
  });

  const animals = useMemo(() => {
    let list = (data ?? []) as readonly AnimalRecord[];

    // 필터 탭
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

    return list;
  }, [data, filterTab, search]);

  const totalCount = (data ?? []).length;
  const sensorCount = (data ?? []).filter((a: AnimalRecord) => a.currentDeviceId).length;

  return (
    <>
      {/* 오버레이 */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9990,
        }}
      />

      {/* 드로어 패널 */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 480,
        maxWidth: '100vw',
        background: 'var(--ct-bg, #0f172a)',
        borderLeft: '1px solid var(--ct-border, #334155)',
        zIndex: 9991,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.3)',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--ct-border, #334155)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ct-text, #f1f5f9)', margin: 0 }}>
              🐄 {farmName}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--ct-text-muted, #94a3b8)', margin: '4px 0 0' }}>
              총 {totalCount}두 · 센서 {sensorCount}두
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ct-text-muted, #94a3b8)',
              cursor: 'pointer',
              fontSize: 20,
              padding: 4,
            }}
          >✕</button>
        </div>

        {/* 필터 탭 + 검색 */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--ct-border, #334155)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {([
              { id: 'all' as const, label: `전체 (${totalCount})` },
              { id: 'sensor' as const, label: `센서 활성 (${sensorCount})` },
              { id: 'noSensor' as const, label: `센서 없음 (${totalCount - sensorCount})` },
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
                  color: filterTab === tab.id ? '#10b981' : 'var(--ct-text-secondary, #cbd5e1)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="관리번호 · 이력번호 검색..."
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--ct-border, #334155)',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--ct-text, #f1f5f9)',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* 소 목록 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ct-text-muted)' }}>
              로딩 중...
            </div>
          )}

          {!isLoading && animals.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ct-text-muted)' }}>
              {search ? '검색 결과가 없습니다' : '등록된 소가 없습니다'}
            </div>
          )}

          {animals.map((animal) => {
            const hasSensor = !!animal.currentDeviceId;
            return (
              <button
                key={animal.animalId}
                type="button"
                onClick={() => onAnimalClick(animal.animalId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '10px 12px',
                  marginBottom: 4,
                  borderRadius: 8,
                  border: '1px solid transparent',
                  background: 'rgba(255,255,255,0.03)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: '0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.borderColor = 'var(--ct-border, #334155)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  e.currentTarget.style.borderColor = 'transparent';
                }}
              >
                {/* 센서 상태 인디케이터 */}
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: hasSensor ? '#22c55e' : '#475569',
                  flexShrink: 0,
                }} />

                {/* 번호 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text, #f1f5f9)' }}>
                    #{animal.earTag ?? animal.name ?? '-'}
                    <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ct-text-muted)', marginLeft: 6 }}>
                      {SEX_MAP[animal.sex ?? ''] ?? ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ct-text-muted, #64748b)', marginTop: 2 }}>
                    {animal.traceId ?? '-'} · {BREED_MAP[(animal.breed ?? '').toLowerCase()] ?? animal.breed ?? '-'}
                  </div>
                </div>

                {/* 상태 */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: hasSensor ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
                    color: hasSensor ? '#22c55e' : '#64748b',
                    fontWeight: 600,
                  }}>
                    {STATUS_MAP[animal.lactationStatus ?? ''] ?? animal.lactationStatus ?? '-'}
                  </div>
                </div>

                {/* 화살표 */}
                <span style={{ color: 'var(--ct-text-muted)', fontSize: 14 }}>›</span>
              </button>
            );
          })}
        </div>

        {/* 하단 — 결과 수 */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid var(--ct-border, #334155)',
          fontSize: 11,
          color: 'var(--ct-text-muted, #64748b)',
          textAlign: 'center',
        }}>
          {animals.length}두 표시 {search && `(검색: "${search}")`}
        </div>
      </div>
    </>
  );
}
