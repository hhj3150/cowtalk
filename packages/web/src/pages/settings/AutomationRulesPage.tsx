// 자동화 룰 관리 — "알람 → 행동" 자동 연결 (P3 AIP Automate)
// 프리셋 기반 생성 + 활성 토글 + 실행 이력. 고위험 도구는 승인 게이트를 거친다는 사실을 UI에 명시.

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AutomationRule, AutomationRuleRun } from '@cowtalk/shared';
import {
  fetchAutomationRules,
  fetchAutomationRuns,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  type CreateRuleInput,
} from '@web/api/automation.api';
import { useFarmStore } from '@web/stores/farm.store';
import { TitleAccentBar } from '@web/components/unified-dashboard/WidgetTitle';

interface RulePreset {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly needsApprovalNote?: string;
  readonly build: (farmId: string | null) => Omit<CreateRuleInput, 'farmId'>;
}

const PRESETS: readonly RulePreset[] = [
  {
    key: 'heat-to-window',
    label: '발정 감지 → 수정 적기 자동 추천',
    detail: 'smaXtec 발정 이벤트(신뢰도 70%↑)가 오면 해당 개체의 수정 적기·추천 정액을 자동 산출해 기록합니다.',
    build: () => ({
      name: '발정 감지 → 수정 적기 추천',
      description: 'smaXtec heat 이벤트 수신 시 recommend_insemination_window 자동 실행',
      trigger: { source: 'smaxtec_event', eventTypes: ['heat'], minConfidence: 0.7 },
      action: { toolName: 'recommend_insemination_window', params: { animalId: '{{animalId}}' } },
      cooldownHours: 18,
    }),
  },
  {
    key: 'health-to-ddx',
    label: '건강 경고 → 감별진단 자동 분석',
    detail: '건강 경고 이벤트가 오면 질병별 확률·확인검사 트리를 자동 분석해 기록합니다.',
    build: () => ({
      name: '건강 경고 → 감별진단',
      description: 'smaXtec 건강 이벤트 수신 시 query_differential_diagnosis 자동 실행',
      trigger: { source: 'smaxtec_event', eventTypes: ['health_warning', 'clinical_condition'], minConfidence: 0.6 },
      action: { toolName: 'query_differential_diagnosis', params: { animalId: '{{animalId}}' } },
      cooldownHours: 24,
    }),
  },
  {
    key: 'repeat-to-sync',
    label: '반복 미수태 → 발정동기화 처방',
    detail: '반복수정우 알림(high↑)이 오면 OVSYNCH 프로토콜 처방을 자동 생성합니다.',
    needsApprovalNote: '농장주 계정의 처방은 수의사·행정관 승인 대기로 들어갑니다 (자동 실행 아님).',
    build: () => ({
      name: '반복 미수태 → OVSYNCH 처방',
      description: 'repeat_breeder 알림 시 schedule_sync_protocol(OVSYNCH) — 승인 게이트 경유',
      trigger: { source: 'alert', eventTypes: ['repeat_breeder'], minPriority: 'high' },
      action: {
        toolName: 'schedule_sync_protocol',
        params: { animalId: '{{animalId}}', farmId: '{{farmId}}', protocol: 'OVSYNCH', startDate: '{{today}}' },
      },
      cooldownHours: 24 * 14,
    }),
  },
];

const STATUS_META: Readonly<Record<string, { label: string; color: string }>> = {
  executed: { label: '실행됨', color: '#22c55e' },
  pending_approval: { label: '승인 대기', color: '#f59e0b' },
  denied: { label: '권한 거부', color: '#ef4444' },
  failed: { label: '실패', color: '#ef4444' },
};

function TriggerSummary({ rule }: { readonly rule: AutomationRule }): React.JSX.Element {
  const t = rule.trigger;
  const source = t.source === 'alert' ? 'CowTalk 알림' : 'smaXtec 이벤트';
  const types = t.eventTypes.length > 0 ? t.eventTypes.join(', ') : '전체';
  const cond = t.minPriority ? ` · ${t.minPriority}↑` : t.minConfidence != null ? ` · 신뢰도 ${Math.round(t.minConfidence * 100)}%↑` : '';
  return (
    <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
      {source} [{types}]{cond} → <code style={{ fontSize: 10 }}>{rule.action.toolName}</code> · 쿨다운 {rule.cooldownHours}h
    </span>
  );
}

export function AutomationRulesPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { selectedFarmId } = useFarmStore();
  const [presetKey, setPresetKey] = useState<string>(PRESETS[0]!.key);
  const [error, setError] = useState<string | null>(null);

  const { data: rules, isLoading } = useQuery({
    queryKey: ['automation-rules'],
    queryFn: fetchAutomationRules,
  });
  const { data: runs } = useQuery({
    queryKey: ['automation-runs'],
    queryFn: () => fetchAutomationRuns(),
    refetchInterval: 60_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
    void queryClient.invalidateQueries({ queryKey: ['automation-runs'] });
  };

  const createMutation = useMutation({
    mutationFn: createAutomationRule,
    onSuccess: () => { setError(null); invalidate(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg ?? '룰 생성에 실패했습니다.');
    },
  });
  const toggleMutation = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean }) =>
      updateAutomationRule(ruleId, { enabled }),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAutomationRule,
    onSuccess: invalidate,
  });

  const selectedPreset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0]!;

  function handleCreate(): void {
    const base = selectedPreset.build(selectedFarmId ?? null);
    createMutation.mutate({ ...base, farmId: selectedFarmId ?? null });
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <TitleAccentBar />
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ct-text)', margin: 0 }}>자동화 룰</h1>
      </div>
      <p style={{ fontSize: 12, color: 'var(--ct-text-muted)', marginBottom: 16 }}>
        알람이 오면 정해진 조치를 자동 실행합니다. 처방 등 고위험 조치는 자동 실행되지 않고 승인 대기로 들어갑니다.
      </p>

      {/* 프리셋 생성 */}
      <div className="ct-card" style={{ borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)', marginBottom: 10 }}>새 룰 만들기</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {PRESETS.map((p) => (
            <label
              key={p.key}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 10,
                border: '1px solid', cursor: 'pointer',
                borderColor: presetKey === p.key ? 'var(--ct-primary)' : 'var(--ct-border)',
                background: presetKey === p.key ? 'rgba(16,185,129,0.06)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="preset"
                checked={presetKey === p.key}
                onChange={() => { setPresetKey(p.key); }}
                style={{ marginTop: 2 }}
              />
              <span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text)', display: 'block' }}>{p.label}</span>
                <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>{p.detail}</span>
                {p.needsApprovalNote && (
                  <span style={{ fontSize: 11, color: '#f59e0b', display: 'block', marginTop: 2 }}>⚠ {p.needsApprovalNote}</span>
                )}
              </span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--ct-primary)', border: 'none', cursor: 'pointer' }}
          >
            {createMutation.isPending ? '생성 중...' : '룰 생성'}
          </button>
          <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
            {selectedFarmId ? '선택된 농장에 적용' : '농장 미선택 — 스코프 전체 적용 (농장주는 농장 선택 필요)'}
          </span>
        </div>
        {error && (
          <div role="alert" style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>{error}</div>
        )}
      </div>

      {/* 룰 목록 */}
      <div className="ct-card" style={{ borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)', marginBottom: 10 }}>
          내 룰 {rules ? `(${rules.length})` : ''}
        </div>
        {isLoading && <div className="ct-shimmer" style={{ height: 60, borderRadius: 10 }} />}
        {!isLoading && (rules?.length ?? 0) === 0 && (
          <div style={{ fontSize: 12, color: 'var(--ct-text-muted)', padding: '8px 0' }}>
            아직 룰이 없습니다. 위 프리셋으로 첫 자동화를 만들어 보세요.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules?.map((rule) => (
            <div
              key={rule.ruleId}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 10, border: '1px solid var(--ct-border)', background: 'var(--ct-surface-2, transparent)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ct-text)' }}>
                  {rule.name}
                  {!rule.enabled && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--ct-text-muted)' }}>(비활성)</span>}
                </div>
                <TriggerSummary rule={rule} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ct-text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => { toggleMutation.mutate({ ruleId: rule.ruleId, enabled: e.target.checked }); }}
                  aria-label={`${rule.name} 활성화`}
                />
                활성
              </label>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`'${rule.name}' 룰과 실행 기록을 삭제할까요?`)) {
                    deleteMutation.mutate(rule.ruleId);
                  }
                }}
                aria-label={`${rule.name} 삭제`}
                style={{
                  border: '1px solid var(--ct-border)', background: 'transparent', color: '#ef4444',
                  borderRadius: 8, padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 실행 이력 */}
      <div className="ct-card" style={{ borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)', marginBottom: 10 }}>
          최근 실행 이력 {runs ? `(${runs.length})` : ''}
        </div>
        {(runs?.length ?? 0) === 0 && (
          <div style={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>
            아직 실행 기록이 없습니다. 룰이 활성 상태면 알람 수신 후 10분 내 자동 실행됩니다.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {runs?.map((run: AutomationRuleRun) => {
            const meta = STATUS_META[run.status] ?? { label: run.status, color: 'var(--ct-text-muted)' };
            return (
              <div key={run.runId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, padding: '6px 4px', borderBottom: '1px solid var(--ct-border)' }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: meta.color, border: `1px solid ${meta.color}44`,
                  borderRadius: 6, padding: '1px 6px', flexShrink: 0,
                }}>
                  {meta.label}
                </span>
                <span style={{ color: 'var(--ct-text)', fontWeight: 600, flexShrink: 0 }}>
                  {run.earTag ? `${run.earTag}번` : '—'}
                </span>
                <span style={{ color: 'var(--ct-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {run.ruleName ?? run.ruleId}
                </span>
                <span style={{ color: 'var(--ct-text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {new Date(run.executedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AutomationRulesPage;
