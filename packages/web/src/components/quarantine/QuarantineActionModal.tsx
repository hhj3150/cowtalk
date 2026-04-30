// 방역조치 발령 모달 — quarantine_officer가 농장에 격리/이동제한/소독/백신/도태/모니터링 발령
// 백엔드: POST /api/quarantine-action
// 호출처: QuarantineDashboard TOP5 위험 농장 행 + 방역 시뮬레이션 등

import React, { useState } from 'react';
import { apiPost } from '@web/api/client';

export type ActionType =
  | 'isolation'              // 격리
  | 'movement_restriction'   // 이동제한
  | 'disinfection'           // 소독
  | 'vaccination'            // 백신접종
  | 'culling'                // 도태
  | 'monitoring';            // 모니터링

interface ActionTypeConfig {
  readonly key: ActionType;
  readonly icon: string;
  readonly label: string;
  readonly desc: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
}

const ACTION_TYPES: readonly ActionTypeConfig[] = [
  { key: 'isolation', icon: '🚫', label: '격리 발령', desc: '해당 농장 외부 접근 차단', severity: 'critical' },
  { key: 'movement_restriction', icon: '🛑', label: '이동제한', desc: '가축·차량·사람 이동 통제', severity: 'high' },
  { key: 'disinfection', icon: '🧪', label: '소독 명령', desc: '시설·차량·축사 전체 소독', severity: 'medium' },
  { key: 'vaccination', icon: '💉', label: '백신 접종', desc: '예방 백신 일제 접종 지시', severity: 'medium' },
  { key: 'culling', icon: '⚠️', label: '살처분', desc: '법정전염병 확진 시 농장주 통보', severity: 'critical' },
  { key: 'monitoring', icon: '👁️', label: '집중 모니터링', desc: '24시간 센서·임상관찰 강화', severity: 'low' },
];

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
};

interface CreateActionResponse {
  readonly id: string;
  readonly farmId: string;
  readonly actionType: ActionType;
  readonly status: string;
}

interface Props {
  readonly farmId: string;
  readonly farmName: string;
  readonly investigationId?: string;
  readonly clusterId?: string;
  readonly defaultAction?: ActionType;
  readonly onClose: () => void;
  readonly onSuccess?: (action: CreateActionResponse) => void;
}

export function QuarantineActionModal({
  farmId, farmName, investigationId, clusterId, defaultAction,
  onClose, onSuccess,
}: Props): React.JSX.Element {
  const [selectedType, setSelectedType] = useState<ActionType | null>(defaultAction ?? null);
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateActionResponse | null>(null);

  // ESC로 닫기
  React.useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, submitting]);

  async function handleSubmit(): Promise<void> {
    if (!selectedType) { setError('방역조치 유형을 선택해 주세요'); return; }
    if (!description.trim()) { setError('조치 사유·내용을 입력해 주세요'); return; }

    setError(null);
    setSubmitting(true);

    try {
      const data = await apiPost<CreateActionResponse>('/quarantine-action', {
        farmId,
        actionType: selectedType,
        description: description.trim(),
        ...(investigationId ? { investigationId } : {}),
        ...(clusterId ? { clusterId } : {}),
        ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
      });
      setSuccess(data);
      onSuccess?.(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`발령 실패: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ textAlign: 'center', padding: '20px 12px' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, color: 'var(--ct-text)' }}>
              방역조치 발령 완료
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--ct-text-muted)' }}>
              {farmName} → {ACTION_TYPES.find((a) => a.key === success.actionType)?.label}
            </p>
            <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginBottom: 14, fontFamily: 'monospace' }}>
              조치 ID: {success.id.slice(0, 8)}...  상태: {success.status}
            </div>
            <button type="button" onClick={onClose} style={primaryBtnStyle}>
              확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div style={{ borderBottom: '1px solid var(--ct-border)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ct-text)' }}>
              🛡️ 방역조치 발령
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--ct-text-muted)' }}>
              대상: <strong style={{ color: 'var(--ct-text)' }}>{farmName}</strong>
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={submitting}
            style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--ct-text-muted)', cursor: submitting ? 'not-allowed' : 'pointer' }}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '14px 18px', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* 조치 유형 선택 */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>① 조치 유형 (필수)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6 }}>
              {ACTION_TYPES.map((a) => {
                const selected = selectedType === a.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setSelectedType(a.key)}
                    disabled={submitting}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: selected ? `${SEVERITY_COLOR[a.severity]}20` : 'var(--ct-bg)',
                      border: `2px solid ${selected ? SEVERITY_COLOR[a.severity] : 'var(--ct-border)'}`,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 14 }}>{a.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ct-text)' }}>{a.label}</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', lineHeight: 1.4 }}>
                      {a.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 사유·내용 */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>② 발령 사유 / 세부 지시 (필수)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              placeholder="예: 24시간 내 발열 두수 8두 → 집단발생 의심. 농장 출입 차단, 차량 소독 강화."
              rows={3}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--ct-bg)',
                color: 'var(--ct-text)',
                border: '1px solid var(--ct-border)',
                borderRadius: 6,
                fontSize: 12,
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: 1.5,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 마감 기한 (선택) */}
          <div style={{ marginBottom: 6 }}>
            <label style={labelStyle}>③ 마감 기한 (선택)</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={submitting}
              style={{
                padding: '6px 10px',
                background: 'var(--ct-bg)',
                color: 'var(--ct-text)',
                border: '1px solid var(--ct-border)',
                borderRadius: 6,
                fontSize: 12,
              }}
            />
          </div>

          {/* 에러 */}
          {error && (
            <div style={{
              marginTop: 10,
              padding: '8px 10px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444',
              fontSize: 12,
              borderRadius: 6,
            }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div style={{ borderTop: '1px solid var(--ct-border)', padding: '10px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={submitting} style={secondaryBtnStyle}>
            취소
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting || !selectedType || !description.trim()}
            style={{
              ...primaryBtnStyle,
              opacity: (!selectedType || !description.trim() || submitting) ? 0.5 : 1,
              cursor: (!selectedType || !description.trim() || submitting) ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '발령 중...' : '🚨 발령'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 스타일 ──

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 12,
};

const cardStyle: React.CSSProperties = {
  background: 'var(--ct-card)',
  border: '1px solid var(--ct-border)',
  borderRadius: 12,
  width: '100%',
  maxWidth: 580,
  boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  display: 'flex',
  flexDirection: 'column',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--ct-text)',
  marginBottom: 6,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--ct-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'transparent',
  color: 'var(--ct-text-muted)',
  border: '1px solid var(--ct-border)',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
};
