// 우군 그룹 관리 페이지 — /farm/:farmId/groups
// 좌측: 그룹 목록 (착유군, 건유군, 임신군 등)
// 우측: 선택 그룹의 개체 목록 + 체크박스 + 그룹 이동

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '@web/api/client';
import { useIsMobile } from '@web/hooks/useIsMobile';

// ── 타입 ──

interface HerdGroup {
  readonly groupId: string;
  readonly name: string;
  readonly groupType: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly memberCount: number;
}

interface GroupMember {
  readonly animalId: string;
  readonly earTag: string;
  readonly name: string | null;
  readonly parity: number;
  readonly daysInMilk: number | null;
  readonly lactationStatus: string;
  readonly status: string;
}

interface GroupSummary {
  readonly group: { groupId: string; name: string; groupType: string; description: string | null };
  readonly members: readonly GroupMember[];
  readonly memberCount: number;
  readonly alertStats: { total: number; critical: number; high: number; medium: number; low: number };
  readonly anomalies: readonly { type: string; count: number }[];
}

const GROUP_TYPE_ICONS: Readonly<Record<string, string>> = {
  milking: '🥛', dry: '🏖️', pregnant: '🤰', heifer: '🐄',
  young: '🐮', breeding_waiting: '💕', quarantine: '🔒', custom: '📁',
};

const GROUP_TYPE_LABELS: Readonly<Record<string, string>> = {
  milking: '착유군', dry: '건유군', pregnant: '임신군', heifer: '미경산우',
  young: '육성우', breeding_waiting: '번식대기군', quarantine: '격리군', custom: '사용자정의',
};

const EVENT_LABELS: Readonly<Record<string, string>> = {
  temperature_high: '발열', rumination_decrease: '반추↓', activity_decrease: '활동↓',
  estrus: '발정', clinical_condition: '질병의심', health_warning: '건강경고',
};

// ── 메인 컴포넌트 ──

export default function HerdGroupPage(): React.JSX.Element {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [groups, setGroups] = useState<readonly HerdGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAnimals, setSelectedAnimals] = useState<Set<string>>(new Set());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState('custom');

  // 그룹 목록 로드
  const loadGroups = useCallback(async () => {
    if (!farmId) return;
    try {
      const data = await apiGet<readonly HerdGroup[]>(`/herd-groups/farm/${farmId}`);
      setGroups(data);
      if (data.length > 0 && !selectedGroupId) {
        setSelectedGroupId(data[0]!.groupId);
      }
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [farmId, selectedGroupId]);

  // 그룹 요약 로드
  const loadSummary = useCallback(async () => {
    if (!selectedGroupId) { setSummary(null); return; }
    try {
      const data = await apiGet<GroupSummary>(`/herd-groups/${selectedGroupId}/summary`);
      setSummary(data);
    } catch {
      setSummary(null);
    }
  }, [selectedGroupId]);

  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => { loadSummary(); setSelectedAnimals(new Set()); }, [loadSummary]);

  // 그룹 생성
  const createGroup = async () => {
    if (!farmId || !newGroupName.trim()) return;
    await apiPost(`/herd-groups/farm/${farmId}`, {
      name: newGroupName.trim(),
      groupType: newGroupType,
    });
    setNewGroupName('');
    setShowCreateModal(false);
    await loadGroups();
  };

  // 개체 이동
  const moveAnimals = async (toGroupId: string) => {
    if (selectedAnimals.size === 0 || !selectedGroupId) return;
    await apiPost('/herd-groups/move', {
      fromGroupId: selectedGroupId,
      toGroupId,
      animalIds: Array.from(selectedAnimals),
    });
    setSelectedAnimals(new Set());
    await loadGroups();
    await loadSummary();
  };

  const toggleAnimal = (animalId: string) => {
    setSelectedAnimals((prev) => {
      const next = new Set(prev);
      if (next.has(animalId)) next.delete(animalId);
      else next.add(animalId);
      return next;
    });
  };

  const toggleAll = () => {
    if (!summary) return;
    if (selectedAnimals.size === summary.members.length) {
      setSelectedAnimals(new Set());
    } else {
      setSelectedAnimals(new Set(summary.members.map((m) => m.animalId)));
    }
  };

  const totalAnimals = groups.reduce((sum, g) => sum + g.memberCount, 0);

  return (
    <div data-theme="dark" style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)', minHeight: '100vh', padding: isMobile ? '12px 10px' : '20px 24px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={() => navigate(-1)} style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 8, padding: '6px 12px', color: 'var(--ct-text)', cursor: 'pointer', fontSize: 13 }}>← 돌아가기</button>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>🐄 우군 그룹 관리</h1>
          <span style={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>{groups.length}개 그룹 · {totalAnimals}두</span>
        </div>
        <button type="button" onClick={() => setShowCreateModal(true)} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--ct-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>+ 그룹 추가</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--ct-text-muted)' }}>로딩 중...</div>
      ) : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
          <div style={{ color: 'var(--ct-text-muted)' }}>아직 우군 그룹이 없습니다.</div>
          <button type="button" onClick={() => setShowCreateModal(true)} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, background: 'var(--ct-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>첫 그룹 만들기</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '280px 1fr', gap: 16, alignItems: 'start' }}>
          {/* 좌측: 그룹 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {groups.map((g) => (
              <button
                key={g.groupId}
                type="button"
                onClick={() => setSelectedGroupId(g.groupId)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 10,
                  background: g.groupId === selectedGroupId ? 'rgba(59,130,246,0.15)' : 'var(--ct-card)',
                  border: g.groupId === selectedGroupId ? '1px solid var(--ct-primary)' : '1px solid var(--ct-border)',
                  color: 'var(--ct-text)', cursor: 'pointer', textAlign: 'left', width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{GROUP_TYPE_ICONS[g.groupType] ?? '📁'}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{g.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>{GROUP_TYPE_LABELS[g.groupType] ?? g.groupType}</div>
                  </div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ct-primary)' }}>{g.memberCount}</span>
              </button>
            ))}
          </div>

          {/* 우측: 그룹 요약 + 개체 목록 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {summary && (
              <>
                {/* 요약 카드 */}
                <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
                      {GROUP_TYPE_ICONS[summary.group.groupType] ?? '📁'} {summary.group.name}
                      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ct-text-muted)', marginLeft: 8 }}>{summary.memberCount}두</span>
                    </h2>
                    {summary.alertStats.total > 0 && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {summary.alertStats.critical > 0 && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600 }}>긴급 {summary.alertStats.critical}</span>}
                        {summary.alertStats.high > 0 && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(249,115,22,0.15)', color: '#f97316', fontWeight: 600 }}>높음 {summary.alertStats.high}</span>}
                      </div>
                    )}
                  </div>
                  {summary.anomalies.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {summary.anomalies.map((a) => (
                        <span key={a.type} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--ct-bg)', color: 'var(--ct-text-secondary)' }}>
                          {EVENT_LABELS[a.type] ?? a.type} {a.count}두
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 선택 작업 바 */}
                {selectedAnimals.size > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-primary)' }}>{selectedAnimals.size}두 선택</span>
                    <span style={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>→ 이동:</span>
                    {groups.filter((g) => g.groupId !== selectedGroupId).map((g) => (
                      <button key={g.groupId} type="button" onClick={() => moveAnimals(g.groupId)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--ct-card)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)', cursor: 'pointer' }}>
                        {GROUP_TYPE_ICONS[g.groupType] ?? ''} {g.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* 개체 목록 */}
                <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, overflow: 'hidden' }}>
                  {/* 테이블 헤더 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '40px 80px 1fr 60px 70px 80px', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--ct-border)', fontSize: 10, color: 'var(--ct-text-muted)', fontWeight: 600 }}>
                    <div><input type="checkbox" checked={selectedAnimals.size === summary.members.length && summary.members.length > 0} onChange={toggleAll} /></div>
                    <div>귀표번호</div>
                    <div>이름</div>
                    <div>산차</div>
                    <div>DIM</div>
                    <div>상태</div>
                  </div>
                  {/* 개체 행 */}
                  <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                    {summary.members.map((m) => (
                      <div
                        key={m.animalId}
                        style={{
                          display: 'grid', gridTemplateColumns: '40px 80px 1fr 60px 70px 80px', gap: 8,
                          padding: '6px 14px', borderBottom: '1px solid var(--ct-border)',
                          fontSize: 12, alignItems: 'center',
                          background: selectedAnimals.has(m.animalId) ? 'rgba(59,130,246,0.05)' : 'transparent',
                        }}
                      >
                        <div><input type="checkbox" checked={selectedAnimals.has(m.animalId)} onChange={() => toggleAnimal(m.animalId)} /></div>
                        <div>
                          <span
                            style={{ color: 'var(--ct-primary)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 700 }}
                            onClick={() => navigate(`/cow/${m.animalId}`)}
                            role="link"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/cow/${m.animalId}`); }}
                          >
                            {m.earTag}
                          </span>
                        </div>
                        <div style={{ color: 'var(--ct-text-secondary)' }}>{m.name ?? '-'}</div>
                        <div>{m.parity}산</div>
                        <div>{m.daysInMilk != null ? `${String(m.daysInMilk)}일` : '-'}</div>
                        <div>
                          <span style={{
                            fontSize: 10, padding: '1px 6px', borderRadius: 4,
                            background: m.lactationStatus === 'dry' ? 'rgba(234,179,8,0.15)' : m.lactationStatus === 'milking' ? 'rgba(34,197,94,0.15)' : 'var(--ct-bg)',
                            color: m.lactationStatus === 'dry' ? '#eab308' : m.lactationStatus === 'milking' ? '#22c55e' : 'var(--ct-text-muted)',
                          }}>
                            {m.lactationStatus}
                          </span>
                        </div>
                      </div>
                    ))}
                    {summary.members.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 24, color: 'var(--ct-text-muted)', fontSize: 12 }}>
                        이 그룹에 소속된 개체가 없습니다
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 그룹 생성 모달 */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowCreateModal(false)}>
          <div style={{ background: 'var(--ct-card)', borderRadius: 16, padding: 24, width: 360, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 16px' }}>🐄 새 우군 그룹</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: 'var(--ct-text-muted)', display: 'block', marginBottom: 4 }}>그룹 이름</label>
              <input
                type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="예: 착유군 A"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)', fontSize: 13 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--ct-text-muted)', display: 'block', marginBottom: 4 }}>그룹 유형</label>
              <select value={newGroupType} onChange={(e) => setNewGroupType(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)', fontSize: 13 }}>
                {Object.entries(GROUP_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowCreateModal(false)} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--ct-bg)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)', cursor: 'pointer', fontSize: 12 }}>취소</button>
              <button type="button" onClick={createGroup} disabled={!newGroupName.trim()} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--ct-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: newGroupName.trim() ? 1 : 0.5 }}>생성</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
