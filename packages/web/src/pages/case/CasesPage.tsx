// 관리 케이스 — "오늘 어떤 건이 끝나지 않았는가"
//
// 화면 설계 원칙:
// - 첫 화면은 그래프가 아니라 '끝나지 않은 일' 목록이다.
// - 상단 4개 숫자는 뱃지가 아니라 필터다 (미배정·기한초과·악화·재확인누락을 바로 좁힐 수 있게).
// - 상세는 세 부분: 지금 상태 / 왜 열렸는가 / 지금 무엇을 할지.
// - 정렬·플래그 판정은 서버와 같은 규칙(@cowtalk/shared 의 case.ts)을 쓴다.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CaseDetail,
  CaseFlag,
  CaseListItem,
  CaseOutcome,
  CaseStatus,
} from '@cowtalk/shared';
import {
  CASE_FLAG_LABELS,
  CASE_OUTCOME_LABELS,
  CASE_STATUS_LABELS,
} from '@cowtalk/shared';
import {
  addCaseEvent,
  assignCase,
  closeCase,
  fetchCaseDetail,
  fetchCaseSummary,
  fetchCases,
} from '@web/api/case.api';
import { useFarmStore } from '@web/stores/farm.store';
import { TitleAccentBar } from '@web/components/unified-dashboard/WidgetTitle';

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
};

const FLAG_STYLE: Record<CaseFlag, string> = {
  worsened: 'bg-red-600 text-white',
  overdue: 'bg-orange-600 text-white',
  recheck_missing: 'bg-amber-600 text-white',
  unassigned: 'bg-slate-600 text-white',
};

const STATUS_STEPS: readonly CaseStatus[] = [
  'detected',
  'assigned',
  'field_checked',
  'treated',
  'rechecking',
  'closed',
];

function fmt(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 상단 요약 숫자 — 누르면 그 상태로 목록이 좁혀진다 */
function SummaryTile(props: {
  label: string;
  value: number | null;
  active: boolean;
  onClick: () => void;
  tone?: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      aria-label={`${props.label} ${props.value ?? 0}건 — 눌러서 필터`}
      className={`flex-1 min-w-[110px] rounded-lg border px-3 py-2 text-left transition ${
        props.active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <div className="text-xs text-slate-500">{props.label}</div>
      <div className={`text-2xl font-bold ${props.tone ?? 'text-slate-900'}`}>{props.value ?? 0}</div>
    </button>
  );
}

function CaseRow(props: {
  item: CaseListItem;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  const { item } = props;
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={`w-full rounded-lg border p-3 text-left transition ${
        props.selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${SEVERITY_STYLE[item.severity] ?? ''}`}>
          {item.severity}
        </span>
        {item.flags.map((f) => (
          <span key={f} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${FLAG_STYLE[f]}`}>
            {CASE_FLAG_LABELS[f]}
          </span>
        ))}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
          {CASE_STATUS_LABELS[item.status]}
        </span>
      </div>
      <div className="mt-1.5 text-sm font-medium text-slate-900">{item.title}</div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
        <span>{item.farmName ?? '목장 미상'}</span>
        {item.earTag ? <span>{item.earTag}번</span> : null}
        <span>담당: {item.currentAssigneeName ?? '없음'}</span>
        <span>감지: {fmt(item.detectedAt)}</span>
        {item.dueAt ? <span>기한: {fmt(item.dueAt)}</span> : null}
      </div>
    </button>
  );
}

/** 상세 — 지금 상태 / 왜 열렸는가 / 지금 무엇을 할지 */
function CasePanel(props: { caseId: string; onChanged: () => void }): React.JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<CaseDetail>({
    queryKey: ['case', props.caseId],
    queryFn: () => fetchCaseDetail(props.caseId),
  });

  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<CaseOutcome>('improved');
  const [error, setError] = useState<string | null>(null);

  const refresh = (): void => {
    void qc.invalidateQueries({ queryKey: ['case', props.caseId] });
    props.onChanged();
    setNotes('');
    setError(null);
  };

  const eventMut = useMutation({
    mutationFn: (eventType: 'field_check' | 'treatment' | 'recheck' | 'note' | 'reopened') =>
      addCaseEvent(props.caseId, {
        eventType,
        notes: notes.trim() || undefined,
        // 악화는 재확인에 붙는 판정이라 details 로 넘긴다 (플래그 계산의 입력)
        details: eventType === 'recheck' && notes.includes('악화') ? { trend: 'worsened' } : undefined,
      }),
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });

  const closeMut = useMutation({
    mutationFn: () => closeCase(props.caseId, { outcome, notes: notes.trim() || undefined }),
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });

  const assignSelfMut = useMutation({
    mutationFn: (assigneeId: string) => assignCase(props.caseId, { assigneeId }),
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading || !data) {
    return <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">불러오는 중…</div>;
  }

  const stepIndex = STATUS_STEPS.indexOf(data.status);
  const isClosed = data.status === 'closed';

  return (
    <div className="space-y-3">
      {/* 1. 지금 상태 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-base font-semibold text-slate-900">{data.title}</div>
        <div className="mt-1 text-xs text-slate-500">
          {data.farmName ?? '—'} · {data.earTag ? `${data.earTag}번` : '개체 미지정'} · 감지 {fmt(data.detectedAt)}
        </div>

        <ol className="mt-3 flex flex-wrap gap-1" aria-label="케이스 진행 단계">
          {STATUS_STEPS.map((s, i) => (
            <li
              key={s}
              className={`rounded px-2 py-1 text-[11px] ${
                i <= stepIndex ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {CASE_STATUS_LABELS[s]}
            </li>
          ))}
        </ol>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
          <div><dt className="text-slate-400">최종 책임자</dt><dd>{data.ownerName ?? '—'}</dd></div>
          <div><dt className="text-slate-400">현재 담당</dt><dd>{data.currentAssigneeName ?? '미배정'}</dd></div>
          <div><dt className="text-slate-400">확인 기한</dt><dd>{fmt(data.dueAt)}</dd></div>
          <div><dt className="text-slate-400">마지막 재확인</dt><dd>{fmt(data.lastRecheckAt)}</dd></div>
        </dl>

        {isClosed ? (
          <div className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-700">
            종료 · 결과 <strong>{CASE_OUTCOME_LABELS[data.outcome ?? 'undetermined']}</strong>
            {data.outcomeNotes ? ` — ${data.outcomeNotes}` : ''}
          </div>
        ) : null}
      </div>

      {/* 2. 왜 열렸는가 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">감지 근거</div>
        {data.detectedSignals.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
            {data.detectedSignals.map((s) => <li key={s}>{s}</li>)}
          </ul>
        ) : (
          <div className="mt-2 text-xs text-slate-400">기록 없음</div>
        )}
      </div>

      {/* 3. 지금 무엇을 할지 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">조치 기록</div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="관찰한 것·한 것을 적습니다 (재확인에 '악화'를 적으면 악화로 표시됩니다)"
          aria-label="조치 내용"
          className="mt-2 w-full rounded border border-slate-300 p-2 text-sm"
          rows={2}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isClosed || eventMut.isPending}
            onClick={() => eventMut.mutate('field_check')}
            className="rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            현장 확인
          </button>
          <button
            type="button"
            disabled={isClosed || eventMut.isPending}
            onClick={() => eventMut.mutate('treatment')}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            조치 실시
          </button>
          <button
            type="button"
            disabled={isClosed || eventMut.isPending}
            onClick={() => eventMut.mutate('recheck')}
            className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            재확인
          </button>
          {isClosed ? (
            <button
              type="button"
              disabled={eventMut.isPending}
              onClick={() => eventMut.mutate('reopened')}
              className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              재개
            </button>
          ) : null}
        </div>

        {!isClosed ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <label htmlFor="case-outcome" className="text-xs text-slate-500">종료 결과</label>
            <select
              id="case-outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as CaseOutcome)}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              {(Object.keys(CASE_OUTCOME_LABELS) as CaseOutcome[]).map((o) => (
                <option key={o} value={o}>{CASE_OUTCOME_LABELS[o]}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={closeMut.isPending}
              onClick={() => closeMut.mutate()}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40"
            >
              케이스 종료
            </button>
            <span className="text-[11px] text-slate-400">결과를 고르지 않으면 종료할 수 없습니다</span>
          </div>
        ) : null}

        {!data.currentAssigneeId ? (
          <button
            type="button"
            disabled={assignSelfMut.isPending}
            onClick={() => {
              const id = window.prompt('담당자 사용자 ID');
              if (id) assignSelfMut.mutate(id);
            }}
            className="mt-3 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
          >
            담당자 배정
          </button>
        ) : null}

        {error ? <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{error}</div> : null}
      </div>

      {/* 이력 — 케이스의 진실은 여기에 있다 */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">단계 기록 ({data.events.length}건)</div>
        <ul className="mt-2 space-y-2">
          {data.events.map((e) => (
            <li key={e.eventId} className="border-l-2 border-slate-200 pl-3 text-xs">
              <div className="font-medium text-slate-700">
                {e.eventType} · {fmt(e.occurredAt)}
                {e.recordedByName ? ` · ${e.recordedByName}` : ''}
              </div>
              {e.notes ? <div className="text-slate-500">{e.notes}</div> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function CasesPage(): React.JSX.Element {
  const selectedFarmIds = useFarmStore((s) => s.selectedFarmIds);
  const farmId = selectedFarmIds.length === 1 ? selectedFarmIds[0] : undefined;

  const [flag, setFlag] = useState<CaseFlag | null>(null);
  const [openOnly, setOpenOnly] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const summaryQ = useQuery({
    queryKey: ['case-summary', farmId],
    queryFn: () => fetchCaseSummary(farmId),
  });

  const listQ = useQuery({
    queryKey: ['cases', farmId, flag, openOnly],
    queryFn: () => fetchCases({ farmId, flag: flag ?? undefined, openOnly, limit: 200 }),
  });

  const refreshAll = (): void => {
    void summaryQ.refetch();
    void listQ.refetch();
  };

  const s = summaryQ.data;
  const items = listQ.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <TitleAccentBar />
        <h1 className="text-xl font-bold text-slate-900">관리 케이스</h1>
        <p className="mt-1 text-sm text-slate-500">
          알림을 읽은 것과 문제가 해결된 것은 다릅니다. 여기서는 한 건이 종료될 때까지 따라갑니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <SummaryTile label="열린 케이스" value={s?.open ?? null} active={flag === null} onClick={() => setFlag(null)} />
        <SummaryTile label="미배정" value={s?.unassigned ?? null} active={flag === 'unassigned'} onClick={() => setFlag('unassigned')} tone="text-slate-700" />
        <SummaryTile label="기한 초과" value={s?.overdue ?? null} active={flag === 'overdue'} onClick={() => setFlag('overdue')} tone="text-orange-600" />
        <SummaryTile label="악화" value={s?.worsened ?? null} active={flag === 'worsened'} onClick={() => setFlag('worsened')} tone="text-red-600" />
        <SummaryTile label="재확인 누락" value={s?.recheckMissing ?? null} active={flag === 'recheck_missing'} onClick={() => setFlag('recheck_missing')} tone="text-amber-600" />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
        열린 케이스만 보기
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          {listQ.isLoading ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">불러오는 중…</div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              {flag ? `${CASE_FLAG_LABELS[flag]} 건이 없습니다` : '열린 케이스가 없습니다'}
            </div>
          ) : (
            items.map((item) => (
              <CaseRow
                key={item.caseId}
                item={item}
                selected={selected === item.caseId}
                onSelect={() => setSelected(item.caseId)}
              />
            ))
          )}
        </div>

        <div>
          {selected ? (
            <CasePanel caseId={selected} onChanged={refreshAll} />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              왼쪽에서 케이스를 선택하면 조치 화면이 열립니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
