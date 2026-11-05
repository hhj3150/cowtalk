// 휴식·행동 — 우군·그룹 단위 횡와(휴식)·기립·이동·반추 자세의 추세
//
// 원칙: 그룹 추세를 보는 화면이다. 하루 수치나 단일 지표로 원인을 단정하지 않고,
// 개별 소의 질병 진단에 쓰지 않는다. 가장 중요한 비교 대상은 이 목장의 기존 데이터(기준선)다.
// 데이터는 CSV 업로드(지금) 또는 센서 수집 어댑터(연동 시)로 들어온다.

import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceArea, CartesianGrid } from 'recharts';
import {
  BEHAVIOR_GROUP_LABELS,
  BEHAVIOR_METRIC_MAP,
  BEHAVIOR_SMALL_GROUP_THRESHOLD,
  LYING_TIME_REFERENCE,
  computeBehaviorTrend,
  mapBehaviorCsv,
  parseDelimited,
  validateBehaviorRows,
} from '@cowtalk/shared';
import type { BehaviorCsvResult, BehaviorGroupKey, BehaviorMetricKey } from '@cowtalk/shared';
import { getBehaviorDaily, saveBehaviorDaily } from '@web/api/behavior.api';
import { describeColdPathError } from '@web/api/client';
import { useEffectiveFarmId } from '@web/hooks/useEffectiveFarmId';
import { TitleAccentBar } from '@web/components/unified-dashboard/WidgetTitle';

type Housing = 'housed' | 'pasture';

const CARD_METRICS: readonly BehaviorMetricKey[] = [
  'lyingHours', 'standingHours', 'movingHours', 'ruminationLyingPct', 'ruminationStandingPct', 'peakLyingSyncPct',
];

const box: React.CSSProperties = { borderColor: 'var(--ct-border)', background: 'var(--ct-card)' };
const muted: React.CSSProperties = { color: 'var(--ct-text-muted)' };

function fmt(v: number | null, unit: string): string {
  if (v === null) return '—';
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit === '%' ? '%' : unit === 'h' ? 'h' : ` ${unit}`}`;
}

export default function BehaviorPage(): React.ReactElement {
  const farmId = useEffectiveFarmId();
  const queryClient = useQueryClient();
  const [housing, setHousing] = useState<Housing>('housed');
  const [group, setGroup] = useState<BehaviorGroupKey | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['behavior-daily', farmId],
    queryFn: () => getBehaviorDaily(farmId!, 60),
    enabled: farmId != null,
  });
  const records = useMemo(() => data?.records ?? [], [data]);

  const groups = useMemo(() => {
    const set = new Set(records.map((r) => r.groupKey));
    return (Object.keys(BEHAVIOR_GROUP_LABELS) as BehaviorGroupKey[]).filter((g) => set.has(g));
  }, [records]);
  const activeGroup: BehaviorGroupKey | null = group && groups.includes(group) ? group : (groups[0] ?? null);

  const groupRecords = useMemo(
    () => (activeGroup ? records.filter((r) => r.groupKey === activeGroup) : []),
    [records, activeGroup],
  );
  const latestCount = groupRecords[groupRecords.length - 1]?.metrics.animalCount ?? null;
  const ref = LYING_TIME_REFERENCE[housing];

  const chartData = useMemo(() => groupRecords.slice(-30).map((r) => ({
    date: r.date.slice(5),
    lying: r.metrics.lyingHours ?? null,
    standing: r.metrics.standingHours ?? null,
    moving: r.metrics.movingHours ?? null,
  })), [groupRecords]);

  if (farmId == null) {
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <h1 className="flex items-center gap-2 text-xl font-bold" style={{ color: 'var(--ct-text)' }}><TitleAccentBar />휴식·행동</h1>
        <p className="mt-4 text-sm text-amber-400">상단에서 목장을 먼저 선택하세요.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold" style={{ color: 'var(--ct-text)' }}><TitleAccentBar />휴식·행동</h1>
        <p className="mt-1 text-sm" style={muted}>
          우군·그룹 단위 횡와(휴식)·기립·이동·반추 자세의 추세입니다. 하루 수치보다 며칠에 걸친 변화를 보고,
          개별 소의 질병 진단에는 쓰지 않습니다. 가장 좋은 비교 기준은 이 목장의 기존 데이터입니다.
        </p>
      </div>

      {isLoading ? (
        <div className="py-10 text-center" style={muted}>불러오는 중…</div>
      ) : isError ? (
        <div role="alert" className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {describeColdPathError(error)}{' '}
          <button type="button" className="underline" onClick={() => { void refetch(); }}>다시 시도</button>
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-xl border px-4 py-8 text-center text-sm" style={{ ...box, ...muted }}>
          아직 행동 데이터가 없습니다. 아래에서 CSV를 올리면 추세가 표시됩니다.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={g === activeGroup}
                onClick={() => setGroup(g)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${g === activeGroup ? 'bg-lime-600 text-white' : 'border'}`}
                style={g === activeGroup ? undefined : { ...box, color: 'var(--ct-text)' }}
              >
                {BEHAVIOR_GROUP_LABELS[g]}
              </button>
            ))}
            <span className="ml-auto text-xs" style={muted}>사육 형태</span>
            <select
              aria-label="사육 형태"
              value={housing}
              onChange={(e) => setHousing(e.target.value as Housing)}
              className="rounded-md border px-2 py-1 text-xs"
              style={{ ...box, color: 'var(--ct-text)' }}
            >
              <option value="housed">축사</option>
              <option value="pasture">방목</option>
            </select>
          </div>

          {latestCount !== null && latestCount <= BEHAVIOR_SMALL_GROUP_THRESHOLD && (
            <p className="text-xs text-amber-400">
              이 그룹은 {latestCount}두로 작아 그룹 평균의 변동이 큽니다 — 참고용으로만 보세요.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {activeGroup && CARD_METRICS.map((key) => {
              const def = BEHAVIOR_METRIC_MAP[key];
              const t = computeBehaviorTrend(records, activeGroup, key);
              const outOfRange = key === 'lyingHours' && t.latest !== null && (t.latest < ref.min || t.latest > ref.max);
              return (
                <div key={key} className="rounded-xl border p-3" style={box}>
                  <div className="text-xs" style={muted}>{def.labelKo}</div>
                  <div className={`mt-1 text-2xl font-bold ${outOfRange ? 'text-amber-400' : ''}`} style={outOfRange ? undefined : { color: 'var(--ct-text)' }}>
                    {fmt(t.latest, def.unit)}
                  </div>
                  <div className="mt-1 text-xs" style={muted}>
                    {t.deltaVsPrior7 === null
                      ? '직전 7일 비교 데이터 없음'
                      : `직전 7일 평균 ${fmt(t.prior7Avg, def.unit)} 대비 ${t.deltaVsPrior7 > 0 ? '+' : ''}${t.deltaVsPrior7}`}
                    {t.priorDays > 0 && t.priorDays < 5 && ` (${t.priorDays}일치)`}
                  </div>
                  {key === 'lyingHours' && <div className="mt-1 text-[11px]" style={muted}>참고: {ref.labelKo}</div>}
                  {t.latestDate && <div className="mt-1 text-[11px]" style={muted}>{t.latestDate}</div>}
                </div>
              );
            })}
          </div>

          {chartData.length > 1 && (
            <div className="rounded-xl border p-3" style={box}>
              <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>최근 30일 — 횡와·기립·이동 (시간)</div>
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--ct-text-muted)' }} />
                    <YAxis domain={[0, 24]} tick={{ fontSize: 11, fill: 'var(--ct-text-muted)' }} />
                    <ReferenceArea y1={ref.min} y2={ref.max} fill="#65a30d" fillOpacity={0.12} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="lying" name="횡와" stroke="#14b8a6" strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="standing" name="기립" stroke="#f472b6" strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="moving" name="이동" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[11px]" style={muted}>초록 띠 = 횡와시간 참고 범위({ref.labelKo})</p>
            </div>
          )}
        </>
      )}

      <BehaviorCsvUpload
        farmId={farmId}
        onSaved={() => { void queryClient.invalidateQueries({ queryKey: ['behavior-daily', farmId] }); }}
      />
    </div>
  );
}

function BehaviorCsvUpload({ farmId, onSaved }: { readonly farmId: string; readonly onSaved: () => void }): React.ReactElement {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [defaultGroup, setDefaultGroup] = useState<BehaviorGroupKey>('all');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const preview: BehaviorCsvResult | null = useMemo(
    () => (text.trim() ? mapBehaviorCsv(parseDelimited(text), defaultGroup) : null),
    [text, defaultGroup],
  );

  const save = useMutation({
    mutationFn: () => {
      const verdict = validateBehaviorRows(preview?.rows ?? []);
      if (!verdict.ok) throw new Error(verdict.reason);
      return saveBehaviorDaily(farmId, verdict.rows);
    },
    onSuccess: (r) => {
      setMessage({ ok: true, text: `${r.saved}행 저장했습니다. 같은 날짜·그룹은 갱신됩니다.` });
      setText('');
      onSaved();
    },
    onError: (e: unknown) => {
      const server = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setMessage({ ok: false, text: server ?? (e instanceof Error ? e.message : '저장에 실패했습니다') });
    },
  });

  return (
    <div className="rounded-xl border p-4" style={box}>
      <div className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>CSV 올리기</div>
      <p className="mt-1 text-xs" style={muted}>
        필수 열: 날짜. 인식하는 열: 횡와·기립·이동 시간(h), 활동성/비활동성 기립, 횡와·기립 중 반추(분 또는 %),
        최대 동시 횡와율(%), 두수, 그룹. 열 이름은 한글·영문 모두 됩니다.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.tsv"
          aria-label="CSV 파일 선택"
          className="text-xs"
          style={{ color: 'var(--ct-text)' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setMessage(null);
            void f.text().then(setText);
          }}
        />
        <label className="text-xs" style={muted} htmlFor="behavior-default-group">그룹 열이 없을 때</label>
        <select
          id="behavior-default-group"
          value={defaultGroup}
          onChange={(e) => setDefaultGroup(e.target.value as BehaviorGroupKey)}
          className="rounded-md border px-2 py-1 text-xs"
          style={{ ...box, color: 'var(--ct-text)' }}
        >
          {(Object.keys(BEHAVIOR_GROUP_LABELS) as BehaviorGroupKey[]).map((g) => (
            <option key={g} value={g}>{BEHAVIOR_GROUP_LABELS[g]}</option>
          ))}
        </select>
      </div>
      <textarea
        aria-label="CSV 내용 붙여넣기"
        value={text}
        onChange={(e) => { setText(e.target.value); setMessage(null); }}
        placeholder={'날짜,그룹,횡와시간,기립시간,이동시간\n2026-11-04,착유우,13.4,7.2,3.4'}
        rows={4}
        className="mt-2 w-full rounded-md border px-2 py-1 font-mono text-xs"
        style={{ ...box, color: 'var(--ct-text)' }}
      />
      {preview && (
        <div className="mt-2 text-xs" style={muted}>
          {Object.keys(preview.mapped).length === 0 || !Object.values(preview.mapped).includes('date')
            ? <span className="text-amber-400">날짜 열을 찾지 못했습니다. 첫 줄에 열 이름(날짜 등)이 있는지 확인하세요.</span>
            : <>
                인식: {Object.entries(preview.mapped).map(([h, k]) => `${h}→${k === 'date' ? '날짜' : k === 'group' ? '그룹' : BEHAVIOR_METRIC_MAP[k as BehaviorMetricKey].labelKo}`).join(', ')}
                {' · '}저장할 행 {preview.rows.length}
                {preview.skipped > 0 && ` · 건너뜀 ${preview.skipped}`}
                {preview.unmatchedHeaders.length > 0 && ` · 무시한 열: ${preview.unmatchedHeaders.join(', ')}`}
              </>}
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={!preview || preview.rows.length === 0 || save.isPending}
          onClick={() => save.mutate()}
          className="rounded-md bg-lime-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {save.isPending ? '저장 중…' : '저장'}
        </button>
        {message && (
          <span role="status" className={`text-xs ${message.ok ? 'text-lime-400' : 'text-red-400'}`}>{message.text}</span>
        )}
      </div>
    </div>
  );
}
