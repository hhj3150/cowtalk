// 자동화 룰 API — 알람→조치 룰 CRUD + 실행 이력

import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { AutomationRule, AutomationRuleRun, AutomationTrigger, AutomationAction } from '@cowtalk/shared';

export interface CreateRuleInput {
  readonly farmId?: string | null;
  readonly name: string;
  readonly description?: string | null;
  readonly trigger: AutomationTrigger;
  readonly action: AutomationAction;
  readonly cooldownHours?: number;
}

export function fetchAutomationRules(): Promise<readonly AutomationRule[]> {
  return apiGet<readonly AutomationRule[]>('/automation/rules');
}

export function createAutomationRule(input: CreateRuleInput): Promise<AutomationRule> {
  return apiPost<AutomationRule>('/automation/rules', input);
}

export function updateAutomationRule(
  ruleId: string,
  patch: Partial<Pick<AutomationRule, 'name' | 'description' | 'enabled' | 'cooldownHours'>>,
): Promise<AutomationRule> {
  return apiPatch<AutomationRule>(`/automation/rules/${ruleId}`, patch);
}

export function deleteAutomationRule(ruleId: string): Promise<{ ruleId: string }> {
  return apiDelete<{ ruleId: string }>(`/automation/rules/${ruleId}`);
}

export function fetchAutomationRuns(ruleId?: string): Promise<readonly AutomationRuleRun[]> {
  return apiGet<readonly AutomationRuleRun[]>('/automation/runs', ruleId ? { ruleId } : undefined);
}
