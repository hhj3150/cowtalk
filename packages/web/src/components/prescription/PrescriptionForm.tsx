// 처방전 작성 폼 — vet 전용

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as prescriptionApi from '@web/api/prescription.api';
import type { Drug } from '@web/api/prescription.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';

interface Props {
  readonly animalId: string;
  readonly farmId: string;
  readonly onClose: () => void;
}

interface DrugEntry {
  readonly drugId: string;
  readonly dosage: number;
  readonly unit: string;
  readonly route: string;
  readonly durationDays: number;
}

export function PrescriptionForm({ animalId, farmId, onClose }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [drugs, setDrugs] = useState<readonly DrugEntry[]>([]);
  const [selectedDrugId, setSelectedDrugId] = useState('');

  const { data: drugList, isLoading } = useQuery({
    queryKey: ['drugs'],
    queryFn: prescriptionApi.getDrugList,
    staleTime: 30 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: () => prescriptionApi.createPrescription({ animalId, farmId, diagnosis, drugs, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions', animalId] });
      onClose();
    },
  });

  function addDrug(): void {
    if (!selectedDrugId) return;
    const drug = drugList?.find((d) => d.drugId === selectedDrugId);
    if (!drug || drugs.some((d) => d.drugId === selectedDrugId)) return;
    setDrugs([...drugs, {
      drugId: drug.drugId,
      dosage: 0,
      unit: drug.unit,
      route: drug.route,
      durationDays: 1,
    }]);
    setSelectedDrugId('');
  }

  function updateDrug(index: number, field: keyof DrugEntry, value: number | string): void {
    setDrugs(drugs.map((d, i) => i === index ? { ...d, [field]: value } : d));
  }

  function removeDrug(index: number): void {
    setDrugs(drugs.filter((_, i) => i !== index));
  }

  function getWithdrawalInfo(drugId: string): Drug | undefined {
    return drugList?.find((d) => d.drugId === drugId);
  }

  if (isLoading) return <LoadingSkeleton lines={5} />;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-900">처방전 작성</h3>

      {/* 진단명 */}
      <div>
        <label className="text-xs font-medium text-gray-600">진단명</label>
        <input
          type="text"
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          placeholder="유방염, 케토시스, 자궁내막염..."
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {/* 약품 추가 */}
      <div>
        <label className="text-xs font-medium text-gray-600">약품 선택</label>
        <div className="mt-1 flex gap-2">
          <select
            value={selectedDrugId}
            onChange={(e) => setSelectedDrugId(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">약품을 선택하세요</option>
            {drugList?.map((drug) => (
              <option key={drug.drugId} value={drug.drugId}>
                {drug.name} ({drug.category}) — 휴약: 우유 {drug.withdrawalMilkHours}h / 고기 {drug.withdrawalMeatDays}d
              </option>
            ))}
          </select>
          <button type="button" onClick={addDrug} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">추가</button>
        </div>
      </div>

      {/* 선택된 약품 목록 */}
      {drugs.length > 0 && (
        <div className="space-y-2">
          {drugs.map((entry, i) => {
            const drug = getWithdrawalInfo(entry.drugId);
            return (
              <div key={entry.drugId} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{drug?.name ?? entry.drugId}</span>
                  <button type="button" onClick={() => removeDrug(i)} className="text-xs text-red-500 hover:text-red-700">삭제</button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-500">용량</label>
                    <input type="number" value={entry.dosage || ''} onChange={(e) => updateDrug(i, 'dosage', Number(e.target.value))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">투약경로</label>
                    <select value={entry.route} onChange={(e) => updateDrug(i, 'route', e.target.value)} className="w-full rounded border px-2 py-1 text-sm">
                      <option value="IM">근주 (IM)</option>
                      <option value="IV">정주 (IV)</option>
                      <option value="SC">피하 (SC)</option>
                      <option value="PO">경구 (PO)</option>
                      <option value="topical">국소</option>
                      <option value="intramammary">유방내</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500">투약기간 (일)</label>
                    <input type="number" value={entry.durationDays || ''} onChange={(e) => updateDrug(i, 'durationDays', Number(e.target.value))} className="w-full rounded border px-2 py-1 text-sm" />
                  </div>
                </div>
                {drug && (
                  <div className="mt-2 rounded bg-yellow-50 p-2 text-xs text-yellow-700">
                    휴약: 우유 {drug.withdrawalMilkHours}시간 / 고기 {drug.withdrawalMeatDays}일
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 메모 */}
      <div>
        <label className="text-xs font-medium text-gray-600">소견/메모</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
      </div>

      {/* 버튼 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={!diagnosis || drugs.length === 0 || mutation.isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? '저장 중...' : '처방전 저장'}
        </button>
        <button type="button" onClick={onClose} className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-600">취소</button>
      </div>

      {mutation.isError && <p className="text-xs text-red-500">처방전 저장에 실패했습니다.</p>}
    </div>
  );
}
