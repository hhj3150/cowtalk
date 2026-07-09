// 도구 승인 API — 수의사·행정관 승인 큐

import { apiGet, apiPost } from './client';

export interface ApprovalRequestView {
  readonly approvalId: string;
  readonly toolName: string;
  readonly toolLabel: string;
  readonly toolInput: Record<string, unknown>;
  readonly requestedRole: string;
  readonly requesterName: string | null;
  readonly farmId: string | null;
  readonly farmName: string | null;
  readonly status: string;
  readonly createdAt: string;
  // 이력 뷰 — 결정 정보 (pending이면 null)
  readonly approverName: string | null;
  readonly decisionNote: string | null;
  readonly decidedAt: string | null;
  readonly executionResult: unknown;
}

export function fetchApprovals(status = 'pending'): Promise<{ requests: readonly ApprovalRequestView[] }> {
  return apiGet<{ requests: readonly ApprovalRequestView[] }>('/approvals', { status });
}

export function approveRequest(approvalId: string, note?: string): Promise<{ success: boolean; status?: string }> {
  return apiPost<{ success: boolean; status?: string }>(`/approvals/${approvalId}/approve`, note ? { note } : {});
}

export function rejectRequest(approvalId: string, note?: string): Promise<{ success: boolean; status?: string }> {
  return apiPost<{ success: boolean; status?: string }>(`/approvals/${approvalId}/reject`, note ? { note } : {});
}
