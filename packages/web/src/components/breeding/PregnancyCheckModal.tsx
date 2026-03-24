// 임신감정 결과 기록 모달

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recordPregnancyCheck } from '@web/api/breeding.api';

interface Props {
  readonly animalId: string;
  readonly earTag: string;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

const METHOD_LABELS: Record<string, string> = {
  ultrasound: '초음파',
  manual: '직장검사',
  blood: '혈액검사',
};

export function PregnancyCheckModal({ animalId, earTag, onClose, onSuccess }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const [checkDate, setCheckDate] = useState(() => new Date().toISOString().split('T')[0]!);
  const [result, setResult] = useState<'pregnant' | 'open'>('pregnant');
  const [method, setMethod] = useState<'ultrasound' | 'manual' | 'blood'>('ultrasound');
  const [daysPost, setDaysPost] = useState<string>('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () => recordPregnancyCheck({
      animalId,
      checkDate,
      result,
      method,
      daysPostInsemination: daysPost ? Number(daysPost) : undefined,
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeding'] });
      onSuccess();
    },
  });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="임신감정 기록"
    >
      <div style={{
        background: 'var(--ct-card, #fff)',
        borderRadius: 16, padding: 24, width: '100%', maxWidth: 420,
        border: '1px solid var(--ct-border, #e5e7eb)',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: 'var(--ct-text)' }}>
          🔍 임신감정 기록 — #{earTag}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 검사일 */}
          <div>
            <label htmlFor="pc-date" style={{ fontSize: 12, color: 'var(--ct-text-secondary)', display: 'block', marginBottom: 4 }}>검사일</label>
            <input
              id="pc-date"
              type="date"
              value={checkDate}
              onChange={(e) => setCheckDate(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ct-border)', fontSize: 13, background: 'var(--ct-bg)', color: 'var(--ct-text)', boxSizing: 'border-box' }}
            />
          </div>

          {/* 결과 */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--ct-text-secondary)', display: 'block', marginBottom: 4 }}>결과</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setResult('pregnant')}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: result === 'pregnant' ? '#16a34a' : 'var(--ct-bg)',
                  color: result === 'pregnant' ? '#fff' : 'var(--ct-text)',
                  border: `1px solid ${result === 'pregnant' ? '#16a34a' : 'var(--ct-border)'}`,
                }}
              >
                ✅ 임신
              </button>
              <button
                type="button"
                onClick={() => setResult('open')}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: result === 'open' ? '#ef4444' : 'var(--ct-bg)',
                  color: result === 'open' ? '#fff' : 'var(--ct-text)',
                  border: `1px solid ${result === 'open' ? '#ef4444' : 'var(--ct-border)'}`,
                }}
              >
                ❌ 미임신
              </button>
            </div>
          </div>

          {/* 검사 방법 */}
          <div>
            <label htmlFor="pc-method" style={{ fontSize: 12, color: 'var(--ct-text-secondary)', display: 'block', marginBottom: 4 }}>검사 방법</label>
            <select
              id="pc-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as 'ultrasound' | 'manual' | 'blood')}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ct-border)', fontSize: 13, background: 'var(--ct-bg)', color: 'var(--ct-text)' }}
            >
              {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {/* 수정 후 일수 */}
          <div>
            <label htmlFor="pc-days" style={{ fontSize: 12, color: 'var(--ct-text-secondary)', display: 'block', marginBottom: 4 }}>수정 후 일수 (선택)</label>
            <input
              id="pc-days"
              type="number"
              min={0}
              max={300}
              value={daysPost}
              onChange={(e) => setDaysPost(e.target.value)}
              placeholder="예: 35"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ct-border)', fontSize: 13, background: 'var(--ct-bg)', color: 'var(--ct-text)', boxSizing: 'border-box' }}
            />
          </div>

          {/* 메모 */}
          <div>
            <label htmlFor="pc-notes" style={{ fontSize: 12, color: 'var(--ct-text-secondary)', display: 'block', marginBottom: 4 }}>메모 (선택)</label>
            <textarea
              id="pc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="특이사항 메모..."
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--ct-border)', fontSize: 13, background: 'var(--ct-bg)', color: 'var(--ct-text)', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {mutation.isError && (
          <p style={{ fontSize: 12, color: '#ef4444', marginTop: 8 }}>저장 실패. 다시 시도해 주세요.</p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            style={{
              flex: 1, padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 700,
              background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer',
              opacity: mutation.isPending ? 0.6 : 1,
            }}
          >
            {mutation.isPending ? '저장 중...' : '저장'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 20px', borderRadius: 10, fontSize: 14,
              background: 'var(--ct-bg)', color: 'var(--ct-text)',
              border: '1px solid var(--ct-border)', cursor: 'pointer',
            }}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
