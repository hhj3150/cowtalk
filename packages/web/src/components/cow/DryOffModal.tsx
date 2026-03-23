// 건유 전환 모달 — 건유일 설정, 분만 예정일 자동 계산, 약제 기록

import React, { useState } from 'react';
import { apiPost } from '@web/api/client';

interface Props {
  readonly animalId: string;
  readonly earTag: string;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

export function DryOffModal({ animalId, earTag, onClose, onSuccess }: Props): React.JSX.Element {
  const today = new Date().toISOString().slice(0, 10);
  const [dryOffDate, setDryOffDate] = useState(today);
  const [lastMilkingDate, setLastMilkingDate] = useState(today);
  const [medication, setMedication] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 분만 예정일 자동 계산
  const expectedCalving = dryOffDate
    ? new Date(new Date(dryOffDate).getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : '';

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await apiPost(`/dry-off/${animalId}`, {
        dryOffDate,
        lastMilkingDate,
        medication: medication || undefined,
        notes: notes || undefined,
      });
      onSuccess();
      onClose();
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div style={{ background: 'var(--ct-card)', borderRadius: 16, padding: 24, width: 400, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>🏖️ 건유 전환</h3>
        <p style={{ fontSize: 12, color: 'var(--ct-text-muted)', margin: '0 0 16px' }}>{earTag}번 개체를 건유군으로 전환합니다</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="건유 시작일" value={dryOffDate} onChange={setDryOffDate} type="date" />
          <Field label="마지막 착유일" value={lastMilkingDate} onChange={setLastMilkingDate} type="date" />

          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginBottom: 2 }}>분만 예정일 (자동 계산: 건유일 + 60일)</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ct-primary)' }}>{expectedCalving}</div>
          </div>

          <Field label="건유 처리 약제 (선택)" value={medication} onChange={setMedication} placeholder="예: 오비신, 세프가드" />
          <Field label="메모 (선택)" value={notes} onChange={setNotes} placeholder="특이사항 기록" />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--ct-bg)', border: '1px solid var(--ct-border)', color: 'var(--ct-text)', cursor: 'pointer', fontSize: 12 }}>취소</button>
          <button type="button" onClick={handleSubmit} disabled={submitting || !dryOffDate} style={{ padding: '8px 16px', borderRadius: 8, background: '#eab308', color: '#000', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, opacity: submitting ? 0.5 : 1 }}>
            {submitting ? '처리 중...' : '건유 전환 실행'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type, placeholder }: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly type?: string;
  readonly placeholder?: string;
}): React.JSX.Element {
  return (
    <div>
      <label style={{ fontSize: 12, color: 'var(--ct-text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        type={type ?? 'text'} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)', fontSize: 13 }}
      />
    </div>
  );
}
