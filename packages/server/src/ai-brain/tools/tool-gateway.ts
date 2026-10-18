// MCP Tool Gateway — 모든 AI 도구 호출의 중앙 관문
// 역할: audit logging + role-based access control + domain classification
// 지시서 원칙: "LLM 직접 DB 접근 금지, 반드시 정의된 tool만 호출"

import { getDb } from '../../config/database.js';
import {
  requiresWriteConfirmation,
  classifyConfirmationUtterance,
  buildProposalSummary,
  stripConfirmationMeta,
} from '../../services/approval/write-confirmation.js';
import {
  createWriteProposal,
  claimWriteProposal,
  finishWriteProposal,
  cancelWriteProposal,
  describeAnimal,
} from '../../services/approval/write-confirmation.service.js';
import { toolAuditLog } from '../../db/schema.js';
import { executeTool } from './tool-executor.js';
import { logger } from '../../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { Role } from '@cowtalk/shared';
import { resolveAllowedFarms, findScopeViolations, describeViolations, intersectRequestedFarms } from './tool-scope.js';

// ===========================
// 도구 → 도메인 매핑
// ===========================

export const TOOL_DOMAIN_MAP: Readonly<Record<string, string>> = {
  query_animal: 'sensor',
  query_animal_events: 'sensor',
  query_animal_graph: 'sensor',
  record_milk_yield: 'farm',
  query_farm_summary: 'farm',
  query_breeding_stats: 'repro',
  query_sensor_data: 'sensor',
  query_conception_stats: 'repro',
  query_traceability: 'public_data',
  query_grade: 'public_data',
  query_auction_prices: 'public_data',
  query_sire_info: 'genetics',
  query_weather: 'sensor',
  query_quarantine_dashboard: 'public_data',
  query_national_situation: 'public_data',
  record_insemination: 'repro',
  record_pregnancy_check: 'repro',
  recommend_insemination_window: 'repro',
  schedule_sync_protocol: 'repro',
  query_sync_today: 'repro',
  record_treatment: 'farm',
  get_farm_kpis: 'farm',
  query_differential_diagnosis: 'health',
  confirm_treatment_outcome: 'health',
  record_expert_label: 'health',
};

// ===========================
// 역할별 tool 접근 권한
// ===========================

export const ROLE_TOOL_ACCESS: Readonly<Record<string, readonly string[]>> = {
  farmer: [
    'query_animal', 'query_animal_events', 'query_animal_graph', 'query_farm_summary',
    'record_milk_yield',
    'query_breeding_stats', 'query_sensor_data', 'query_traceability',
    'query_conception_stats', 'recommend_insemination_window', 'get_farm_kpis',
    'record_treatment', 'record_insemination', 'record_pregnancy_check',
    'query_grade', 'query_auction_prices', 'query_weather', 'query_sire_info',
    'query_differential_diagnosis', 'confirm_treatment_outcome',
    'schedule_sync_protocol', 'query_sync_today',
  ],
  veterinarian: [
    'query_animal', 'query_animal_events', 'query_animal_graph', 'query_farm_summary',
    'record_milk_yield',
    'query_breeding_stats', 'query_sensor_data', 'query_traceability',
    'query_conception_stats', 'record_treatment', 'get_farm_kpis',
    'recommend_insemination_window', 'record_insemination', 'record_pregnancy_check',
    'query_grade', 'query_weather', 'query_sire_info',
    'query_differential_diagnosis', 'confirm_treatment_outcome',
    'schedule_sync_protocol', 'query_sync_today',
    'record_expert_label',
  ],
  government_admin: [
    'query_animal', 'query_animal_graph', 'query_farm_summary', 'query_breeding_stats',
    'query_traceability', 'get_farm_kpis',
    'query_grade', 'query_auction_prices',
    'query_quarantine_dashboard', 'query_national_situation',
  ],
  quarantine_officer: [
    'query_animal', 'query_animal_events', 'query_animal_graph', 'query_farm_summary',
    'query_sensor_data', 'query_traceability', 'get_farm_kpis',
    'query_weather',
    'query_quarantine_dashboard', 'query_national_situation',
    'record_expert_label',
  ],
};

// ===========================
// 승인 필요 액션 목록 — 역할 의존
// ===========================

// 도구 → '승인이 필요한 요청자 역할' 집합.
// 예: 호르몬 동기화 처방(schedule_sync_protocol)은 수의학적 판단이므로
//     farmer가 요청하면 수의사 승인 후 실행, 수의사 본인은 즉시 실행.
export const APPROVAL_REQUIRED_BY_ROLE: Readonly<Record<string, readonly string[]>> = {
  schedule_sync_protocol: ['farmer'],
};

/** 이 도구 호출이 해당 역할에서 승인을 요구하는가 (순수 — 테스트 대상) */
export function needsApproval(toolName: string, role: string): boolean {
  const roles = APPROVAL_REQUIRED_BY_ROLE[toolName];
  return Boolean(roles && roles.includes(role));
}

// ===========================
// Gateway 호출 컨텍스트
// ===========================

export interface ToolCallContext {
  readonly userId?: string;
  readonly role: Role | string;
  readonly farmId?: string;
  readonly farmIds?: readonly string[]; // 지역(그룹) 스코프 — 집계 도구 데이터 레벨 한정
  readonly requestId?: string; // 동일 대화의 여러 tool 호출 그룹핑
  /**
   * JWT에 담긴 배정 농장 — **권한의 유일한 근거**.
   * 위의 farmId/farmIds는 클라이언트가 보낸 "요청"이라 권한 판단에 쓰면 안 된다.
   * 미지정이면 스코프 검사를 건너뛰므로, 호출부는 반드시 채워야 한다.
   */
  readonly assignedFarmIds?: readonly string[];
  readonly isMaster?: boolean;
  /**
   * 채팅 턴 정보 — 기록 도구의 사용자 확인에 쓴다.
   * turnId는 사용자 발화 하나(채팅 요청 하나)마다 새로 발급된다. 제안과 확인이 같은 턴이면 거부한다.
   */
  readonly confirmationTurn?: { readonly turnId: string; readonly userUtterance: string };
  /**
   * 사람의 결정을 이미 거친 실행 경로 — 'approval'(수의사·행정관 승인), 'automation'(사람이 만든 룰).
   * 이 표시가 없는 경로에서 기록 도구는 반드시 사용자 확인을 거친다 (기본 닫힘).
   */
  readonly trustedExecutor?: 'approval' | 'automation';
}

export interface ToolCallResult {
  readonly success: boolean;
  readonly result: string;
  readonly toolName: string;
  readonly domain: string;
  readonly executionMs: number;
  readonly denied: boolean;
  readonly approvalRequired: boolean;
}

// ===========================
// 메인: executeToolWithGateway
// ===========================

export async function executeToolWithGateway(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolCallContext,
): Promise<ToolCallResult> {
  const requestId = context.requestId ?? uuidv4();
  const domain = TOOL_DOMAIN_MAP[toolName] ?? 'unknown';
  const startTime = Date.now();

  // 1. 역할 기반 접근 제어
  const allowedTools = ROLE_TOOL_ACCESS[context.role];
  if (allowedTools && !allowedTools.includes(toolName)) {
    const result = JSON.stringify({ error: `역할 '${context.role}'은 '${toolName}' 도구에 접근할 수 없습니다.` });
    await writeAuditLog({
      requestId,
      userId: context.userId,
      role: context.role,
      farmId: context.farmId,
      toolName,
      domain,
      inputSummary: truncateJson(input),
      resultStatus: 'denied',
      resultSummary: result,
      executionMs: Date.now() - startTime,
      approvalRequired: false,
    });

    logger.warn({ toolName, role: context.role }, '[ToolGateway] 접근 거부');
    return { success: false, result, toolName, domain, executionMs: 0, denied: true, approvalRequired: false };
  }

  // 1.5 데이터 스코프 검증 — AI가 접근 제어의 뒷문이 되지 않게 한다.
  //     HTTP 라우트(#148/#149)는 미들웨어로 막았지만 도구는 DB를 직접 읽으므로
  //     같은 규칙을 여기서 한 번 더 강제해야 한다. 권한 근거는 JWT(assignedFarmIds)뿐이다.
  const allowedFarms = resolveAllowedFarms({
    role: String(context.role),
    assignedFarmIds: context.assignedFarmIds,
    isMaster: context.isMaster,
  });

  const violations = await findScopeViolations(input, allowedFarms);
  if (violations.length > 0) {
    const result = JSON.stringify({ error: describeViolations(violations) });
    await writeAuditLog({
      requestId,
      userId: context.userId,
      role: context.role,
      farmId: context.farmId,
      toolName,
      domain,
      inputSummary: truncateJson(input),
      resultStatus: 'denied',
      resultSummary: result,
      executionMs: Date.now() - startTime,
      approvalRequired: false,
    });
    logger.warn(
      { toolName, role: context.role, userId: context.userId, violations },
      '[ToolGateway] 스코프 위반 거부 — 배정되지 않은 목장 데이터 요청',
    );
    return { success: false, result, toolName, domain, executionMs: Date.now() - startTime, denied: true, approvalRequired: false };
  }

  // 2. 승인 필요 확인 (역할 의존) — 요청을 영속화하고 실행은 승인 시점으로 미룬다
  const approvalRequired = needsApproval(toolName, String(context.role));
  if (approvalRequired) {
    let approvalId: string | null = null;
    try {
      const { createApprovalRequest } = await import('../../services/approval/tool-approval.service.js');
      approvalId = await createApprovalRequest({
        toolName,
        toolInput: input,
        requestedBy: context.userId,
        requestedRole: String(context.role),
        farmId: context.farmId,
      });
    } catch (err) {
      logger.error({ err, toolName }, '[ToolGateway] 승인 요청 영속화 실패');
    }
    const result = JSON.stringify({
      approvalRequired: true,
      approvalId,
      message: `'${toolName}'은(는) 수의사 승인 후 실행됩니다. 승인 요청이 접수되었습니다${approvalId ? ` (요청 ID: ${approvalId.slice(0, 8)})` : ''}. 담당 수의사가 대시보드에서 검토합니다.`,
      proposedAction: { toolName, input },
    });

    await writeAuditLog({
      requestId,
      userId: context.userId,
      role: context.role,
      farmId: context.farmId,
      toolName,
      domain,
      inputSummary: truncateJson(input),
      resultStatus: 'pending_approval',
      resultSummary: result,
      executionMs: Date.now() - startTime,
      approvalRequired: true,
    });

    logger.info({ toolName, role: context.role }, '[ToolGateway] 승인 대기');
    return { success: true, result, toolName, domain, executionMs: 0, denied: false, approvalRequired: true };
  }

  // 2.5 기록 도구 사용자 확인 — AI가 진료·번식 기록을 확인 없이 저장하지 못하게 한다.
  //     1차 호출은 제안만 남기고, 사용자의 다음 발화가 명시적 승인일 때 2차 호출로 실행한다.
  //     실행은 제안 당시 저장된 입력으로 한다 — 확인 직전에 개체·용량이 바뀌지 않게.
  let execInput: Record<string, unknown> = input;
  let confirmationInUse: string | null = null;
  if (requiresWriteConfirmation(toolName) && !context.trustedExecutor) {
    const gate = await runWriteConfirmationGate(toolName, input, context, allowedFarms);
    if (gate.kind === 'respond') {
      await writeAuditLog({
        requestId,
        userId: context.userId,
        role: context.role,
        farmId: context.farmId,
        toolName,
        domain,
        inputSummary: truncateJson(input),
        resultStatus: gate.auditStatus,
        resultSummary: gate.result,
        executionMs: Date.now() - startTime,
        approvalRequired: false,
      });
      return {
        success: gate.auditStatus === 'pending_confirmation',
        result: gate.result,
        toolName,
        domain,
        executionMs: Date.now() - startTime,
        denied: gate.auditStatus === 'denied',
        approvalRequired: false,
      };
    }
    execInput = gate.input;
    confirmationInUse = gate.confirmationId;
  }

  // 실효 농장 — 권한과 요청의 교집합. 요청이 스코프 밖이면 배정 농장으로 되돌린다.
  const requestedFarms = context.farmIds ?? (context.farmId ? [context.farmId] : []);
  const effectiveFarmList = intersectRequestedFarms(requestedFarms, allowedFarms);
  const effectiveFarmIds = effectiveFarmList.length > 0 ? effectiveFarmList : undefined;
  const effectiveFarmId =
    context.farmId && (allowedFarms === null || allowedFarms.includes(context.farmId))
      ? context.farmId
      : effectiveFarmList.length === 1 ? effectiveFarmList[0] : undefined;

  // 3. 도구 실행 (30초 타임아웃)
  // 외부 API(data.go.kr/EKAPE/smaXtec) 행 방지 — 시연 중 90초 SSE 타임아웃까지 대기 회피
  let resultStatus = 'success';
  let resultText: string;
  const TOOL_TIMEOUT_MS = 30_000;

  try {
    resultText = await Promise.race([
      executeTool(toolName, execInput, {
        userId: context.userId,
        role: String(context.role),
        // 클라이언트가 보낸 농장 요청을 권한과 합성한다 — 스코프 밖은 조용히 확대하지 않는다
        farmId: effectiveFarmId,
        farmIds: effectiveFarmIds,
        // 식별자(earTag/traceId)처럼 미리 농장을 알 수 없는 조회는 실행부가 이 값으로 필터링한다
        allowedFarmIds: allowedFarms,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`도구 '${toolName}' 실행 타임아웃 (${TOOL_TIMEOUT_MS / 1000}초 초과)`)),
          TOOL_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (error) {
    resultStatus = 'error';
    resultText = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
  }

  const executionMs = Date.now() - startTime;

  if (confirmationInUse) {
    await finishWriteProposal(
      confirmationInUse,
      resultStatus === 'success' && !resultText.includes('"error"') ? 'executed' : 'failed',
      { resultSummary: resultText.slice(0, 2000) },
    ).catch((err: unknown) => logger.error({ err, confirmationInUse }, '[ToolGateway] 확인 기록 결과 저장 실패'));
  }

  // 4. 감사 로그 기록
  await writeAuditLog({
    requestId,
    userId: context.userId,
    role: context.role,
    farmId: context.farmId,
    toolName,
    domain,
    inputSummary: truncateJson(execInput),
    resultStatus,
    resultSummary: resultText.slice(0, 4000),
    executionMs,
    approvalRequired: false,
  });

  logger.info({
    toolName, domain, role: context.role, executionMs, resultStatus,
  }, '[ToolGateway] 도구 실행 완료');

  return {
    success: resultStatus === 'success',
    result: resultText,
    toolName,
    domain,
    executionMs,
    denied: false,
    approvalRequired: false,
  };
}

// ===========================
// 감사 로그 기록
// ===========================

interface AuditLogEntry {
  readonly requestId: string;
  readonly userId?: string;
  readonly role: string;
  readonly farmId?: string;
  readonly toolName: string;
  readonly domain: string;
  readonly inputSummary: string;
  readonly resultStatus: string;
  readonly resultSummary: string;
  readonly executionMs: number;
  readonly approvalRequired: boolean;
}

async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const db = getDb();
    await db.insert(toolAuditLog).values({
      requestId: entry.requestId,
      userId: entry.userId ?? null,
      role: entry.role,
      farmId: entry.farmId ?? null,
      toolName: entry.toolName,
      toolDomain: entry.domain,
      inputSummary: entry.inputSummary,
      resultStatus: entry.resultStatus,
      resultSummary: entry.resultSummary,
      executionMs: entry.executionMs,
      approvalRequired: entry.approvalRequired,
    });
  } catch (error) {
    // 감사 로그 실패가 도구 실행을 막으면 안 됨
    logger.error({ error, toolName: entry.toolName }, '[ToolGateway] 감사 로그 기록 실패');
  }
}

// ===========================
// 유틸
// ===========================

function truncateJson(obj: unknown): string {
  const json = JSON.stringify(obj);
  return json.length > 1000 ? `${json.slice(0, 1000)}...` : json;
}

// ===========================
// 기록 도구 사용자 확인 게이트
// ===========================

type ConfirmationGateResult =
  | { readonly kind: 'respond'; readonly result: string; readonly auditStatus: 'pending_confirmation' | 'denied' | 'cancelled' | 'awaiting_user' }
  | { readonly kind: 'execute'; readonly input: Record<string, unknown>; readonly confirmationId: string };

async function runWriteConfirmationGate(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolCallContext,
  allowedFarms: ReturnType<typeof resolveAllowedFarms>,
): Promise<ConfirmationGateResult> {
  const turn = context.confirmationTurn;
  if (!turn) {
    // 확인 절차를 밟을 수 없는 경로 — 기본 닫힘
    return {
      kind: 'respond',
      auditStatus: 'denied',
      result: JSON.stringify({ error: `'${toolName}'은(는) 사용자 확인이 필요한 기록입니다. 이 경로에서는 실행할 수 없습니다.` }),
    };
  }

  const confirmationId = typeof input.confirmationId === 'string' ? input.confirmationId : null;

  // 1차 호출 — 제안만 남긴다
  if (!confirmationId) {
    const toolInput = stripConfirmationMeta(input);
    const animalLabel = await describeAnimal(toolInput.animalId).catch(() => undefined);
    const summary = buildProposalSummary(toolName, toolInput, { animalLabel });
    const id = await createWriteProposal({
      toolName,
      toolInput,
      userId: context.userId,
      role: String(context.role),
      farmId: typeof toolInput.farmId === 'string' ? toolInput.farmId : context.farmId,
      turnId: turn.turnId,
      summary,
    });
    return {
      kind: 'respond',
      auditStatus: 'pending_confirmation',
      result: JSON.stringify({
        confirmationRequired: true,
        confirmationId: id,
        summary,
        instruction:
          '아직 저장하지 않았습니다. 위 요약(특히 개체 번호·목장·약품·용량)을 사용자에게 그대로 보여주고 저장할지 물어보세요. ' +
          '사용자가 다음 발화에서 명시적으로 승인하면 같은 도구를 confirmationId와 함께 다시 호출하세요. ' +
          '내용을 고치라고 하면 고친 입력으로 새로 호출하세요(새 제안). 이번 턴에 confirmationId로 다시 호출하지 마세요.',
      }),
    };
  }

  // 2차 호출 — 사용자의 이번 발화가 승인인가
  const intent = classifyConfirmationUtterance(turn.userUtterance);
  if (intent === 'deny') {
    await cancelWriteProposal(confirmationId, context.userId);
    return {
      kind: 'respond',
      auditStatus: 'cancelled',
      result: JSON.stringify({ cancelled: true, message: '사용자가 저장을 취소했습니다. 저장하지 않았습니다.' }),
    };
  }
  if (intent !== 'affirm') {
    return {
      kind: 'respond',
      auditStatus: 'awaiting_user',
      result: JSON.stringify({
        error: '사용자의 명시적인 저장 승인이 확인되지 않아 저장하지 않았습니다. 요약을 다시 보여주고 "저장할까요?"라고 물어보세요.',
      }),
    };
  }

  const claim = await claimWriteProposal({ confirmationId, userId: context.userId, turnId: turn.turnId });
  if (!claim.ok) {
    return { kind: 'respond', auditStatus: 'denied', result: JSON.stringify({ error: claim.message }) };
  }
  if (claim.toolName !== toolName) {
    await finishWriteProposal(confirmationId, 'failed', { error: 'tool mismatch' });
    return { kind: 'respond', auditStatus: 'denied', result: JSON.stringify({ error: '확인한 기록과 다른 도구입니다. 저장하지 않았습니다.' }) };
  }
  // 제안 이후 권한이 바뀌었을 수 있다 — 저장된 입력으로 스코프를 다시 검사
  const violations = await findScopeViolations(claim.toolInput, allowedFarms);
  if (violations.length > 0) {
    await finishWriteProposal(confirmationId, 'failed', { error: 'scope' });
    return { kind: 'respond', auditStatus: 'denied', result: JSON.stringify({ error: describeViolations(violations) }) };
  }
  return { kind: 'execute', input: claim.toolInput, confirmationId };
}
