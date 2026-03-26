// 농장 등록/수정 폼 패널

import React, { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFarm,
  updateFarm,
  getRegions,
  type FarmRecord,
  type FarmFormData,
} from '@web/api/farm-management.api';

interface Props {
  readonly editFarm: FarmRecord | null; // null = 생성 모드
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

interface FormErrors {
  readonly name?: string;
  readonly address?: string;
  readonly capacity?: string;
}

const INITIAL_FORM: FarmFormData = {
  name: '',
  address: '',
  capacity: 0,
  ownerName: '',
  phone: '',
  regionId: '',
  status: 'active',
};

function toFormData(farm: FarmRecord): FarmFormData {
  return {
    name: farm.name,
    address: farm.address ?? '',
    lat: farm.lat ? Number(farm.lat) : undefined,
    lng: farm.lng ? Number(farm.lng) : undefined,
    capacity: farm.capacity ?? 0,
    ownerName: farm.ownerName ?? '',
    phone: farm.phone ?? '',
    status: farm.status,
  };
}

function validateForm(form: FarmFormData): FormErrors {
  const errors: Record<string, string> = {};
  if (!form.name || form.name.trim().length < 2) errors.name = '목장명 2자 이상 입력';
  if (!form.address || form.address.trim().length < 1) errors.address = '주소를 입력해주세요';
  if (!form.capacity || form.capacity < 1) errors.capacity = '수용 두수 1 이상';
  return errors;
}

export function FarmFormPanel({ editFarm, onClose, onSaved }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const isEdit = editFarm !== null;

  const [form, setForm] = useState<FarmFormData>(
    editFarm ? toFormData(editFarm) : INITIAL_FORM,
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  // editFarm 변경 시 폼 리셋
  useEffect(() => {
    setForm(editFarm ? toFormData(editFarm) : INITIAL_FORM);
    setErrors({});
    setSubmitted(false);
  }, [editFarm]);

  const { data: regionsData } = useQuery({
    queryKey: ['farm-regions'],
    queryFn: getRegions,
    staleTime: 5 * 60 * 1000,
  });
  // apiGet이 data 배열을 직접 반환
  const regionsList = regionsData ?? [];

  const mutation = useMutation({
    mutationFn: async (data: FarmFormData) => {
      if (isEdit) {
        return updateFarm(editFarm.farmId, data);
      }
      return createFarm(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['farm-management'] });
      onSaved();
    },
  });

  const updateField = useCallback(<K extends keyof FarmFormData>(key: K, value: FarmFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    const validationErrors = validateForm(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) return;
    mutation.mutate(form);
  }, [form, mutation]);

  const fieldStyle = (hasError: boolean) => ({
    background: 'var(--ct-card)',
    borderColor: hasError ? '#ef4444' : 'var(--ct-border)',
    color: 'var(--ct-text)',
  });

  return (
    <div
      className="rounded-xl p-5 mb-4"
      style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold" style={{ color: 'var(--ct-text)' }}>
          {isEdit ? `${editFarm.name} 수정` : '새 목장 등록'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-sm px-3 py-1 rounded-lg hover:opacity-80"
          style={{ color: 'var(--ct-text-secondary)' }}
        >
          취소
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
        {/* 목장명 */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
            목장명 *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={fieldStyle(submitted && !!errors.name)}
            placeholder="예: 해돋이목장"
          />
          {submitted && errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>

        {/* 주소 */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
            주소 *
          </label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => updateField('address', e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={fieldStyle(submitted && !!errors.address)}
            placeholder="경기도 포천시..."
          />
          {submitted && errors.address && <p className="text-xs text-red-400 mt-1">{errors.address}</p>}
        </div>

        {/* 수용 두수 */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
            수용 두수 *
          </label>
          <input
            type="number"
            value={form.capacity || ''}
            onChange={(e) => updateField('capacity', Number(e.target.value))}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={fieldStyle(submitted && !!errors.capacity)}
            min={1}
            placeholder="100"
          />
          {submitted && errors.capacity && <p className="text-xs text-red-400 mt-1">{errors.capacity}</p>}
        </div>

        {/* 대표자 */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
            대표자
          </label>
          <input
            type="text"
            value={form.ownerName ?? ''}
            onChange={(e) => updateField('ownerName', e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={fieldStyle(false)}
            placeholder="홍길동"
          />
        </div>

        {/* 연락처 */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
            연락처
          </label>
          <input
            type="tel"
            value={form.phone ?? ''}
            onChange={(e) => updateField('phone', e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={fieldStyle(false)}
            placeholder="010-1234-5678"
          />
        </div>

        {/* 지역 */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
            지역
          </label>
          <select
            value={form.regionId ?? ''}
            onChange={(e) => updateField('regionId', e.target.value || undefined)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={fieldStyle(false)}
          >
            <option value="">지역 선택</option>
            {regionsList.map((r) => (
              <option key={r.regionId} value={r.regionId}>
                {r.province} {r.district}
              </option>
            ))}
          </select>
        </div>

        {/* 상태 */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
            상태
          </label>
          <select
            value={form.status ?? 'active'}
            onChange={(e) => updateField('status', e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={fieldStyle(false)}
          >
            <option value="active">활성</option>
            <option value="inactive">비활성</option>
            <option value="quarantine">격리</option>
            <option value="suspended">중단</option>
          </select>
        </div>

        {/* 제출 버튼 */}
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm"
            style={{ color: 'var(--ct-text-secondary)', border: '1px solid var(--ct-border)' }}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
          >
            {mutation.isPending ? '저장 중...' : isEdit ? '수정 저장' : '등록'}
          </button>
        </div>

        {mutation.isError && (
          <div className="sm:col-span-2">
            <p className="text-xs text-red-400">
              {mutation.error instanceof Error ? mutation.error.message : '저장에 실패했습니다'}
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
