// 동물 상태 변경 모달 — active → sold/dead/culled/transferred
// 농장주가 실제로 가장 자주 쓰는 워크플로우 (퇴사 처리)

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  changeAnimalStatus,
  STATUS_LABELS,
  type AnimalRecord,
  type AnimalStatus,
  type ChangeStatusInput,
} from '@web/api/animal-management.api';

interface Props {
  readonly animal: AnimalRecord;
  readonly onClose: () => void;
  readonly onChanged: (updated: AnimalRecord) => void;
  // 이동 시 목적지 선택을 위한 농장 목록 (선택)
  readonly availableFarms?: ReadonlyArray<{ farmId: string; name: string }>;
}

// active에서 전환 가능한 상태들
const TARGET_STATUSES: ReadonlyArray<{ code: AnimalStatus; label: string; icon: string; reasonRequired: boolean }> = [
  { code: 'sold', label: '판매 (매매)', icon: '💰', reasonRequired: false },
  { code: 'dead', label: '폐사 (자연사/질병)', icon: '☠️', reasonRequired: true },
  { code: 'culled', label: '도태 (강제 처분)', icon: '🚫', reasonRequired: true },
  { code: 'transferred', label: '이동 (다른 농장)', icon: '🔄', reasonRequired: false },
];

export function AnimalStatusChangeModal({ animal, onClose, onChanged, availableFarms }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<AnimalStatus | null>(null);
  const [reason, setReason] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [destinationFarmId, setDestinationFarmId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: ChangeStatusInput) => changeAnimalStatus(animal.animalId, input),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['animals'] });
      void queryClient.invalidateQueries({ queryKey: ['animal', updated.animalId] });
      void queryClient.invalidateQueries({ queryKey: ['farm', animal.farmId] });
      onChanged(updated);
    },
    onError: (err: Error) => {
      setError(err.message || '상태 변경 실패');
    },
  });

  const selectedOption = TARGET_STATUSES.find((s) => s.code === selectedStatus);

  const handleSubmit = (): void => {
    if (!selectedStatus) {
      setError('상태를 선택하세요');
      return;
    }
    if (selectedOption?.reasonRequired && !reason.trim()) {
      setError(`${selectedOption.label} 사유를 입력해주세요`);
      return;
    }
    if (selectedStatus === 'transferred' && !destinationFarmId) {
      setError('이동할 목적지 농장을 선택하세요');
      return;
    }

    const input: ChangeStatusInput = {
      status: selectedStatus,
      reason: reason.trim() || undefined,
      occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      destinationFarmId: selectedStatus === 'transferred' ? destinationFarmId : undefined,
    };
    mutation.mutate(input);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.6)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-change-title"
    >
      <div
        className="w-full max-w-md mx-4 rounded-xl p-5"
        style={{ background: 'var(--ct-card)', color: 'var(--ct-text)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="status-change-title" className="text-lg font-semibold">
            #{animal.earTag} 상태 변경
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ color: 'var(--ct-text-secondary)' }}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <p className="text-sm mb-3" style={{ color: 'var(--ct-text-secondary)' }}>
          현재 상태: <span className="font-medium" style={{ color: 'var(--ct-text)' }}>
            {STATUS_LABELS[animal.status]}
          </span>
        </p>

        {/* 상태 선택 (카드형) */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {TARGET_STATUSES.map((opt) => {
            const isSelected = selectedStatus === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => { setSelectedStatus(opt.code); setError(null); }}
                className="rounded-lg border px-3 py-3 text-left transition-all"
                style={{
                  borderColor: isSelected ? 'var(--ct-primary)' : 'var(--ct-border)',
                  background: isSelected ? 'var(--ct-primary)20' : 'var(--ct-bg)',
                  cursor: 'pointer',
                }}
                aria-pressed={isSelected}
              >
                <div className="text-xl mb-1">{opt.icon}</div>
                <div className="text-xs font-medium">{opt.label}</div>
              </button>
            );
          })}
        </div>

        {/* 이동 시 — 목적지 농장 */}
        {selectedStatus === 'transferred' && (
          <div className="mb-3">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
              목적지 농장 *
            </label>
            {availableFarms && availableFarms.length > 0 ? (
              <select
                value={destinationFarmId}
                onChange={(e) => setDestinationFarmId(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
              >
                <option value="">-- 농장 선택 --</option>
                {availableFarms.filter((f) => f.farmId !== animal.farmId).map((f) => (
                  <option key={f.farmId} value={f.farmId}>{f.name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={destinationFarmId}
                onChange={(e) => setDestinationFarmId(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
                placeholder="농장 ID (UUID)"
              />
            )}
          </div>
        )}

        {/* 발생일 */}
        {selectedStatus && (
          <div className="mb-3">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
              발생일
            </label>
            <input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
        )}

        {/* 사유 */}
        {selectedStatus && (
          <div className="mb-3">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
              사유 {selectedOption?.reasonRequired ? '*' : '(선택)'}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{
                background: 'var(--ct-bg)',
                borderColor: 'var(--ct-border)',
                color: 'var(--ct-text)',
                minHeight: 60,
                resize: 'vertical',
              }}
              placeholder={
                selectedStatus === 'dead' ? '예: 유방염 급성, 치료 반응 없음'
                : selectedStatus === 'culled' ? '예: 생산성 저하, 만성 질환'
                : selectedStatus === 'sold' ? '예: 매매 상대 / 가격'
                : '예: 계약 이전 / 분양'
              }
              maxLength={500}
            />
          </div>
        )}

        {/* 주의 메시지 */}
        {(selectedStatus === 'dead' || selectedStatus === 'culled' || selectedStatus === 'sold') && (
          <div
            className="rounded-lg px-3 py-2 text-xs mb-3"
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              color: 'var(--ct-warning, #f59e0b)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            ⚠️ 이 상태로 변경하면 센서 매핑이 자동 해제되고, 더 이상 일일 알람에 포함되지 않습니다.
          </div>
        )}

        {error && (
          <div
            className="rounded-lg px-3 py-2 text-sm mb-3"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--ct-danger, #ef4444)',
            }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-bg)', color: 'var(--ct-text)' }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedStatus || mutation.isPending}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-medium"
            style={{
              background: 'var(--ct-primary)',
              color: '#ffffff',
              opacity: !selectedStatus || mutation.isPending ? 0.6 : 1,
              cursor: !selectedStatus || mutation.isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {mutation.isPending ? '처리 중...' : '확정'}
          </button>
        </div>
      </div>
    </div>
  );
}
