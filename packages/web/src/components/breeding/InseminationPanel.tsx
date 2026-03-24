// 수정 추천 + 기록 패널
// 발정 감지된 개체에 대해 수정 적기·추천 정액·경고를 표시하고
// "수정 완료" 버튼을 누르면 정액 선택 → DB 기록

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBreedingAdvice, recordInsemination } from '@web/api/breeding.api';
import type { BreedingAdvice, SemenRecommendationItem } from '@web/api/breeding.api';

interface Props {
  readonly animalId: string;
  readonly onClose?: () => void;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

const RISK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: 'rgba(34,197,94,0.1)', text: '#16a34a', label: '안전' },
  medium: { bg: 'rgba(234,179,8,0.1)', text: '#ca8a04', label: '주의' },
  high: { bg: 'rgba(239,68,68,0.1)', text: '#dc2626', label: '위험' },
};

export function InseminationPanel({ animalId, onClose }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const [selectedSemen, setSelectedSemen] = useState<SemenRecommendationItem | null>(null);
  const [technicianName, setTechnicianName] = useState('');
  const [notes, setNotes] = useState('');
  const [showRecord, setShowRecord] = useState(false);

  const { data: advice, isLoading, isError } = useQuery<BreedingAdvice>({
    queryKey: ['breeding-advice', animalId],
    queryFn: () => getBreedingAdvice(animalId),
    staleTime: 60_000,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: () => recordInsemination({
      animalId,
      farmId: advice?.farmId ?? '',
      semenId: selectedSemen?.semenId,
      semenInfo: selectedSemen ? `${selectedSemen.bullName} (${selectedSemen.bullRegistration ?? ''})` : undefined,
      technicianName: technicianName || undefined,
      notes: notes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breeding-advice', animalId] });
      setShowRecord(false);
      setSelectedSemen(null);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: 'var(--ct-border)' }} />
        ))}
      </div>
    );
  }

  if (isError || !advice) {
    return (
      <p className="text-xs py-4 text-center" style={{ color: 'var(--ct-text-secondary)' }}>
        수정 추천 데이터를 불러올 수 없습니다
      </p>
    );
  }

  // 수정 기록 폼
  if (showRecord) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>
            💉 수정 기록 — #{advice.earTag}
          </p>
          <button
            type="button"
            onClick={() => setShowRecord(false)}
            className="text-xs px-2 py-1 rounded"
            style={{ color: 'var(--ct-text-secondary)' }}
          >
            ← 돌아가기
          </button>
        </div>

        {/* 정액 선택 */}
        <div>
          <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--ct-text)' }}>사용 정액 선택</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {advice.recommendations.map((rec) => (
              <button
                key={rec.semenId}
                type="button"
                onClick={() => setSelectedSemen(rec)}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors"
                style={{
                  background: selectedSemen?.semenId === rec.semenId ? 'rgba(59,130,246,0.1)' : 'var(--ct-bg)',
                  border: selectedSemen?.semenId === rec.semenId ? '2px solid #3b82f6' : '1px solid var(--ct-border)',
                }}
              >
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>
                    #{rec.rank} {rec.bullName}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                    {rec.bullRegistration ?? ''} · {rec.availableStraws}스트로
                  </p>
                </div>
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: RISK_COLORS[rec.inbreedingRisk]?.bg, color: RISK_COLORS[rec.inbreedingRisk]?.text }}
                >
                  근교 {RISK_COLORS[rec.inbreedingRisk]?.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 수정사 + 메모 */}
        <input
          type="text"
          placeholder="수정사 이름 (선택)"
          value={technicianName}
          onChange={(e) => setTechnicianName(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
        />
        <input
          type="text"
          placeholder="메모 (선택)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
        />

        {/* 수정 완료 버튼 */}
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!selectedSemen || mutation.isPending}
          className="w-full rounded-lg py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ background: selectedSemen ? '#3b82f6' : '#9ca3af' }}
        >
          {mutation.isPending ? '기록 중...' : mutation.isSuccess ? '✅ 기록 완료' : '💉 수정 완료 기록'}
        </button>

        {mutation.isError && (
          <p className="text-xs text-center text-red-500">기록 실패 — 다시 시도해주세요</p>
        )}
      </div>
    );
  }

  // 수정 추천 화면
  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>
          🔴 발정 감지 — #{advice.earTag}
        </p>
        {onClose && (
          <button type="button" onClick={onClose} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--ct-text-secondary)' }}>✕</button>
        )}
      </div>

      {/* 수정 적기 */}
      <div
        className="rounded-lg p-3"
        style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}
      >
        <p className="text-xs font-semibold" style={{ color: '#3b82f6' }}>⏰ 수정 적기</p>
        <p className="text-lg font-bold mt-0.5" style={{ color: '#1d4ed8' }}>
          {formatTime(advice.optimalInseminationTime)}
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#3b82f6' }}>
          {advice.optimalTimeLabel}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--ct-text-secondary)' }}>
          발정 감지: {formatTime(advice.heatDetectedAt)}
        </p>
      </div>

      {/* 경고 */}
      {advice.warnings.length > 0 && (
        <div className="space-y-1">
          {advice.warnings.map((w, i) => (
            <div key={i} className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(234,179,8,0.08)', color: '#b45309' }}>
              {w}
            </div>
          ))}
        </div>
      )}

      {/* 추천 정액 */}
      <div>
        <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--ct-text)' }}>🧬 추천 정액 (보유 재고 기준)</p>
        {advice.recommendations.length === 0 ? (
          <p className="text-xs py-3 text-center" style={{ color: 'var(--ct-text-secondary)' }}>
            보유 정액이 없습니다. 정액 재고를 등록해주세요.
          </p>
        ) : (
          <div className="space-y-1.5">
            {advice.recommendations.map((rec) => {
              const risk = RISK_COLORS[rec.inbreedingRisk] ?? RISK_COLORS.low;
              return (
                <div
                  key={rec.semenId}
                  className="rounded-lg px-3 py-2.5"
                  style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: '#3b82f6' }}>#{rec.rank}</span>
                      <span className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>{rec.bullName}</span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: risk?.bg ?? '#f0f0f0', color: risk?.text ?? '#666' }}
                      >
                        근교 {(rec.estimatedInbreeding * 100).toFixed(1)}%
                      </span>
                    </div>
                    <span className="text-xs font-bold" style={{ color: 'var(--ct-primary)' }}>{rec.score}점</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
                    {rec.reasoning}
                    {rec.milkYieldGain != null && rec.milkYieldGain > 0 ? ` · 유량 +${rec.milkYieldGain}kg` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 수정 완료 기록 버튼 */}
      <button
        type="button"
        onClick={() => setShowRecord(true)}
        className="w-full rounded-lg py-3 text-sm font-semibold text-white flex items-center justify-center gap-2"
        style={{ background: '#3b82f6' }}
      >
        <span>💉</span>
        <span>수정 완료 기록하기</span>
      </button>
    </div>
  );
}
