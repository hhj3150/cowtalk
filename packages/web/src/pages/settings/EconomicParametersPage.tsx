// 경제 파라미터 설정 — "경제 계산식 하드코딩 금지" 원칙의 관리 화면
//
// 모든 경제 환산(결정 카드의 "미조치 시 일 손실" 등)이 이 값을 쓴다.
// 출처(기본값/글로벌/농장) 배지를 항상 표시해 어떤 값이 적용 중인지 숨기지 않는다.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { EconomicParameterKey, EconomicParameterView } from '@cowtalk/shared';
import {
  getEconomicParameters,
  saveEconomicParameter,
  resetEconomicParameter,
} from '@web/api/economics.api';
import { useFarmStore } from '@web/stores/farm.store';
import { useAuthStore } from '@web/stores/auth.store';
import { TitleAccentBar } from '@web/components/unified-dashboard/WidgetTitle';

const SOURCE_BADGE: Record<EconomicParameterView['source'], { label: string; cls: string }> = {
  default: { label: '기본값', cls: 'bg-slate-700 text-slate-300' },
  global: { label: '글로벌', cls: 'bg-sky-900/60 text-sky-300' },
  farm: { label: '농장 설정', cls: 'bg-emerald-900/60 text-emerald-300' },
};

export default function EconomicParametersPage(): React.ReactElement {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const role = useAuthStore((s) => s.user?.role);
  const queryClient = useQueryClient();

  // 행정관리자는 농장 미선택 시 글로벌 값을 편집, 그 외 역할은 선택 농장 값을 편집
  const farmId = selectedFarmId ?? undefined;
  const scopeLabel = farmId ? '선택 농장' : '글로벌 (전체 농장 기본)';
  const canEdit =
    role === 'government_admin' || (farmId != null && (role === 'farmer' || role === 'veterinarian'));

  const [drafts, setDrafts] = useState<Partial<Record<EconomicParameterKey, string>>>({});
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['economic-parameters', farmId ?? 'global'],
    queryFn: () => getEconomicParameters(farmId),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['economic-parameters', farmId ?? 'global'] });

  const saveMutation = useMutation({
    mutationFn: (input: { key: EconomicParameterKey; value: number }) =>
      saveEconomicParameter({ ...input, farmId }),
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { error?: string } } }).response?.data?.error ??
        '저장에 실패했습니다';
      setError(msg);
    },
  });

  const resetMutation = useMutation({
    mutationFn: (key: EconomicParameterKey) => resetEconomicParameter(key, farmId),
    onSuccess: () => {
      setError(null);
      void invalidate();
    },
  });

  const parameters = data?.parameters ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <TitleAccentBar />
          경제 파라미터
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          결정 카드의 손실 환산 등 모든 경제 계산이 이 값을 사용합니다. 적용 범위:{' '}
          <span className="font-semibold text-slate-200">{scopeLabel}</span>
        </p>
        {!canEdit && (
          <p className="mt-2 text-xs text-amber-400">
            현재 역할/범위에서는 조회만 가능합니다. 농장별 값은 농장 선택 후 수정하세요.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-slate-400">불러오는 중…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs text-slate-400">
                <th className="px-4 py-3">항목</th>
                <th className="px-4 py-3">적용 값</th>
                <th className="px-4 py-3">출처</th>
                <th className="px-4 py-3">기본값</th>
                {canEdit && <th className="px-4 py-3">변경</th>}
              </tr>
            </thead>
            <tbody>
              {parameters.map((p) => {
                const draft = drafts[p.key];
                const overridden = farmId ? p.source === 'farm' : p.source !== 'default';
                return (
                  <tr key={p.key} className="border-b border-slate-700/50 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-100">{p.labelKo}</div>
                      <div className="mt-0.5 max-w-xs text-xs text-slate-500">{p.basis}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-100">
                      {p.value.toLocaleString()} <span className="text-xs text-slate-400">{p.unit}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs ${SOURCE_BADGE[p.source].cls}`}>
                        {SOURCE_BADGE[p.source].label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                      {p.defaultValue.toLocaleString()}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            value={draft ?? ''}
                            placeholder={String(p.value)}
                            aria-label={`${p.labelKo} 새 값`}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [p.key]: e.target.value }))
                            }
                            className="w-28 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100 focus:border-sky-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={!draft || saveMutation.isPending}
                            onClick={() => {
                              const value = Number(draft);
                              saveMutation.mutate(
                                { key: p.key, value },
                                { onSuccess: () => setDrafts((d) => ({ ...d, [p.key]: undefined })) },
                              );
                            }}
                            className="rounded-md bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
                          >
                            저장
                          </button>
                          {overridden && (
                            <button
                              type="button"
                              disabled={resetMutation.isPending}
                              onClick={() => resetMutation.mutate(p.key)}
                              className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
                              title="오버라이드를 제거하고 상위 값으로 되돌립니다"
                            >
                              초기화
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        우선순위: 농장 설정 &gt; 글로벌 &gt; 기본값. 기본값은 문헌·고시 기반 보수 추정치이며, 실제
        계약 단가·비용으로 수정할수록 경제 환산이 정확해집니다.
      </p>
    </div>
  );
}
