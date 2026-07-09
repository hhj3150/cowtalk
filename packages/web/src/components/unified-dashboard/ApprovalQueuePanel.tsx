// 승인 큐 패널 — 수의사·행정관 전용 (AIP 거버넌스)
// farmer가 요청한 고위험 도구(호르몬 동기화 처방 등)를 검토 → 승인(즉시 실행) / 거절.

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchApprovals, approveRequest, rejectRequest, type ApprovalRequestView } from '@web/api/approval.api';
import { TitleAccentBar } from './WidgetTitle';

function summarizeInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (v == null || typeof v === 'object') continue;
    parts.push(`${k}: ${String(v)}`);
    if (parts.length >= 4) break;
  }
  return parts.join(' · ');
}

function ApprovalRow({ req, onDone }: {
  readonly req: ApprovalRequestView;
  readonly onDone: () => void;
}): React.JSX.Element {
  const approve = useMutation({
    mutationFn: () => approveRequest(req.approvalId),
    onSettled: onDone,
  });
  const reject = useMutation({
    mutationFn: () => rejectRequest(req.approvalId),
    onSettled: onDone,
  });
  const busy = approve.isPending || reject.isPending;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '12px 14px',
      borderRadius: 12,
      background: 'var(--ct-surface-2, rgba(255,255,255,0.03))',
      border: '1px solid rgba(251,191,36,0.3)',
      borderLeft: '3px solid #fbbf24',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)', letterSpacing: '-0.2px' }}>
            {req.toolLabel}
          </span>
          <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
            {req.requesterName ?? req.requestedRole}
            {req.farmName ? ` · ${req.farmName}` : ''}
            {' · '}
            {new Date(req.createdAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--ct-text-secondary)', marginTop: 4, lineHeight: 1.5 }}>
          {summarizeInput(req.toolInput) || '입력 상세 없음'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => approve.mutate()}
          style={{
            fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 8,
            border: '1px solid rgba(34,197,94,0.5)', background: 'rgba(34,197,94,0.12)',
            color: '#22c55e', cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap',
            opacity: busy ? 0.5 : 1,
          }}
        >
          {approve.isPending ? '실행 중…' : '승인·실행'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => reject.mutate()}
          style={{
            fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 8,
            border: '1px solid var(--ct-border)', background: 'transparent',
            color: 'var(--ct-text-secondary)', cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap',
            opacity: busy ? 0.5 : 1,
          }}
        >
          거절
        </button>
      </div>
    </div>
  );
}

export function ApprovalQueuePanel(): React.JSX.Element | null {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['approval-queue'],
    queryFn: () => fetchApprovals('pending'),
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });

  const requests = data?.requests ?? [];
  // 대기 건이 없으면 패널 자체를 숨김 (수의사 화면을 어지럽히지 않음)
  if (!isLoading && requests.length === 0) return null;

  return (
    <div className="ct-card ct-fade-up" style={{ borderRadius: 14, padding: '16px 16px 14px' }} role="region" aria-label="승인 대기 요청">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <TitleAccentBar color="#fbbf24" />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ct-text)', letterSpacing: '-0.2px' }}>
          승인 대기 요청
        </span>
        {requests.length > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 800, color: '#fbbf24',
            background: 'rgba(251,191,36,0.14)', padding: '2px 8px', borderRadius: 8,
          }}>
            {requests.length}건
          </span>
        )}
        <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
          승인 시 즉시 실행 · 전 과정 감사 기록
        </span>
        <Link
          to="/approvals"
          style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--ct-primary)', textDecoration: 'none' }}
        >
          전체 이력 →
        </Link>
      </div>

      {isLoading && <div className="ct-shimmer" style={{ height: 52, borderRadius: 12 }} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {requests.map((req) => (
          <ApprovalRow
            key={req.approvalId}
            req={req}
            onDone={() => { void queryClient.invalidateQueries({ queryKey: ['approval-queue'] }); }}
          />
        ))}
      </div>
    </div>
  );
}
