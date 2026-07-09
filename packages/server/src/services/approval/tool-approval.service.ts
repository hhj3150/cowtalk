// 도구 승인 서비스 — AIP 거버넌스의 실행부
//
// 흐름: farmer가 고위험 도구 요청 → 게이트웨이가 여기로 영속화(pending) + 농장 푸시 알림
//       → 수의사가 승인 → '승인자 컨텍스트'로 기존 게이트웨이를 다시 통과해 실행
//       (수의사 역할은 즉시 실행 권한이 있으므로 정상 실행 + 감사 로그 기록)
// 거절 시 사유와 함께 종결. 모든 상태 전이는 pending에서만 허용.

import { getDb } from '../../config/database.js';
import { toolApprovalRequests, farms, users } from '../../db/schema.js';
import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import { sendPushToFarm } from '../../realtime/push-service.js';
import { logger } from '../../lib/logger.js';

const TOOL_LABELS: Readonly<Record<string, string>> = {
  schedule_sync_protocol: '발정 동기화 프로토콜 처방',
};

export function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName;
}

// ===========================
// 생성 (게이트웨이에서 호출)
// ===========================

export async function createApprovalRequest(params: {
  readonly toolName: string;
  readonly toolInput: Record<string, unknown>;
  readonly requestedBy?: string;
  readonly requestedRole: string;
  readonly farmId?: string;
}): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(toolApprovalRequests)
    .values({
      toolName: params.toolName,
      toolInput: params.toolInput,
      requestedBy: params.requestedBy ?? null,
      requestedRole: params.requestedRole,
      farmId: params.farmId ?? null,
    })
    .returning({ approvalId: toolApprovalRequests.approvalId });
  const approvalId = row!.approvalId;

  // 담당자에게 알림 (푸시 실패가 요청 생성을 막지 않음)
  if (params.farmId) {
    sendPushToFarm(params.farmId, {
      title: '✋ 승인 요청',
      body: `${toolLabel(params.toolName)} 실행 승인이 필요합니다.`,
      severity: 'medium',
      farmId: params.farmId,
      url: '/dashboard',
    }).catch((err) => logger.warn({ err, approvalId }, '[Approval] 알림 푸시 실패'));
  }

  logger.info({ approvalId, toolName: params.toolName, role: params.requestedRole }, '[Approval] 승인 요청 생성');
  return approvalId;
}

// ===========================
// 조회
// ===========================

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
}

export async function listApprovalRequests(params: {
  readonly status?: string;
  readonly farmIdsScope?: readonly string[] | null; // null = 전체 (광역 역할)
  readonly limit?: number;
}): Promise<readonly ApprovalRequestView[]> {
  const db = getDb();
  const conds = [];
  if (params.status) conds.push(eq(toolApprovalRequests.status, params.status));
  if (params.farmIdsScope && params.farmIdsScope.length > 0) {
    conds.push(inArray(toolApprovalRequests.farmId, [...params.farmIdsScope]));
  }
  const rows = await db
    .select({
      approvalId: toolApprovalRequests.approvalId,
      toolName: toolApprovalRequests.toolName,
      toolInput: toolApprovalRequests.toolInput,
      requestedRole: toolApprovalRequests.requestedRole,
      requesterName: users.name,
      farmId: toolApprovalRequests.farmId,
      farmName: farms.name,
      status: toolApprovalRequests.status,
      createdAt: toolApprovalRequests.createdAt,
    })
    .from(toolApprovalRequests)
    .leftJoin(users, eq(toolApprovalRequests.requestedBy, users.userId))
    .leftJoin(farms, eq(toolApprovalRequests.farmId, farms.farmId))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(toolApprovalRequests.createdAt))
    .limit(Math.min(params.limit ?? 30, 100));

  return rows.map((r) => ({
    approvalId: r.approvalId,
    toolName: r.toolName,
    toolLabel: toolLabel(r.toolName),
    toolInput: (r.toolInput ?? {}) as Record<string, unknown>,
    requestedRole: r.requestedRole,
    requesterName: r.requesterName,
    farmId: r.farmId,
    farmName: r.farmName,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ===========================
// 결정 (승인 → 실행 / 거절)
// ===========================

export interface DecisionResult {
  readonly success: boolean;
  readonly status?: string;
  readonly executionResult?: unknown;
  readonly error?: string;
}

export async function approveAndExecute(params: {
  readonly approvalId: string;
  readonly approverId: string;
  readonly approverRole: string;
  readonly decisionNote?: string;
}): Promise<DecisionResult> {
  const db = getDb();

  // pending → approved 원자적 선점 (동시 승인 방지)
  const claimed = await db
    .update(toolApprovalRequests)
    .set({
      status: 'approved',
      approverId: params.approverId,
      decisionNote: params.decisionNote ?? null,
      decidedAt: new Date(),
    })
    .where(and(
      eq(toolApprovalRequests.approvalId, params.approvalId),
      eq(toolApprovalRequests.status, 'pending'),
    ))
    .returning({
      toolName: toolApprovalRequests.toolName,
      toolInput: toolApprovalRequests.toolInput,
      farmId: toolApprovalRequests.farmId,
    });
  const req = claimed[0];
  if (!req) {
    return { success: false, error: '대기 중인 요청이 아닙니다 (이미 처리되었거나 존재하지 않음)' };
  }

  // 승인자 컨텍스트로 기존 게이트웨이 재통과 — 감사 로그·타임아웃·RBAC 그대로 적용
  const { executeToolWithGateway } = await import('../../ai-brain/tools/tool-gateway.js');
  const result = await executeToolWithGateway(
    req.toolName,
    (req.toolInput ?? {}) as Record<string, unknown>,
    {
      userId: params.approverId,
      role: params.approverRole,
      farmId: req.farmId ?? undefined,
    },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.result);
  } catch {
    parsed = result.result;
  }
  await db
    .update(toolApprovalRequests)
    .set({ executionResult: { success: result.success, result: parsed } })
    .where(eq(toolApprovalRequests.approvalId, params.approvalId));

  logger.info(
    { approvalId: params.approvalId, toolName: req.toolName, executed: result.success },
    '[Approval] 승인 및 실행 완료',
  );
  return { success: result.success, status: 'approved', executionResult: parsed };
}

export async function rejectApproval(params: {
  readonly approvalId: string;
  readonly approverId: string;
  readonly decisionNote?: string;
}): Promise<DecisionResult> {
  const db = getDb();
  const rows = await db
    .update(toolApprovalRequests)
    .set({
      status: 'rejected',
      approverId: params.approverId,
      decisionNote: params.decisionNote ?? null,
      decidedAt: new Date(),
    })
    .where(and(
      eq(toolApprovalRequests.approvalId, params.approvalId),
      eq(toolApprovalRequests.status, 'pending'),
    ))
    .returning({ approvalId: toolApprovalRequests.approvalId });
  if (rows.length === 0) {
    return { success: false, error: '대기 중인 요청이 아닙니다 (이미 처리되었거나 존재하지 않음)' };
  }
  logger.info({ approvalId: params.approvalId }, '[Approval] 거절');
  return { success: true, status: 'rejected' };
}

/** 대기 건수 (뱃지용) */
export async function countPendingApprovals(farmIdsScope?: readonly string[] | null): Promise<number> {
  const db = getDb();
  const conds = [eq(toolApprovalRequests.status, 'pending')];
  if (farmIdsScope && farmIdsScope.length > 0) {
    conds.push(inArray(toolApprovalRequests.farmId, [...farmIdsScope]));
  }
  const [row] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(toolApprovalRequests)
    .where(and(...conds));
  return Number(row?.cnt ?? 0);
}
