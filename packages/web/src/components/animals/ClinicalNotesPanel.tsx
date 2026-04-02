// 임상 기록 패널 — 개체별 관찰 노트 조회 + 작성
// GET  /label-chat/observations/:animalId
// POST /label-chat/observation

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@web/api/client';

interface ClinicalObservation {
  readonly observationId: string;
  readonly observationType: string;
  readonly description: string;
  readonly temperature: number | null;
  readonly bodyConditionScore: number | null;
  readonly weight: number | null;
  readonly medication: string | null;
  readonly observedAt: string;
  readonly breedingInfo: string | null;
  readonly calvingInfo: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  general:    '📝 일반',
  treatment:  '💊 치료',
  breeding:   '🔴 번식',
  calving:    '🍼 분만',
  disease:    '🏥 질병',
  inspection: '🔍 검사',
};

interface Props {
  readonly animalId: string;
  readonly farmId: string;
}

export function ClinicalNotesPanel({ animalId, farmId }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [obsType, setObsType] = useState('general');
  const [description, setDescription] = useState('');
  const [tempInput, setTempInput] = useState('');

  const { data: observations = [], isLoading } = useQuery<readonly ClinicalObservation[]>({
    queryKey: ['clinical-observations', animalId],
    queryFn: () => apiGet<readonly ClinicalObservation[]>(`/label-chat/observations/${animalId}`),
    staleTime: 60_000,
  });

  const { mutate: submitNote, isPending } = useMutation({
    mutationFn: () => apiPost('/label-chat/observation', {
      animalId,
      farmId,
      observationType: obsType,
      description: description.trim(),
      temperature: tempInput ? Number(tempInput) : undefined,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clinical-observations', animalId] });
      setShowForm(false);
      setDescription('');
      setTempInput('');
      setObsType('general');
    },
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!description.trim()) return;
    submitNote();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* 노트 작성 버튼 */}
      <button
        type="button"
        onClick={() => setShowForm((v) => !v)}
        style={{
          background: showForm ? 'var(--ct-card)' : '#4A90D918',
          border: '1px solid #4A90D940',
          borderRadius: 8,
          padding: '6px 12px',
          color: '#4A90D9',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'left',
        }}
      >
        {showForm ? '✕ 취소' : '+ 임상 기록 추가'}
      </button>

      {/* 기록 작성 폼 */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={obsType}
              onChange={(e) => setObsType(e.target.value)}
              style={{ flex: 1, background: 'var(--ct-bg)', border: '1px solid var(--ct-border)', borderRadius: 6, padding: '4px 8px', color: 'var(--ct-text)', fontSize: 12 }}
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.1"
              min="36"
              max="42"
              placeholder="체온(°C)"
              value={tempInput}
              onChange={(e) => setTempInput(e.target.value)}
              style={{ width: 80, background: 'var(--ct-bg)', border: '1px solid var(--ct-border)', borderRadius: 6, padding: '4px 8px', color: 'var(--ct-text)', fontSize: 12 }}
            />
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="관찰 내용을 입력하세요..."
            rows={3}
            required
            style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)', borderRadius: 6, padding: '6px 8px', color: 'var(--ct-text)', fontSize: 12, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <button
            type="submit"
            disabled={isPending || !description.trim()}
            style={{ background: '#4A90D9', border: 'none', borderRadius: 6, padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: isPending ? 0.6 : 1 }}
          >
            {isPending ? '저장 중...' : '저장'}
          </button>
        </form>
      )}

      {/* 기록 목록 */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 12, color: 'var(--ct-text-muted)', fontSize: 12 }}>로딩 중...</div>
      ) : observations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 12, color: 'var(--ct-text-muted)', fontSize: 12 }}>임상 기록 없음</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
          {observations.map((obs) => (
            <div
              key={obs.observationId}
              style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--ct-bg)', border: '1px solid var(--ct-border)', fontSize: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: '#4A90D9' }}>{TYPE_LABELS[obs.observationType] ?? obs.observationType}</span>
                <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
                  {new Date(obs.observedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ color: 'var(--ct-text)', lineHeight: 1.4 }}>{obs.description}</div>
              {(obs.temperature ?? obs.weight ?? obs.medication) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  {obs.temperature && <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>체온 {obs.temperature}°C</span>}
                  {obs.weight && <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>체중 {obs.weight}kg</span>}
                  {obs.medication && <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>💊 {obs.medication}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
