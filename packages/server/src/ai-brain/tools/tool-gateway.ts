// MCP Tool Gateway — 모든 AI 도구 호출의 중앙 관문
// 역할: audit logging + role-based access control + domain classification
// 지시서 원칙: "LLM 직접 DB 접근 금지, 반드시 정의된 tool만 호출"

import { getDb } from '../../config/database.js';
import { toolAuditLog } from '../../db/schema.js';
import { executeTool } from './tool-executor.js';
import { logger } from '../../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { Role } from '@cowtalk/shared';

// ===========================
// 도구 → 도메인 매핑
// ===========================

export const TOOL_DOMAIN_MAP: Readonly<Record<string, string>> = {
  query_animal: 'sensor',
  query_animal_events: 'sensor',
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
  record_treatment: 'farm',
  get_farm_kpis: 'farm',
  generate_report: 'report',
  send_alert: 'action',
  submit_admin_notice: 'action',
};

// ===========================
// 역할별 tool 접근 권한
// ===========================

export const ROLE_TOOL_ACCESS: Readonly<Record<string, readonly string[]>> = {
  farmer: [
    'query_animal', 'query_animal_events', 'query_farm_summary',
    'query_breeding_stats', 'query_sensor_data', 'query_traceability',
    'query_conception_stats', 'recommend_insemination_window', 'get_farm_kpis',
    'record_treatment', 'record_insemination', 'record_pregnancy_check',
    'query_grade', 'query_auction_prices', 'query_weather', 'query_sire_info',
  ],
  veterinarian: [
    'query_animal', 'query_animal_events', 'query_farm_summary',
    'query_breeding_stats', 'query_sensor_data', 'query_traceability',
    'query_conception_stats', 'record_treatment', 'get_farm_kpis',
    'recommend_insemination_window', 'record_insemination', 'record_pregnancy_check',
    'query_grade', 'query_weather', 'query_sire_info',
  ],
  government_admin: [
    'query_animal', 'query_farm_summary', 'query_breeding_stats',
    'query_traceability', 'get_farm_kpis', 'generate_report',
    'query_grade', 'query_auction_prices',
    'query_quarantine_dashboard', 'query_national_situation',
  ],
  quarantine_officer: [
    'query_animal', 'query_animal_events', 'query_farm_summary',
    'query_sensor_data', 'query_traceability', 'get_farm_kpis',
    'generate_report', 'send_alert', 'query_weather',
    'query_quarantine_dashboard', 'query_national_situation',
  ],
};

// ===========================
// 승인 필요 액션 목록
// ===========================

const APPROVAL_REQUIRED_TOOLS: ReadonlySet<string> = new Set([
  'submit_admin_notice',
  'send_alert',
  'generate_report', // 공식 보고서만 — 향후 세분화
]);

// ===========================
// Gateway 호출 컨텍스트
// ===========================

export interface ToolCallContext {
  readonly userId?: string;
  readonly role: Role | string;
  readonly farmId?: string;
  readonly requestId?: string; // 동일 대화의 여러 tool 호출 그룹핑
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

  // 2. 승인 필요 확인
  const approvalRequired = APPROVAL_REQUIRED_TOOLS.has(toolName);
  if (approvalRequired) {
    const result = JSON.stringify({
      approvalRequired: true,
      message: `'${toolName}' 실행에는 사용자 승인이 필요합니다.`,
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

  // 3. 도구 실행
  let resultStatus = 'success';
  let resultText: string;

  try {
    resultText = await executeTool(toolName, input);
  } catch (error) {
    resultStatus = 'error';
    resultText = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
  }

  const executionMs = Date.now() - startTime;

  // 4. 감사 로그 기록
  await writeAuditLog({
    requestId,
    userId: context.userId,
    role: context.role,
    farmId: context.farmId,
    toolName,
    domain,
    inputSummary: truncateJson(input),
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
