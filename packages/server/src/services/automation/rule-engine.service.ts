// 자동화 룰 엔진 — "알람 → 행동" 자동 연결 (P3 AIP Automate)
//
// 스윕 방식: 주기 실행마다 최근 알림/smaXtec 이벤트를 활성 룰과 매칭해 도구를 실행한다.
// - 멱등: automation_rule_runs (rule+source 유니크)로 같은 이벤트를 두 번 처리하지 않음
// - 쿨다운: 같은 룰+개체는 cooldownHours 내 재실행 금지
// - 승인 게이트 준수: 도구 실행은 반드시 executeToolWithGateway 경유 —
//   고위험 도구(예: 농장주의 schedule_sync_protocol)는 자동으로 승인 대기로 빠진다.
//   자동화가 사람의 승인 체계를 우회하는 경로는 없다.

import { getDb } from '../../config/database.js';
import {
  alerts,
  animals,
  automationRules,
  automationRuleRuns,
  smaxtecEvents,
} from '../../db/schema.js';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import type { AutomationTrigger, AutomationAction, AutomationRunStatus } from '@cowtalk/shared';
import { executeToolWithGateway } from '../../ai-brain/tools/tool-gateway.js';
import { logger } from '../../lib/logger.js';

const MS_PER_HOUR = 3_600_000;
/** 스윕 조회 범위 — 스윕 주기(10분)보다 넉넉하게 잡아 재시작 공백을 흡수 */
const DEFAULT_LOOKBACK_MINUTES = 90;
/** 한 스윕에서 룰당 최대 실행 수 — 폭주 방지 */
const MAX_EXECUTIONS_PER_RULE = 20;

/** 자동화에 허용된 도구 — 조회(결과 기록) 또는 승인 게이트가 있는 처방 도구만 */
export const AUTOMATABLE_TOOLS: readonly string[] = [
  'recommend_insemination_window',
  'query_differential_diagnosis',
  'query_weather',
  'schedule_sync_protocol', // farmer는 승인 게이트 경유
];

const PRIORITY_ORDER: Readonly<Record<string, number>> = { low: 0, medium: 1, high: 2, critical: 3 };

/** 트리거 매칭 대상 이벤트의 공통 표현 */
export interface TriggerCandidate {
  readonly source: 'alert' | 'smaxtec_event';
  readonly sourceId: string;
  readonly eventType: string;
  readonly farmId: string;
  readonly animalId: string | null;
  /** alert 소스만 */
  readonly priority?: string;
  /** smaxtec_event 소스만 (0~1) */
  readonly confidence?: number;
}

/** 룰 트리거 ↔ 이벤트 매칭 (순수 함수 — 테스트 대상) */
export function matchesTrigger(trigger: AutomationTrigger, candidate: TriggerCandidate): boolean {
  if (trigger.source !== candidate.source) return false;
  if (trigger.eventTypes.length > 0 && !trigger.eventTypes.includes(candidate.eventType)) return false;
  if (trigger.minPriority != null) {
    const min = PRIORITY_ORDER[trigger.minPriority] ?? 0;
    const actual = PRIORITY_ORDER[candidate.priority ?? ''] ?? -1;
    if (actual < min) return false;
  }
  if (trigger.minConfidence != null && (candidate.confidence ?? 0) < trigger.minConfidence) return false;
  return true;
}

/** 파라미터 템플릿 치환 — 문자열 값의 {{key}}를 컨텍스트로 대체 (순수 함수 — 테스트 대상) */
export function renderParams(
  params: Readonly<Record<string, string | number | boolean>>,
  context: Readonly<Record<string, string | number | null>>,
): Record<string, unknown> {
  const rendered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== 'string') {
      rendered[key] = value;
      continue;
    }
    rendered[key] = value.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => {
      const v = context[name];
      return v == null ? whole : String(v);
    });
  }
  return rendered;
}

/** 게이트웨이 결과 → 실행 상태 (순수 함수 — 테스트 대상) */
export function runStatusFromGateway(result: {
  readonly success: boolean;
  readonly denied: boolean;
  readonly approvalRequired: boolean;
}): AutomationRunStatus {
  if (result.approvalRequired) return 'pending_approval';
  if (result.denied) return 'denied';
  return result.success ? 'executed' : 'failed';
}

export interface SweepResult {
  readonly rulesEvaluated: number;
  readonly candidatesSeen: number;
  readonly executed: number;
  readonly pendingApproval: number;
  readonly failed: number;
  readonly skipped: number;
}

/** 최근 이벤트를 활성 룰과 매칭해 실행하는 스윕 — 스케줄러에서 주기 호출 */
export async function runAutomationRules(
  lookbackMinutes: number = DEFAULT_LOOKBACK_MINUTES,
): Promise<SweepResult> {
  const db = getDb();
  const since = new Date(Date.now() - lookbackMinutes * 60_000);

  const rules = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.enabled, true));
  if (rules.length === 0) {
    return { rulesEvaluated: 0, candidatesSeen: 0, executed: 0, pendingApproval: 0, failed: 0, skipped: 0 };
  }

  const needsAlerts = rules.some((r) => r.trigger.source === 'alert');
  const needsEvents = rules.some((r) => r.trigger.source === 'smaxtec_event');

  const candidates: TriggerCandidate[] = [];
  if (needsAlerts) {
    const rows = await db
      .select({
        alertId: alerts.alertId,
        alertType: alerts.alertType,
        priority: alerts.priority,
        farmId: alerts.farmId,
        animalId: alerts.animalId,
      })
      .from(alerts)
      .where(gte(alerts.createdAt, since))
      .orderBy(desc(alerts.createdAt))
      .limit(500);
    candidates.push(...rows.map((r): TriggerCandidate => ({
      source: 'alert',
      sourceId: r.alertId,
      eventType: r.alertType,
      farmId: r.farmId,
      animalId: r.animalId,
      priority: r.priority,
    })));
  }
  if (needsEvents) {
    const rows = await db
      .select({
        eventId: smaxtecEvents.eventId,
        eventType: smaxtecEvents.eventType,
        confidence: smaxtecEvents.confidence,
        farmId: smaxtecEvents.farmId,
        animalId: smaxtecEvents.animalId,
      })
      .from(smaxtecEvents)
      .where(gte(smaxtecEvents.detectedAt, since))
      .orderBy(desc(smaxtecEvents.detectedAt))
      .limit(500);
    candidates.push(...rows.map((r): TriggerCandidate => ({
      source: 'smaxtec_event',
      sourceId: r.eventId,
      eventType: r.eventType,
      farmId: r.farmId,
      animalId: r.animalId,
      confidence: r.confidence,
    })));
  }

  let executed = 0;
  let pendingApproval = 0;
  let failed = 0;
  let skipped = 0;

  for (const rule of rules) {
    const matched = candidates.filter(
      (c) => matchesTrigger(rule.trigger, c) && (rule.farmId == null || rule.farmId === c.farmId),
    ).slice(0, MAX_EXECUTIONS_PER_RULE);
    if (matched.length === 0) continue;

    // 멱등: 이미 처리한 소스 제외
    const existing = await db
      .select({ sourceId: automationRuleRuns.sourceId })
      .from(automationRuleRuns)
      .where(and(
        eq(automationRuleRuns.ruleId, rule.ruleId),
        inArray(automationRuleRuns.sourceId, matched.map((m) => m.sourceId)),
      ));
    const processedIds = new Set(existing.map((e) => e.sourceId));

    // 쿨다운: 같은 룰+개체 최근 실행 조회
    const cooldownSince = new Date(Date.now() - rule.cooldownHours * MS_PER_HOUR);
    const recentRuns = await db
      .select({ animalId: automationRuleRuns.animalId })
      .from(automationRuleRuns)
      .where(and(
        eq(automationRuleRuns.ruleId, rule.ruleId),
        gte(automationRuleRuns.executedAt, cooldownSince),
      ));
    const cooledAnimals = new Set(recentRuns.map((r) => r.animalId).filter(Boolean));

    for (const candidate of matched) {
      if (processedIds.has(candidate.sourceId)) {
        skipped += 1;
        continue;
      }
      if (candidate.animalId && cooledAnimals.has(candidate.animalId)) {
        skipped += 1;
        continue;
      }

      const status = await executeRuleAction(rule, candidate);
      if (status === 'executed') executed += 1;
      else if (status === 'pending_approval') pendingApproval += 1;
      else if (status === 'failed' || status === 'denied') failed += 1;
      if (candidate.animalId) cooledAnimals.add(candidate.animalId);
    }
  }

  const result: SweepResult = {
    rulesEvaluated: rules.length,
    candidatesSeen: candidates.length,
    executed,
    pendingApproval,
    failed,
    skipped,
  };
  if (executed + pendingApproval + failed > 0) {
    logger.info(result, '[Automation] 룰 스윕 완료');
  }
  return result;
}

async function executeRuleAction(
  rule: typeof automationRules.$inferSelect,
  candidate: TriggerCandidate,
): Promise<AutomationRunStatus> {
  const db = getDb();

  // 개체 컨텍스트 (earTag 치환용)
  let earTag: string | null = null;
  if (candidate.animalId) {
    const [animal] = await db
      .select({ earTag: animals.earTag })
      .from(animals)
      .where(eq(animals.animalId, candidate.animalId))
      .limit(1);
    earTag = animal?.earTag ?? null;
  }

  const action: AutomationAction = rule.action;
  const input = renderParams(action.params, {
    animalId: candidate.animalId,
    farmId: candidate.farmId,
    earTag,
    eventType: candidate.eventType,
    today: new Date().toISOString().slice(0, 10), // {{today}} — 당일 시작 처방 등
  });

  let status: AutomationRunStatus;
  let resultSummary: string;
  try {
    const result = await executeToolWithGateway(action.toolName, input, {
      userId: rule.createdBy ?? undefined,
      role: rule.actorRole,
      farmId: candidate.farmId,
      requestId: `automation-${rule.ruleId}`,
    });
    status = runStatusFromGateway(result);
    resultSummary = result.result.slice(0, 2000);
  } catch (error) {
    status = 'failed';
    resultSummary = error instanceof Error ? error.message : String(error);
  }

  await db
    .insert(automationRuleRuns)
    .values({
      ruleId: rule.ruleId,
      sourceType: candidate.source,
      sourceId: candidate.sourceId,
      animalId: candidate.animalId,
      farmId: candidate.farmId,
      status,
      resultSummary,
    })
    .onConflictDoNothing();

  return status;
}
