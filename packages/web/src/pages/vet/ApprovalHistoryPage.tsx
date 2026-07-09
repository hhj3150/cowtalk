// 승인 이력 페이지 — 수의사·행정관 (AIP 거버넌스 감사 뷰)
// 대기/승인/거절 전체 이력 + 결정 메모 + 실행 결과. 대기 건은 여기서도 즉시 결정 가능.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchApprovals,
  approveRequest,
  rejectRequest,
  type ApprovalRequestView,
} from '@web/api/approval.api';
import { TitleAccentBar } from '@web/components/unified-dashboard/WidgetTitle';

type StatusTab = 'all' | 'pending' | 'approved' | 'rejected';

const TABS: ReadonlyArray<{ key: StatusTab; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '대기' },
  { key: 'approved', label: '승인' },
  { key: 'rejected', label: '거절' },
];

const STATUS_META: Readonly<Record<string, { label: string; color: string }>> = {
  pending: { label: '대기', color: '#fbbf24' },
  approved: { label: '승인', color: '#22c55e' },
  rejected: { label: '거절', color: '#ef4444' },
};

function summarizeInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (v == null || typeof v === 'object') continue;
    parts.push(`${k}: ${String(v)}`);
    if (parts.length >= 4) break;
  }
  return parts.join(' · ');
}

function executionSummary(result: unknown): string | null {
  if (result == null || typeof result !== 'object') return null;
  const r = result as { success?: boolean };
  if (r.success === true) return '실행 성공';
  if (r.success === false) return '실행 실패';
  return null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function HistoryRow({ req, onDone }: {
  readonly req: ApprovalRequestView;
  readonly onDone: () => void;
}): React.JSX.Element {
  const approve = useMutation({
    mutationFn: (note?: string) => approveRequest(req.approvalId, note),
    onSettled: onDone,
  });
  const reject = useMutation({
    mutationFn: (note?: string) => rejectRequest(req.approvalId, note),
    onSettled: onDone,
  });
  const busy = approve.isPending || reject.isPending;
  const meta = STATUS_META[req.status] ?? { label: req.status, color: 'var(--ct-text-muted)' };
  const exec = executionSummary(req.executionResult);

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      background: 'var(--ct-surface-2, rgba(255,255,255,0.03))',
      border: '1px solid var(--ct-border)',
      borderLeft: `3px solid ${meta.color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, fontWeight: 800, color: meta.color,
          border: `1px solid ${meta.color}55`, borderRadius: 6, padding: '1px 7px',
        }}>
          {meta.label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)', letterSpacing: '-0.2px' }}>
          {req.toolLabel}
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--ct-text-muted)' }}>
          {req.requesterName ?? req.requestedRole}
          {req.farmName ? ` · ${req.farmName}` : ''}
          {' · 요청 '}{fmtDate(req.createdAt)}
        </span>
        {req.status === 'pending' && (
          <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => approve.mutate(undefined)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 8,
                border: '1px solid rgba(34,197,94,0.5)', background: 'rgba(34,197,94,0.12)',
                color: '#22c55e', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
              }}
            >
              {approve.isPending ? '실행 중…' : '승인·실행'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const note = window.prompt('거절 사유 (선택):') ?? undefined;
                reject.mutate(note || undefined);
              }}
              style={{
                fontSize: 11, fontWeight: 700, padding: '5px 11px', borderRadius: 8,
                border: '1px solid var(--ct-border)', background: 'transparent',
                color: 'var(--ct-text-secondary)', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
              }}
            >
              거절
            </button>
          </span>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--ct-text-secondary)', marginTop: 5, lineHeight: 1.5 }}>
        {summarizeInput(req.toolInput) || '입력 상세 없음'}
      </div>

      {req.status !== 'pending' && (
        <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginTop: 5, lineHeight: 1.5 }}>
          {req.approverName ? `결정: ${req.approverName}` : '결정자 미기록'}
          {req.decidedAt ? ` · ${fmtDate(req.decidedAt)}` : ''}
          {exec ? ` · ${exec}` : ''}
          {req.decisionNote ? ` · 메모: ${req.decisionNote}` : ''}
        </div>
      )}
    </div>
  );
}

export function ApprovalHistoryPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<StatusTab>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['approval-history', tab],
    queryFn: () => fetchApprovals(tab),
    staleTime: 30 * 1000,
  });
  const requests = data?.requests ?? [];

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <TitleAccentBar color="#fbbf24" />
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ct-text)', margin: 0 }}>승인 이력</h1>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ct-text-muted)', marginBottom: 14 }}>
        고위험 도구 실행 요청의 전체 감사 기록입니다. 승인 시 즉시 실행되며 모든 결정이 기록됩니다.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setTab(t.key); }}
            style={{
              fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8,
              border: '1px solid', cursor: 'pointer',
              borderColor: tab === t.key ? 'var(--ct-primary)' : 'var(--ct-border)',
              background: tab === t.key ? 'rgba(16,185,129,0.1)' : 'transparent',
              color: tab === t.key ? 'var(--ct-primary)' : 'var(--ct-text-secondary)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="ct-shimmer" style={{ height: 120, borderRadius: 12 }} />}
      {!isLoading && requests.length === 0 && (
        <div className="ct-card" style={{ borderRadius: 12, padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--ct-text-muted)' }}>
          해당 상태의 승인 요청이 없습니다.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {requests.map((req) => (
          <HistoryRow
            key={req.approvalId}
            req={req}
            onDone={() => { void queryClient.invalidateQueries({ queryKey: ['approval-history'] }); }}
          />
        ))}
      </div>
    </div>
  );
}

export default ApprovalHistoryPage;
