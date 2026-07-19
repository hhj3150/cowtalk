// TMR 배합비 관리 — 원료 단가·급여량 → 두당 일 사료비
//
// 경제성 분석의 비용 축. 원료별 급여량(kg/일/두)과 단가(원/kg)를 넣으면
// 두당 일 사료비가 자동 계산되고, 손익 분석(유대 - 사료비)의 원료가 된다.

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '@web/api/client';
import { useFarmStore } from '@web/stores/farm.store';
import { TitleAccentBar } from '@web/components/unified-dashboard/WidgetTitle';
import { computeDailyFeedCost } from '@cowtalk/shared';

interface IngredientDraft {
  name: string;
  amountKgPerDay: string;
  costPerKg: string;
}

interface FeedProgram {
  readonly programId: string;
  readonly farmId: string;
  readonly name: string;
  readonly targetGroup: string;
  readonly ingredients: readonly { name: string; amountKgPerDay?: number; ratio?: number; costPerKg: number }[];
  readonly dailyCostPerHead: number | null;
}

const GROUP_LABELS: Record<string, string> = {
  lactating: '착유우',
  dry: '건유우',
  heifer: '육성우',
  calf: '송아지',
};

const EMPTY_ROW: IngredientDraft = { name: '', amountKgPerDay: '', costPerKg: '' };

function draftsToIngredients(drafts: readonly IngredientDraft[]) {
  return drafts
    .filter((d) => d.name.trim() && Number(d.amountKgPerDay) > 0 && Number(d.costPerKg) >= 0)
    .map((d) => ({
      name: d.name.trim(),
      amountKgPerDay: Number(d.amountKgPerDay),
      costPerKg: Number(d.costPerKg),
    }));
}

export default function FeedRationPage(): React.JSX.Element {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<{
    programId?: string;
    name: string;
    targetGroup: string;
    rows: IngredientDraft[];
  } | null>(null);

  const { data: programs, isLoading } = useQuery({
    queryKey: ['feed-programs', selectedFarmId],
    queryFn: () => apiGet<readonly FeedProgram[]>('/feed/programs', { farmId: selectedFarmId! }),
    enabled: !!selectedFarmId,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPost('/feed/programs', {
        programId: editing?.programId,
        farmId: selectedFarmId,
        name: editing?.name,
        targetGroup: editing?.targetGroup,
        ingredients: draftsToIngredients(editing?.rows ?? []),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed-programs', selectedFarmId] });
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (programId: string) => apiDelete(`/feed/programs/${programId}?farmId=${selectedFarmId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['feed-programs', selectedFarmId] }),
  });

  const liveCost = useMemo(
    () => (editing ? computeDailyFeedCost(draftsToIngredients(editing.rows)) : 0),
    [editing],
  );

  if (!selectedFarmId) {
    return <div className="p-6 text-center text-sm" style={{ color: 'var(--ct-text-muted)' }}>상단에서 농장을 먼저 선택해주세요.</div>;
  }

  const startNew = (): void =>
    setEditing({ name: 'TMR 배합', targetGroup: 'lactating', rows: [{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }] });

  const startEdit = (p: FeedProgram): void =>
    setEditing({
      programId: p.programId,
      name: p.name,
      targetGroup: p.targetGroup,
      rows: p.ingredients.map((i) => ({
        name: i.name,
        amountKgPerDay: i.amountKgPerDay != null ? String(i.amountKgPerDay) : '',
        costPerKg: String(i.costPerKg),
      })),
    });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold" style={{ color: 'var(--ct-text)' }}>
          <TitleAccentBar />
          🌾 TMR 배합비
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
          원료별 급여량과 단가를 넣으면 두당 일 사료비가 계산됩니다. 사료비는 손익 분석(유대 − 사료비)의 비용 축입니다.
        </p>
      </div>

      {/* 배합 목록 */}
      {isLoading ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--ct-text-muted)' }}>배합 목록 로딩 중…</div>
      ) : (
        <div className="space-y-2">
          {(programs ?? []).map((p) => (
            <div key={p.programId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3" style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-card)' }}>
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>
                  {p.name} <span className="ml-1 rounded px-1.5 py-0.5 text-xs" style={{ background: 'var(--ct-border)', color: 'var(--ct-text-secondary)' }}>{GROUP_LABELS[p.targetGroup] ?? p.targetGroup}</span>
                </div>
                <div className="mt-0.5 text-xs" style={{ color: 'var(--ct-text-muted)' }}>
                  원료 {p.ingredients.length}종 · 두당 일 사료비 <b style={{ color: 'var(--ct-text)' }}>{(p.dailyCostPerHead ?? 0).toLocaleString()}원</b>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => startEdit(p)} className="rounded border px-3 py-1 text-xs" style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}>편집</button>
                <button type="button" onClick={() => deleteMutation.mutate(p.programId)} className="rounded border border-red-400/40 px-3 py-1 text-xs text-red-400">삭제</button>
              </div>
            </div>
          ))}
          {(programs ?? []).length === 0 && !editing && (
            <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm" style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text-muted)' }}>
              등록된 배합이 없습니다. 첫 TMR 배합을 등록하면 사료비 분석이 시작됩니다.
            </div>
          )}
        </div>
      )}

      {!editing && (
        <button type="button" onClick={startNew} className="rounded-md px-4 py-2 text-sm font-bold text-white" style={{ background: 'var(--ct-primary)' }}>
          + 새 배합 등록
        </button>
      )}

      {/* 편집기 */}
      {editing && (
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-card)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={editing.name}
              onChange={(e) => setEditing((s) => s && { ...s, name: e.target.value })}
              placeholder="배합 이름"
              aria-label="배합 이름"
              className="rounded border px-3 py-1.5 text-sm font-semibold"
              style={{ background: 'var(--ct-surface-2, rgba(255,255,255,0.03))', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
            />
            <select
              value={editing.targetGroup}
              onChange={(e) => setEditing((s) => s && { ...s, targetGroup: e.target.value })}
              aria-label="대상군"
              className="rounded border px-2 py-1.5 text-sm"
              style={{ background: 'var(--ct-surface-2, rgba(255,255,255,0.03))', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
            >
              {Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: 'var(--ct-text-muted)' }}>
                <th className="py-1 pr-2">원료명</th>
                <th className="py-1 pr-2">급여량 (kg/일/두)</th>
                <th className="py-1 pr-2">단가 (원/kg)</th>
                <th className="py-1 pr-2 text-right">일 비용</th>
                <th aria-label="행 삭제" />
              </tr>
            </thead>
            <tbody>
              {editing.rows.map((row, idx) => {
                const rowCost = Number(row.amountKgPerDay) > 0 && Number(row.costPerKg) >= 0
                  ? Math.round(Number(row.amountKgPerDay) * Number(row.costPerKg))
                  : 0;
                const setRow = (patch: Partial<IngredientDraft>): void =>
                  setEditing((s) => s && { ...s, rows: s.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });
                const inputStyle = { background: 'var(--ct-surface-2, rgba(255,255,255,0.03))', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' } as const;
                return (
                  <tr key={idx}>
                    <td className="py-1 pr-2">
                      <input value={row.name} onChange={(e) => setRow({ name: e.target.value })} placeholder="예: 옥수수 사일리지" aria-label={`${idx + 1}번 원료명`} className="w-full rounded border px-2 py-1" style={inputStyle} />
                    </td>
                    <td className="py-1 pr-2">
                      <input type="number" min={0} max={100} step={0.1} value={row.amountKgPerDay} onChange={(e) => setRow({ amountKgPerDay: e.target.value })} aria-label={`${idx + 1}번 급여량`} className="w-24 rounded border px-2 py-1" style={inputStyle} />
                    </td>
                    <td className="py-1 pr-2">
                      <input type="number" min={0} max={100000} step={1} value={row.costPerKg} onChange={(e) => setRow({ costPerKg: e.target.value })} aria-label={`${idx + 1}번 단가`} className="w-24 rounded border px-2 py-1" style={inputStyle} />
                    </td>
                    <td className="py-1 pr-2 text-right text-xs" style={{ color: 'var(--ct-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      {rowCost.toLocaleString()}원
                    </td>
                    <td className="py-1 text-right">
                      <button type="button" onClick={() => setEditing((s) => s && { ...s, rows: s.rows.filter((_, i) => i !== idx) })} aria-label={`${idx + 1}번 원료 삭제`} className="text-xs" style={{ color: 'var(--ct-text-muted)' }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setEditing((s) => s && { ...s, rows: [...s.rows, { ...EMPTY_ROW }] })} className="rounded border px-3 py-1 text-xs" style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}>
              + 원료 추가
            </button>
            <div className="text-sm" style={{ color: 'var(--ct-text)' }}>
              두당 일 사료비 <b style={{ fontSize: 16 }}>{liveCost.toLocaleString()}원</b>
            </div>
          </div>

          {saveMutation.isError && <p className="mt-2 text-xs text-red-400">저장 실패 — 원료명·급여량·단가를 확인해주세요</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={saveMutation.isPending || draftsToIngredients(editing.rows).length === 0}
              onClick={() => saveMutation.mutate()}
              className="rounded-md px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: 'var(--ct-primary)' }}
            >
              {saveMutation.isPending ? '저장 중…' : '배합 저장'}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-md border px-4 py-1.5 text-sm" style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}
