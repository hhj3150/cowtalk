// 농장 그룹 선택기 — 다중 농장 체크 + 그룹 저장/불러오기
import React, { useState, useMemo } from 'react';
import { useFarmGroupStore } from '@web/stores/farm-group.store';
import { useFarmStore } from '@web/stores/farm.store';
import { useDashboardFarms } from '@web/hooks/useUnifiedDashboard';
import { useIsMobile } from '@web/hooks/useIsMobile';
import { apiPost } from '@web/api/client';

export function FarmGroupSelector(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [showAccountCreate, setShowAccountCreate] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountRole, setAccountRole] = useState('veterinarian');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountMsg, setAccountMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const isMobile = useIsMobile();

  const { data: farmsData } = useDashboardFarms();
  const farms = farmsData?.farms ?? [];

  const {
    customSelection,
    savedGroups,
    activeGroupId,
    toggleFarm,
    selectAll,
    clearSelection,
    saveGroup,
    deleteGroup,
    activateGroup,
  } = useFarmGroupStore();

  const selectFarm = useFarmStore((s) => s.selectFarm);
  const selectFarmGroup = useFarmStore((s) => s.selectFarmGroup);

  // 검색 필터
  const filteredFarms = useMemo(() => {
    if (!search.trim()) return farms;
    const q = search.toLowerCase();
    return farms.filter((f) =>
      f.name.toLowerCase().includes(q) ||
      (f.farmId ?? '').toLowerCase().includes(q)
    );
  }, [farms, search]);

  const selectedCount = customSelection.length;
  const totalCount = farms.length;

  const handleActivateGroup = (groupId: string | null): void => {
    activateGroup(groupId);
    if (!groupId) {
      selectFarm(null);
    }
  };

  const handleSaveGroup = (): void => {
    if (groupName.trim() && customSelection.length > 0) {
      saveGroup(groupName.trim());
      setGroupName('');
      setShowSaveInput(false);
    }
  };

  const handleCreateAccount = (): void => {
    if (!accountEmail.trim() || !accountName.trim() || !accountPassword.trim() || customSelection.length === 0) return;
    setIsCreating(true);
    setAccountMsg(null);
    apiPost<{ userId: string }>('/auth/register', {
      email: accountEmail.trim(),
      name: accountName.trim(),
      password: accountPassword.trim(),
      role: accountRole,
      farmIds: customSelection,
    }).then(() => {
      setAccountMsg({ ok: true, text: `✅ ${accountName} 계정 생성 완료! (${accountEmail})` });
      setAccountEmail('');
      setAccountName('');
      setAccountPassword('');
      setIsCreating(false);
    }).catch((err) => {
      setAccountMsg({ ok: false, text: `❌ 실패: ${err instanceof Error ? err.message : String(err)}` });
      setIsCreating(false);
    });
  };

  const handleApply = (): void => {
    if (customSelection.length === 0) {
      selectFarm(null); // 전체
    } else {
      selectFarmGroup(customSelection); // 다중 선택 → farmStore에 반영
    }
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* 트리거 버튼 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 600,
          background: selectedCount > 0 ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--ct-bg)',
          color: selectedCount > 0 ? '#fff' : 'var(--ct-text-secondary)',
          border: `1px solid ${selectedCount > 0 ? 'transparent' : 'var(--ct-border)'}`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        📋 {selectedCount > 0 ? `${selectedCount}개 선택` : '그룹'}
        <span style={{ fontSize: 10 }}>▾</span>
      </button>

      {/* 드롭다운 패널 */}
      {open && (
        <>
          {/* 배경 오버레이 */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />

          <div style={{
            position: 'absolute',
            top: '110%',
            left: 0,
            width: isMobile ? '90vw' : 400,
            maxHeight: '70vh',
            background: 'var(--ct-card)',
            border: '1px solid var(--ct-border)',
            borderRadius: 12,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* 헤더 */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ct-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ct-text)', margin: 0 }}>
                  📋 농장 그룹 선택
                </h3>
                <span style={{ fontSize: 11, color: 'var(--ct-primary)', fontWeight: 700 }}>
                  {selectedCount}/{totalCount}
                </span>
              </div>

              {/* 검색 */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="농장 검색..."
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--ct-border)',
                  background: 'var(--ct-bg)',
                  color: 'var(--ct-text)',
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* 저장된 그룹 */}
            {savedGroups.length > 0 && (
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--ct-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ct-text-muted)', marginBottom: 6 }}>
                  저장된 그룹
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleActivateGroup(null)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: !activeGroupId ? 700 : 400,
                      background: !activeGroupId ? 'var(--ct-primary)' : 'var(--ct-bg)',
                      color: !activeGroupId ? '#fff' : 'var(--ct-text-secondary)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    전체 ({totalCount})
                  </button>
                  {savedGroups.map((g) => (
                    <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <button
                        type="button"
                        onClick={() => handleActivateGroup(g.id)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: activeGroupId === g.id ? 700 : 400,
                          background: activeGroupId === g.id ? 'var(--ct-primary)' : 'var(--ct-bg)',
                          color: activeGroupId === g.id ? '#fff' : 'var(--ct-text-secondary)',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {g.name} ({g.farmIds.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteGroup(g.id)}
                        style={{
                          padding: '2px 4px',
                          borderRadius: 3,
                          fontSize: 9,
                          background: 'transparent',
                          color: 'var(--ct-text-muted)',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 전체 선택/해제 */}
            <div style={{ padding: '6px 16px', display: 'flex', gap: 8, borderBottom: '1px solid var(--ct-border)' }}>
              <button
                type="button"
                onClick={() => selectAll(farms.map((f) => f.farmId))}
                style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, background: 'var(--ct-bg)', color: 'var(--ct-text-secondary)', border: '1px solid var(--ct-border)', cursor: 'pointer' }}
              >
                전체 선택
              </button>
              <button
                type="button"
                onClick={clearSelection}
                style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, background: 'var(--ct-bg)', color: 'var(--ct-text-secondary)', border: '1px solid var(--ct-border)', cursor: 'pointer' }}
              >
                전체 해제
              </button>
            </div>

            {/* 농장 목록 */}
            <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px', maxHeight: 300 }}>
              {filteredFarms.map((farm) => {
                const isSelected = customSelection.includes(farm.farmId);
                return (
                  <label
                    key={farm.farmId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
                      fontSize: 12,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleFarm(farm.farmId)}
                      style={{ accentColor: 'var(--ct-primary)', width: 16, height: 16 }}
                    />
                    <span style={{
                      fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? 'var(--ct-text)' : 'var(--ct-text-secondary)',
                      flex: 1,
                    }}>
                      {farm.name}
                    </span>
                    {isSelected && (
                      <span style={{ fontSize: 10, color: 'var(--ct-primary)' }}>✓</span>
                    )}
                  </label>
                );
              })}
            </div>

            {/* 하단 액션 */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--ct-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
              {showSaveInput ? (
                <>
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="그룹 이름 (예: A동물병원)"
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveGroup()}
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      borderRadius: 4,
                      border: '1px solid var(--ct-border)',
                      background: 'var(--ct-bg)',
                      color: 'var(--ct-text)',
                      fontSize: 11,
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveGroup}
                    style={{ padding: '5px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: 'var(--ct-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveInput(false)}
                    style={{ padding: '5px 8px', borderRadius: 4, fontSize: 11, background: 'transparent', color: 'var(--ct-text-muted)', border: 'none', cursor: 'pointer' }}
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  {selectedCount > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowSaveInput(true)}
                        style={{ padding: '5px 10px', borderRadius: 4, fontSize: 11, background: 'var(--ct-bg)', color: 'var(--ct-text-secondary)', border: '1px solid var(--ct-border)', cursor: 'pointer' }}
                      >
                        💾 그룹 저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAccountCreate(!showAccountCreate)}
                        style={{ padding: '5px 10px', borderRadius: 4, fontSize: 11, background: showAccountCreate ? '#ef4444' : '#22c55e', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                      >
                        {showAccountCreate ? '✕ 닫기' : '👤 계정 생성'}
                      </button>
                    </>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={handleApply}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      background: 'var(--ct-primary)',
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    적용 ({selectedCount > 0 ? `${selectedCount}개` : '전체'})
                  </button>
                </>
              )}
            </div>

            {/* 계정 생성 폼 */}
            {showAccountCreate && selectedCount > 0 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--ct-border)', background: 'rgba(34,197,94,0.05)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', marginBottom: 8 }}>
                  👤 선택한 {selectedCount}개 농장에 대한 계정 생성
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="이름 (예: 고려동물병원)"
                    style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)', fontSize: 11, outline: 'none' }}
                  />
                  <input
                    type="email"
                    value={accountEmail}
                    onChange={(e) => setAccountEmail(e.target.value)}
                    placeholder="이메일 (예: korea-vet@cowtalk.kr)"
                    style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)', fontSize: 11, outline: 'none' }}
                  />
                  <input
                    type="password"
                    value={accountPassword}
                    onChange={(e) => setAccountPassword(e.target.value)}
                    placeholder="비밀번호"
                    style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)', fontSize: 11, outline: 'none' }}
                  />
                  <select
                    value={accountRole}
                    onChange={(e) => setAccountRole(e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)', fontSize: 11, outline: 'none' }}
                  >
                    <option value="veterinarian">🩺 수의사</option>
                    <option value="inseminator">💉 수정사</option>
                    <option value="farmer">🧑‍🌾 농장주</option>
                    <option value="quarantine_officer">🛡️ 방역관</option>
                    <option value="feed_company">🌾 사료회사</option>
                    <option value="government_admin">🏛️ 행정관리</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleCreateAccount}
                    disabled={isCreating || !accountEmail || !accountName || !accountPassword}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      background: isCreating ? '#64748b' : '#22c55e',
                      color: '#fff',
                      border: 'none',
                      cursor: isCreating ? 'wait' : 'pointer',
                    }}
                  >
                    {isCreating ? '생성 중...' : `👤 계정 생성 (${selectedCount}개 농장 배정)`}
                  </button>
                  {accountMsg && (
                    <div style={{ fontSize: 11, color: accountMsg.ok ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                      {accountMsg.text}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
