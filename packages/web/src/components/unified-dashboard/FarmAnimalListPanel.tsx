// 선택 농장 개체 목록 — 인라인 패널 (팝업 드로어 대체)
// 방역관 대시보드 스타일: 대시보드에 인라인 섹션으로 렌더, 검색·필터 내장

import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
  readonly currentDeviceId?: string | null;
  readonly farmName?: string | null;
}

export interface FarmAnimalListPanelProps {
  readonly farmId: string;
  readonly farmName: string;
  readonly farmHeadCount?: number | null;
}

type FilterTab = 'all' | 'sensor' | 'noSensor';

const STATUS_COLOR: Readonly<Record<string, string>> = {
  Lactating_Cow: '#22c55e',
  milking:       '#22c55e',
  Dry_Cow:       '#f59e0b',
  dry:           '#f59e0b',
  Heifer:        '#60a5fa',
  heifer:        '#60a5fa',
  Calf:          '#a78bfa',
  calf:          '#a78bfa',
};

const STATUS_LABEL: Readonly<Record<string, string>> = {
  Lactating_Cow: '착유',
  milking:       '착유',
  Dry_Cow:       '건유',
  dry:           '건유',
  Heifer:        '육성',
  heifer:        '육성',
  Calf:          '송아지',
  calf:          '송아지',
};

export function FarmAnimalListPanel({
  farmId,
  farmName,
  farmHeadCount,
}: FarmAnimalListPanelProps): React.JSX.Element {
  const navigate = useNavigate();
  const [animals, setAnimals] = useState<readonly AnimalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [collapsed, setCollapsed] = useState(false);

  const loadAnimals = useCallback(async (fid: string) => {
    setLoading(true);
    setAnimals([]);
    try {
      const res = await apiGet<readonly AnimalRow[]>(`/animals?farmId=${fid}&status=active&limit=500`);
      setAnimals(res ?? []);
    } catch {
      setAnimals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (farmId) {
      loadAnimals(farmId);
      setSearchText('');
      setFilterTab('all');
    }
  }, [farmId, loadAnimals]);

  const totalCount = animals.length;
  const sensorCount = animals.filter((a) => a.currentDeviceId).length;

  const filtered = useMemo(() => {
    let list = animals;
    if (filterTab === 'sensor') {
      list = list.filter((a) => a.currentDeviceId);
    } else if (filterTab === 'noSensor') {
      list = list.filter((a) => !a.currentDeviceId);
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter((a) =>
        a.earTag.toLowerCase().includes(q) ||
        (a.name ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [animals, filterTab, searchText]);

  return (
    <div style={{
      background: 'var(--ct-card)',
      borderRadius: 14,
      border: '1px solid var(--ct-border)',
      overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: collapsed ? 'none' : '1px solid var(--ct-border)',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.08), transparent)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 18 }}>🐄</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ct-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {farmName} 개체 목록
          </span>
          <span style={{ fontSize: 11, color: 'var(--ct-text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
            총 {farmHeadCount ?? totalCount}두 · 센서 {sensorCount}두
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? '펼치기' : '접기'}
          style={{
            background: 'none',
            border: '1px solid var(--ct-border)',
            color: 'var(--ct-text-muted)',
            cursor: 'pointer',
            fontSize: 12,
            padding: '4px 10px',
            borderRadius: 6,
          }}
        >
          {collapsed ? '펼치기 ▾' : '접기 ▴'}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* 필터 + 검색 */}
          <div style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            padding: '10px 16px',
            borderBottom: '1px solid var(--ct-border)',
          }}>
            {([
              { id: 'all' as const, label: `전체 (${totalCount})` },
              { id: 'sensor' as const, label: `센서 활성 (${sensorCount})` },
              { id: 'noSensor' as const, label: `센서 없음 (${totalCount - sensorCount})` },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: filterTab === tab.id ? '#10b981' : 'var(--ct-border)',
                  background: filterTab === tab.id ? 'rgba(16,185,129,0.15)' : 'transparent',
                  color: filterTab === tab.id ? '#10b981' : 'var(--ct-text-muted)',
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
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="귀표번호 / 이름 검색..."
              aria-label="개체 검색"
              style={{
                marginLeft: 'auto',
                flex: '1 1 200px',
                maxWidth: 280,
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid var(--ct-border)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--ct-text)',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 개체 그리드 */}
          <div style={{
            maxHeight: 420,
            overflowY: 'auto',
            padding: 8,
          }}>
            {loading && (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--ct-text-muted)', fontSize: 12 }}>
                개체 목록 로딩 중...
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--ct-text-muted)', fontSize: 12 }}>
                {searchText ? '검색 결과 없음' : '활성 개체 없음'}
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 6,
              }}>
                {filtered.map((a) => {
                  const dot = STATUS_COLOR[a.lactationStatus ?? ''] ?? '#64748b';
                  const lbl = STATUS_LABEL[a.lactationStatus ?? ''] ?? '기타';
                  const hasSensor = !!a.currentDeviceId;
                  return (
                    <button
                      key={a.animalId}
                      type="button"
                      onClick={() => navigate(`/animals/${a.animalId}`)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '9px 10px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--ct-border)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.1s, border-color 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(16,185,129,0.08)';
                        e.currentTarget.style.borderColor = '#10b981';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                        e.currentTarget.style.borderColor = 'var(--ct-border)';
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--ct-text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {a.earTag}
                          {a.name && a.name !== a.earTag && (
                            <span style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginLeft: 6, fontWeight: 500 }}>
                              {a.name}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 2 }}>
                          {lbl}
                          {a.daysInMilk != null && ` · DIM ${a.daysInMilk}일`}
                          {a.parity != null && ` · ${a.parity}산`}
                        </div>
                      </div>
                      <span style={{ fontSize: 12, flexShrink: 0 }} title={hasSensor ? '센서 활성' : '센서 없음'}>
                        {hasSensor ? '🟢' : '⚪'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 푸터 */}
          {!loading && filtered.length > 0 && (
            <div style={{
              padding: '8px 16px',
              borderTop: '1px solid var(--ct-border)',
              fontSize: 11,
              color: 'var(--ct-text-muted)',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <span>{filtered.length}두 표시 {searchText && `(전체 ${totalCount}두 중)`}</span>
              <span style={{ color: '#10b981', fontWeight: 600 }}>개체를 클릭하면 상세 페이지로 이동합니다</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
