// 목장 선택 → 우측 슬라이드 패널 — 개체 리스트 (트리 구조)
// 전체목장 → 목장 선택 → 개체 리스트 → 클릭 시 개체 페이지 이동

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '@web/api/client';

interface AnimalRow {
  readonly animalId: string;
  readonly earTag: string;
  readonly name: string | null;
  readonly lactationStatus: string | null;
  readonly status: string;
  readonly daysInMilk: number | null;
  readonly parity: number | null;
  readonly farmName?: string | null;
}

interface Farm {
  readonly farmId: string;
  readonly name: string;
  readonly currentHeadCount?: number | null;
}

export interface FarmAnimalDrawerProps {
  readonly isOpen: boolean;
  readonly selectedFarmId: string | null;
  readonly farms: readonly Farm[];
  readonly onClose: () => void;
  readonly onFarmSelect: (farmId: string) => void;
}

const STATUS_COLOR: Record<string, string> = {
  Lactating_Cow: '#22c55e',
  milking:       '#22c55e',
  Dry_Cow:       '#f59e0b',
  dry:           '#f59e0b',
  Heifer:        '#60a5fa',
  heifer:        '#60a5fa',
  Calf:          '#a78bfa',
  calf:          '#a78bfa',
};

const STATUS_LABEL: Record<string, string> = {
  Lactating_Cow: '착유',
  milking:       '착유',
  Dry_Cow:       '건유',
  dry:           '건유',
  Heifer:        '육성',
  heifer:        '육성',
  Calf:          '송아지',
  calf:          '송아지',
};

export function FarmAnimalDrawer({
  isOpen,
  selectedFarmId,
  farms,
  onClose,
  onFarmSelect,
}: FarmAnimalDrawerProps): React.JSX.Element {
  const navigate = useNavigate();
  const [animals, setAnimals] = useState<AnimalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const loadAnimals = useCallback(async (farmId: string) => {
    setLoading(true);
    setAnimals([]);
    try {
      const res = await apiGet<{ data: AnimalRow[] }>(`/animals?farmId=${farmId}&status=active&limit=500`);
      setAnimals(res?.data ?? []);
    } catch {
      setAnimals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && selectedFarmId) {
      loadAnimals(selectedFarmId);
      setSearchText('');
    }
  }, [isOpen, selectedFarmId, loadAnimals]);

  const filtered = animals.filter((a) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      a.earTag.toLowerCase().includes(q) ||
      (a.name ?? '').toLowerCase().includes(q)
    );
  });

  const selectedFarm = farms.find((f) => f.farmId === selectedFarmId);

  return (
    <>
      {/* 배경 오버레이 */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.45)',
          }}
        />
      )}

      {/* 드로어 패널 */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        zIndex: 201,
        background: '#1a1f2e',
        borderLeft: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
      }}>
        {/* ── 헤더 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid #334155',
          background: '#0f172a',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🏠</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
              {selectedFarm ? selectedFarm.name : '목장 선택'}
            </span>
            {selectedFarm?.currentHeadCount && (
              <span style={{ fontSize: 11, color: '#64748b', background: '#1e293b', padding: '2px 6px', borderRadius: 10 }}>
                {selectedFarm.currentHeadCount}두
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#94a3b8',
              cursor: 'pointer', fontSize: 18, padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* ── 목장 선택기 (트리 1단계) ── */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b' }}>
          <select
            value={selectedFarmId ?? ''}
            onChange={(e) => onFarmSelect(e.target.value)}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 6,
              background: '#0f172a', border: '1px solid #334155',
              color: '#f1f5f9', fontSize: 12, cursor: 'pointer',
            }}
          >
            <option value="">— 목장을 선택하세요 —</option>
            {farms.map((f) => (
              <option key={f.farmId} value={f.farmId}>
                {f.name} {f.currentHeadCount ? `(${f.currentHeadCount}두)` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* ── 검색 ── */}
        {selectedFarmId && (
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b' }}>
            <input
              type="text"
              placeholder="귀표번호 / 이름 검색..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 6,
                background: '#0f172a', border: '1px solid #334155',
                color: '#f1f5f9', fontSize: 12,
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {/* ── 개체 리스트 (트리 2단계) ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {!selectedFarmId && (
            <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 12 }}>
              위에서 목장을 선택하세요
            </div>
          )}

          {selectedFarmId && loading && (
            <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 12 }}>
              개체 목록 로딩 중...
            </div>
          )}

          {selectedFarmId && !loading && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 12 }}>
              {searchText ? '검색 결과 없음' : '활성 개체 없음'}
            </div>
          )}

          {filtered.map((a) => {
            const dot = STATUS_COLOR[a.lactationStatus ?? ''] ?? '#64748b';
            const lbl = STATUS_LABEL[a.lactationStatus ?? ''] ?? '기타';
            return (
              <button
                key={a.animalId}
                type="button"
                onClick={() => { navigate(`/animals/${a.animalId}`); onClose(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '9px 14px',
                  background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                  borderBottom: '1px solid #1e293b',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#1e293b'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                {/* 상태 점 */}
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />

                {/* 귀표 + 이름 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.earTag}
                    {a.name && a.name !== a.earTag && (
                      <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 6 }}>{a.name}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                    {lbl}
                    {a.daysInMilk != null && ` · DIM ${a.daysInMilk}일`}
                    {a.parity != null && ` · ${a.parity}산`}
                  </div>
                </div>

                {/* 화살표 */}
                <span style={{ color: '#475569', fontSize: 11 }}>›</span>
              </button>
            );
          })}
        </div>

        {/* ── 푸터 ── */}
        {selectedFarmId && !loading && filtered.length > 0 && (
          <div style={{
            padding: '8px 14px',
            borderTop: '1px solid #1e293b',
            fontSize: 10, color: '#475569', textAlign: 'right',
          }}>
            {filtered.length}두 표시 {searchText && `(전체 ${animals.length}두 중)`}
          </div>
        )}
      </div>
    </>
  );
}
