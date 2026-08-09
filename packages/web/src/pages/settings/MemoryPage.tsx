// 팅커벨 기억 관리 — AI가 나에 대해 무엇을 기억하고 있는지 보고, 고치고, 지운다.
//
// 이 화면의 존재 이유: 기억은 답변에 조용히 영향을 준다. 잘못 기억한 사실이
// 블랙박스 안에 있으면 사용자는 왜 답이 이상한지 영원히 알 수 없다.
// 신뢰도·증거횟수·출처 원문을 모두 노출하는 것은 기능이 아니라 정직성의 문제다.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TinkerbellMemory, MemoryCategory } from '@cowtalk/shared';
import { MEMORY_CATEGORY_LABELS, MEMORY_SOURCE_LABELS } from '@cowtalk/shared';
import {
  fetchMemories,
  createMemory,
  updateMemory,
  deleteMemory,
} from '@web/api/memory.api';
import { useFarmStore } from '@web/stores/farm.store';
import { TitleAccentBar } from '@web/components/unified-dashboard/WidgetTitle';

const CATEGORY_ORDER: readonly MemoryCategory[] = [
  'farm_fact', 'equipment', 'protocol', 'constraint',
  'economics', 'person', 'goal', 'preference', 'animal_fact',
];

function confidenceLabel(confidence: number): { text: string; cls: string } {
  if (confidence >= 0.8) return { text: '확실', cls: 'bg-emerald-900/60 text-emerald-300' };
  if (confidence >= 0.5) return { text: '보통', cls: 'bg-sky-900/60 text-sky-300' };
  return { text: '불확실', cls: 'bg-amber-900/60 text-amber-300' };
}

export default function MemoryPage(): React.ReactElement {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const queryClient = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newMemory, setNewMemory] = useState<{
    category: MemoryCategory;
    subject: string;
    content: string;
    importance: number;
  }>({ category: 'farm_fact', subject: '', content: '', importance: 4 });

  const { data, isLoading } = useQuery({
    queryKey: ['tinkerbell-memories'],
    queryFn: () => fetchMemories('active'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tinkerbell-memories'] });

  const readError = (e: unknown): string =>
    (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '요청에 실패했습니다';

  const createMutation = useMutation({
    mutationFn: () =>
      createMemory({
        farmId: selectedFarmId ?? null,
        category: newMemory.category,
        subject: newMemory.subject,
        content: newMemory.content,
        importance: newMemory.importance,
      }),
    onSuccess: () => {
      setShowAdd(false);
      setNewMemory({ category: 'farm_fact', subject: '', content: '', importance: 4 });
      setError(null);
      void invalidate();
    },
    onError: (e: unknown) => setError(readError(e)),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { memoryId: string; content: string }) =>
      updateMemory(input.memoryId, { content: input.content }),
    onSuccess: () => {
      setEditingId(null);
      setError(null);
      void invalidate();
    },
    onError: (e: unknown) => setError(readError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (memoryId: string) => deleteMemory(memoryId),
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
    onError: (e: unknown) => setError(readError(e)),
  });

  const memories = data ?? [];
  const grouped = new Map<MemoryCategory, TinkerbellMemory[]>();
  for (const m of memories) {
    const list = grouped.get(m.category) ?? [];
    list.push(m);
    grouped.set(m.category, list);
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <TitleAccentBar />
        <h1 className="text-xl font-bold text-slate-100">팅커벨의 기억</h1>
        <p className="text-sm text-slate-400 mt-2">
          대화에서 팅커벨이 기억한 사실입니다. 답변에 반영되므로, 틀린 내용은 고치거나 지우세요.
          같은 이야기를 반복하면 신뢰도가 올라가고, 오래 언급되지 않으면 서서히 낮아집니다.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded bg-red-900/40 text-red-300 text-sm">{error}</div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-slate-400">
          {isLoading ? '불러오는 중…' : `기억 ${String(memories.length)}건`}
        </span>
        <button
          type="button"
          onClick={() => { setShowAdd((v) => !v); setError(null); }}
          className="px-3 py-1.5 rounded bg-sky-700 hover:bg-sky-600 text-sm text-white"
        >
          {showAdd ? '취소' : '기억 추가'}
        </button>
      </div>

      {showAdd && (
        <div className="mb-6 p-4 rounded-lg bg-slate-800/60 border border-slate-700 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-400">분류</span>
              <select
                value={newMemory.category}
                onChange={(e) => setNewMemory((p) => ({ ...p, category: e.target.value as MemoryCategory }))}
                className="mt-1 w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm"
              >
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>{MEMORY_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">주제 (예: 착유설비)</span>
              <input
                value={newMemory.subject}
                onChange={(e) => setNewMemory((p) => ({ ...p, subject: e.target.value }))}
                className="mt-1 w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm"
                placeholder="착유설비"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-slate-400">기억할 내용 (한 문장)</span>
            <textarea
              value={newMemory.content}
              onChange={(e) => setNewMemory((p) => ({ ...p, content: e.target.value }))}
              rows={2}
              className="mt-1 w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm"
              placeholder="착유는 Lely A3 로봇착유기 1대로 한다."
            />
          </label>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              중요도
              <input
                type="number"
                min={1}
                max={5}
                value={newMemory.importance}
                onChange={(e) => setNewMemory((p) => ({ ...p, importance: Number(e.target.value) }))}
                className="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-100"
              />
            </label>
            <button
              type="button"
              disabled={newMemory.subject.trim().length === 0 || newMemory.content.trim().length < 4 || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-sm text-white"
            >
              저장
            </button>
          </div>
        </div>
      )}

      {!isLoading && memories.length === 0 && (
        <div className="p-6 rounded-lg bg-slate-800/40 border border-slate-700 text-sm text-slate-400">
          아직 기억이 없습니다. 팅커벨과 대화하며 목장 이야기를 들려주면
          (&quot;우리는 로봇착유기 한 대로 착유해&quot;) 자동으로 기억합니다.
        </div>
      )}

      <div className="space-y-6">
        {CATEGORY_ORDER.filter((c) => grouped.has(c)).map((category) => (
          <section key={category}>
            <h2 className="text-sm font-semibold text-slate-300 mb-2">
              {MEMORY_CATEGORY_LABELS[category]}
            </h2>
            <ul className="space-y-2">
              {(grouped.get(category) ?? []).map((m) => {
                const conf = confidenceLabel(m.confidence);
                const isEditing = editingId === m.memoryId;
                return (
                  <li
                    key={m.memoryId}
                    className="p-3 rounded-lg bg-slate-800/60 border border-slate-700"
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={2}
                          className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm"
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            disabled={draft.trim().length < 4 || updateMutation.isPending}
                            onClick={() => updateMutation.mutate({ memoryId: m.memoryId, content: draft.trim() })}
                            className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-xs text-white"
                          >
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-slate-100">{m.content}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                          <span className={`px-1.5 py-0.5 rounded ${conf.cls}`}>{conf.text}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                            {MEMORY_SOURCE_LABELS[m.source]}
                          </span>
                          {m.evidenceCount > 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-300">
                              {m.evidenceCount}회 확인
                            </span>
                          )}
                          <span className="text-slate-500">주제: {m.subject}</span>
                          <span className="text-slate-500">중요도 {m.importance}</span>
                        </div>
                        {m.sourceQuote && m.source !== 'manual' && (
                          <p className="mt-2 text-[11px] text-slate-500 italic">
                            원문: &ldquo;{m.sourceQuote}&rdquo;
                          </p>
                        )}
                        <div className="mt-2 flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => { setEditingId(m.memoryId); setDraft(m.content); setError(null); }}
                            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(m.memoryId)}
                            className="px-2 py-1 rounded bg-red-900/70 hover:bg-red-800 disabled:opacity-40 text-xs text-red-200"
                          >
                            잊기
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
