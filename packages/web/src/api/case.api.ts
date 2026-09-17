// 관리 케이스 API — 감지→배정→현장확인→조치→재확인→종료

import { apiGet, apiPost } from './client';
import type {
  AddCaseEventInput,
  AssignCaseInput,
  CaseDetail,
  CaseFlag,
  CaseListItem,
  CaseRecord,
  CaseStatus,
  CaseSummary,
  CloseCaseInput,
  CreateCaseInput,
} from '@cowtalk/shared';

export interface CaseSummaryResponse extends CaseSummary {
  readonly flagCounts: Readonly<Record<CaseFlag, number>>;
}

export interface CaseListQuery {
  readonly farmId?: string;
  readonly animalId?: string;
  readonly status?: CaseStatus;
  readonly openOnly?: boolean;
  readonly flag?: CaseFlag;
  readonly limit?: number;
}

export function fetchCases(query: CaseListQuery = {}): Promise<readonly CaseListItem[]> {
  const params: Record<string, string> = {};
  if (query.farmId) params.farmId = query.farmId;
  if (query.animalId) params.animalId = query.animalId;
  if (query.status) params.status = query.status;
  if (query.openOnly) params.openOnly = 'true';
  if (query.flag) params.flag = query.flag;
  if (query.limit) params.limit = String(query.limit);
  return apiGet<readonly CaseListItem[]>('/cases', params);
}

export function fetchCaseSummary(farmId?: string): Promise<CaseSummaryResponse> {
  return apiGet<CaseSummaryResponse>('/cases/summary', farmId ? { farmId } : {});
}

export function fetchCaseDetail(caseId: string): Promise<CaseDetail> {
  return apiGet<CaseDetail>(`/cases/${caseId}`);
}

export function createCase(input: CreateCaseInput): Promise<CaseRecord> {
  return apiPost<CaseRecord>('/cases', input);
}

export function assignCase(caseId: string, input: AssignCaseInput): Promise<CaseRecord> {
  return apiPost<CaseRecord>(`/cases/${caseId}/assign`, input);
}

export function addCaseEvent(caseId: string, input: AddCaseEventInput): Promise<CaseRecord> {
  return apiPost<CaseRecord>(`/cases/${caseId}/events`, input);
}

export function closeCase(caseId: string, input: CloseCaseInput): Promise<CaseRecord> {
  return apiPost<CaseRecord>(`/cases/${caseId}/close`, input);
}
