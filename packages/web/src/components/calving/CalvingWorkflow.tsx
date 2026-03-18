// 분만 워크플로우 — 분만 임박 → 분만 기록 → 신생아 관리

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as calvingApi from '@web/api/calving.api';
import { Badge } from '@web/components/common/Badge';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { EmptyState } from '@web/components/common/EmptyState';

interface Props {
  readonly farmId: string;
}

export function CalvingWorkflow({ farmId }: Props): React.JSX.Element {
  const [showForm, setShowForm] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState<string | null>(null);

  const { data: upcoming, isLoading } = useQuery({
    queryKey: ['calving', 'upcoming', farmId],
    queryFn: () => calvingApi.getUpcomingCalvings(farmId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton lines={5} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">분만 관리</h3>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
        >
          분만 기록
        </button>
      </div>

      {showForm && selectedAnimal && (
        <CalvingRecordForm
          animalId={selectedAnimal}
          farmId={farmId}
          onClose={() => { setShowForm(false); setSelectedAnimal(null); }}
        />
      )}

      {(!upcoming || upcoming.length === 0) ? (
        <EmptyState message="분만 예정 개체가 없습니다." />
      ) : (
        <div className="space-y-2">
          {upcoming.map((c) => (
            <div key={c.animalId} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge
                    label={c.riskLevel === 'high' ? '위험' : c.riskLevel === 'medium' ? '주의' : '정상'}
                    variant={c.riskLevel === 'high' ? 'critical' : c.riskLevel === 'medium' ? 'medium' : 'success'}
                  />
                  <span className="text-sm font-medium text-gray-800">#{c.earTag}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-400">
                  {c.parity}산 · 예정: {c.expectedDate} (D-{c.daysUntil})
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedAnimal(c.animalId); setShowForm(true); }}
                className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200"
              >
                분만 기록
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalvingRecordForm({ animalId, farmId, onClose }: { animalId: string; farmId: string; onClose: () => void }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [calvingType, setCalvingType] = useState<'normal' | 'dystocia'>('normal');
  const [twinning, setTwinning] = useState(false);
  const [calfSex, setCalfSex] = useState<'male' | 'female'>('female');
  const [calfWeight, setCalfWeight] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () => calvingApi.recordCalving({
      animalId,
      farmId,
      calvingDate: new Date().toISOString(),
      calvingType,
      twinning,
      calves: [{ sex: calfSex, weight: calfWeight ? Number(calfWeight) : null, alive: true }],
      notes,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calving'] });
      onClose();
    },
  });

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <h4 className="text-sm font-semibold">분만 기록 — {animalId}</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">분만 유형</label>
          <select value={calvingType} onChange={(e) => setCalvingType(e.target.value as 'normal' | 'dystocia')} className="w-full rounded border px-2 py-1.5 text-sm">
            <option value="normal">정상 분만</option>
            <option value="dystocia">난산</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">쌍태</label>
          <select value={twinning ? 'yes' : 'no'} onChange={(e) => setTwinning(e.target.value === 'yes')} className="w-full rounded border px-2 py-1.5 text-sm">
            <option value="no">단태</option>
            <option value="yes">쌍태</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">송아지 성별</label>
          <select value={calfSex} onChange={(e) => setCalfSex(e.target.value as 'male' | 'female')} className="w-full rounded border px-2 py-1.5 text-sm">
            <option value="female">암</option>
            <option value="male">수</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">체중 (kg)</label>
          <input type="number" value={calfWeight} onChange={(e) => setCalfWeight(e.target.value)} placeholder="35" className="w-full rounded border px-2 py-1.5 text-sm" />
        </div>
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="메모..." rows={2} className="w-full rounded border px-2 py-1.5 text-sm" />
      <div className="flex gap-2">
        <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {mutation.isPending ? '저장 중...' : '저장'}
        </button>
        <button type="button" onClick={onClose} className="rounded bg-gray-100 px-4 py-1.5 text-sm text-gray-600">취소</button>
      </div>
    </div>
  );
}
