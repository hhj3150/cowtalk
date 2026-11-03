// 목장 번식 설정 — smaXtec "Dashboard settings" 화면과 같은 항목을 같은 순서로
//
// 건유·임신감정·장기공태·분만 임박 리마인더와 번식 인사이트가 이 값을 쓴다.
// 출처(기본값/smaXtec/직접 입력) 배지를 항상 표시해 어떤 값이 적용 중인지 숨기지 않는다.
// smaXtec 화면 문구를 함께 보여 줘 농장주가 그대로 옮겨 적을 수 있게 한다.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  BreedingSettingGroup,
  BreedingSettingKey,
  BreedingSettingSource,
  BreedingSettingView,
  BreedingSettingsPatch,
} from '@cowtalk/shared';
import { getFarmBreedingSettingsDetail, saveFarmBreedingSettings } from '@web/api/breeding.api';
import { useFarmStore } from '@web/stores/farm.store';
import { useAuthStore } from '@web/stores/auth.store';
import { TitleAccentBar } from '@web/components/unified-dashboard/WidgetTitle';

const SOURCE_BADGE: Record<BreedingSettingSource, { label: string; cls: string }> = {
  default: { label: '기본값', cls: 'bg-slate-700 text-slate-300' },
  smaxtec: { label: 'smaXtec', cls: 'bg-sky-900/60 text-sky-300' },
  manual: { label: '직접 입력', cls: 'bg-emerald-900/60 text-emerald-300' },
};

const GROUPS: readonly { key: BreedingSettingGroup; title: string }[] = [
  { key: 'todo', title: 'To-do list' },
  { key: 'health', title: 'Health status' },
  { key: 'fertility', title: 'Fertility status' },
];

function formatValue(s: BreedingSettingView, value: number | null): string {
  if (s.kind === 'boolean') return value === 1 ? '활성' : '비활성';
  if (value === null) return '미사용';
  return `${value.toLocaleString()}${s.unit ? ` ${s.unit}` : ''}`;
}

function errorMessage(e: unknown): string {
  return (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '저장에 실패했습니다';
}

export default function BreedingSettingsPage(): React.ReactElement {
  const selectedFarmId = useFarmStore((s) => s.selectedFarmId);
  const role = useAuthStore((s) => s.user?.role);
  const queryClient = useQueryClient();
  const farmId = selectedFarmId ?? undefined;
  const canEdit = farmId != null && (role === 'farmer' || role === 'veterinarian' || role === 'government_admin');

  const [drafts, setDrafts] = useState<Partial<Record<BreedingSettingKey, string>>>({});
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['breeding-settings', farmId],
    queryFn: () => getFarmBreedingSettingsDetail(farmId!),
    enabled: farmId != null,
  });

  const saveMutation = useMutation({
    mutationFn: (patch: BreedingSettingsPatch) => saveFarmBreedingSettings(farmId!, patch),
    onSuccess: (next) => {
      setError(null);
      queryClient.setQueryData(['breeding-settings', farmId], next);
    },
    onError: (e: unknown) => setError(errorMessage(e)),
  });

  const save = (key: BreedingSettingKey, value: number | null): void => {
    saveMutation.mutate({ [key]: value } as BreedingSettingsPatch, {
      onSuccess: () => setDrafts((d) => ({ ...d, [key]: undefined })),
    });
  };

  if (farmId == null) {
    return (
      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <TitleAccentBar />
          목장 번식 설정
        </h1>
        <p className="mt-4 text-sm text-amber-400">상단에서 목장을 먼저 선택하세요. 번식 설정은 목장마다 다릅니다.</p>
      </div>
    );
  }

  const settings = data?.settings ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <TitleAccentBar />
          목장 번식 설정
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          smaXtec 대시보드 설정과 같은 항목입니다. 건유·임신감정·장기공태·분만 임박 알림과 번식 인사이트가 이 값을 씁니다.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          smaXtec 동기화: {data?.syncedAt ? new Date(data.syncedAt).toLocaleString('ko-KR') : '아직 없음'}
          {' · '}직접 입력: {data?.manualUpdatedAt ? new Date(data.manualUpdatedAt).toLocaleString('ko-KR') : '없음'}
        </p>
        {!canEdit && (
          <p className="mt-2 text-xs text-amber-400">현재 역할에서는 조회만 가능합니다.</p>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-slate-400">불러오는 중…</div>
      ) : isError ? (
        <div role="alert" className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          설정을 불러오지 못했습니다. 잠시 후 다시 시도하세요.
        </div>
      ) : (
        GROUPS.map((group) => {
          const rows = settings.filter((s) => s.group === group.key);
          if (rows.length === 0) return null;
          return (
            <section key={group.key} className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800/60">
              <h2 className="border-b border-slate-700 px-4 py-2 text-sm font-semibold text-lime-400">{group.title}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-xs text-slate-400">
                    <th className="px-4 py-2">항목</th>
                    <th className="px-4 py-2">적용 값</th>
                    <th className="px-4 py-2">출처</th>
                    <th className="px-4 py-2">smaXtec 기본</th>
                    {canEdit && <th className="px-4 py-2">변경</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const draft = drafts[s.key];
                    const differsFromSmaxtec = s.smaxtecDefault !== null && s.value !== s.smaxtecDefault;
                    return (
                      <tr key={s.key} className="border-b border-slate-700/50 last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-100">{s.labelKo}</div>
                          <div className="mt-0.5 max-w-sm text-xs text-slate-500">{s.smaxtecLabel}</div>
                          <div className="mt-0.5 text-[11px] text-slate-600">사용처: {s.usedBy}</div>
                        </td>
                        <td className={`whitespace-nowrap px-4 py-3 font-semibold ${differsFromSmaxtec ? 'text-amber-300' : 'text-slate-100'}`}>
                          {formatValue(s, s.value)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded px-2 py-0.5 text-xs ${SOURCE_BADGE[s.source].cls}`}>
                            {SOURCE_BADGE[s.source].label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-400">{formatValue(s, s.smaxtecDefault)}</td>
                        {canEdit && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {s.kind === 'boolean' ? (
                                <button
                                  type="button"
                                  disabled={saveMutation.isPending}
                                  onClick={() => save(s.key, s.value === 1 ? 0 : 1)}
                                  aria-label={`${s.labelKo} ${s.value === 1 ? '비활성으로' : '활성으로'} 변경`}
                                  className="rounded-md border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                                >
                                  {s.value === 1 ? '비활성으로' : '활성으로'}
                                </button>
                              ) : (
                                <>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={s.min}
                                    max={s.max}
                                    value={draft ?? ''}
                                    placeholder={s.value === null ? '미사용' : String(s.value)}
                                    aria-label={`${s.labelKo} 새 값`}
                                    onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                                    className="w-24 rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100 focus:border-sky-500 focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    disabled={!draft || saveMutation.isPending}
                                    onClick={() => save(s.key, Number(draft))}
                                    className="rounded-md bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-40"
                                  >
                                    저장
                                  </button>
                                </>
                              )}
                              {s.source === 'manual' && (
                                <button
                                  type="button"
                                  disabled={saveMutation.isPending}
                                  onClick={() => save(s.key, null)}
                                  title="직접 입력을 해제하고 smaXtec 동기화 값 또는 기본값으로 되돌립니다"
                                  className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
                                >
                                  해제
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
            </section>
          );
        })
      )}

      <p className="text-xs text-slate-500">
        우선순위: 직접 입력 &gt; smaXtec 동기화 &gt; CowTalk 기본값. 직접 입력한 항목은 smaXtec 동기화가 덮어쓰지 않습니다.
        주황색 값은 smaXtec 공장 기본값과 다르게 운영 중인 항목입니다.
      </p>
    </div>
  );
}
