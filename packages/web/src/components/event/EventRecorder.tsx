// 농장 이벤트 기록 시스템 — 핵심 데이터 수집기

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@web/stores/auth.store';
import * as eventApi from '@web/api/event.api';
import type { EventType, EventCategory } from '@web/api/event.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import type { Role } from '@cowtalk/shared';

interface Props {
  readonly farmId: string;
  readonly animalId?: string;
  readonly initialCategory?: EventCategory;
  readonly onClose?: () => void;
}

const CATEGORY_LABELS: Record<EventCategory, string> = {
  breeding: '번식',
  health: '건강',
  management: '관리',
  movement: '이동',
  production_dairy: '생산(젖소)',
  production_beef: '생산(한우)',
  feed: '사료',
  other: '기타',
};

const CATEGORY_COLORS: Record<EventCategory, string> = {
  breeding: 'bg-pink-100 text-pink-700',
  health: 'bg-red-100 text-red-700',
  management: 'bg-blue-100 text-blue-700',
  movement: 'bg-purple-100 text-purple-700',
  production_dairy: 'bg-green-100 text-green-700',
  production_beef: 'bg-amber-100 text-amber-700',
  feed: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-100 text-gray-700',
};

// 역할별 자주 쓰는 카테고리 순서
const CATEGORY_ORDER_BY_ROLE: Record<Role, readonly EventCategory[]> = {
  farmer: ['breeding', 'movement', 'management', 'health', 'production_dairy', 'production_beef', 'feed', 'other'],
  veterinarian: ['health', 'management', 'breeding', 'other'],
  government_admin: ['management', 'movement', 'other'],
  quarantine_officer: ['management', 'health', 'movement', 'other'],
};

export function EventRecorder({ farmId, animalId, initialCategory, onClose }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role) ?? 'farmer';
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(initialCategory ?? null);
  const [selectedType, setSelectedType] = useState<EventType | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [targetAnimalId, setTargetAnimalId] = useState(animalId ?? '');

  const { data: eventTypes, isLoading } = useQuery({
    queryKey: ['event-types'],
    queryFn: eventApi.getEventTypes,
    staleTime: 30 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: () => eventApi.recordEvent({
      animalId: targetAnimalId || null,
      farmId,
      eventTypeId: selectedType!.eventTypeId,
      data: formData,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setSelectedType(null);
      setSelectedCategory(null);
      setFormData({});
      onClose?.();
    },
  });

  if (isLoading) return <LoadingSkeleton lines={5} />;

  const categories = CATEGORY_ORDER_BY_ROLE[role] ?? Object.keys(CATEGORY_LABELS) as EventCategory[];
  const filteredTypes = eventTypes?.filter((t) =>
    t.category === selectedCategory && t.roleRelevance.includes(role),
  ) ?? [];

  // Step 1: 카테고리 선택
  if (!selectedCategory) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">이벤트 기록</h3>
          {onClose && <button type="button" onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">닫기</button>}
        </div>
        {!animalId && (
          <input
            type="text"
            value={targetAnimalId}
            onChange={(e) => setTargetAnimalId(e.target.value)}
            placeholder="동물 ID (선택사항)..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg p-3 text-center text-sm font-medium transition-colors hover:opacity-80 ${CATEGORY_COLORS[cat]}`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: 이벤트 유형 선택
  if (!selectedType) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setSelectedCategory(null)} className="text-xs text-blue-500 hover:text-blue-700">← 뒤로</button>
          <h3 className="text-sm font-bold text-gray-900">{CATEGORY_LABELS[selectedCategory]}</h3>
        </div>
        <div className="space-y-1">
          {filteredTypes.map((t) => (
            <button
              key={t.eventTypeId}
              type="button"
              onClick={() => setSelectedType(t)}
              className="w-full rounded-md border border-gray-200 bg-white px-4 py-2 text-left text-sm text-gray-800 hover:bg-blue-50"
            >
              {t.nameKo}
            </button>
          ))}
          {filteredTypes.length === 0 && (
            <p className="text-xs text-gray-400">이 카테고리에 해당하는 이벤트가 없습니다.</p>
          )}
        </div>
      </div>
    );
  }

  // Step 3: 상세 입력
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setSelectedType(null)} className="text-xs text-blue-500 hover:text-blue-700">← 뒤로</button>
        <h3 className="text-sm font-bold text-gray-900">{selectedType.nameKo}</h3>
      </div>

      {targetAnimalId && (
        <p className="text-xs text-gray-400">대상: {targetAnimalId}</p>
      )}

      <div className="space-y-2">
        {selectedType.fields.map((field) => (
          <div key={field.key}>
            <label className="text-xs font-medium text-gray-600">
              {field.label}{field.required && <span className="text-red-500"> *</span>}
            </label>
            {field.type === 'select' && field.options ? (
              <select
                value={String(formData[field.key] ?? '')}
                onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                className="mt-0.5 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              >
                <option value="">선택...</option>
                {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : field.type === 'boolean' ? (
              <select
                value={String(formData[field.key] ?? '')}
                onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value === 'true' })}
                className="mt-0.5 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              >
                <option value="">선택...</option>
                <option value="true">예</option>
                <option value="false">아니오</option>
              </select>
            ) : field.type === 'number' ? (
              <input
                type="number"
                value={String(formData[field.key] ?? '')}
                onChange={(e) => setFormData({ ...formData, [field.key]: Number(e.target.value) })}
                className="mt-0.5 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              />
            ) : field.type === 'date' ? (
              <input
                type="date"
                value={String(formData[field.key] ?? '')}
                onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                className="mt-0.5 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              />
            ) : (
              <input
                type="text"
                value={String(formData[field.key] ?? '')}
                onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                className="mt-0.5 w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? '저장 중...' : '기록 저장'}
        </button>
        <button type="button" onClick={() => { setSelectedType(null); setFormData({}); }} className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-600">취소</button>
      </div>

      {mutation.isError && <p className="text-xs text-red-500">기록 저장에 실패했습니다.</p>}
    </div>
  );
}
