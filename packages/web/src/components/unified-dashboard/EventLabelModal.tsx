// 이벤트 레이블링 모달 — 강화학습 피드백 UI
// 알람 클릭 → AI 예측 확인 → 사용자 판정(verdict) → 저장

import React, { useState } from 'react';
import { createEventLabel } from '@web/api/unified-dashboard.api';
import type { LabelVerdict, LabelOutcome } from '@cowtalk/shared';

interface AlarmData {
  readonly eventId: string;
  readonly eventType: string;
  readonly animalId?: string;
  readonly earTag: string;
  readonly farmName: string;
  readonly farmId: string;
  readonly severity: string;
  readonly confidence: number;
  readonly details: unknown;
  readonly detectedAt: string;
}

interface Props {
  readonly alarm: AlarmData;
  readonly onClose: () => void;
  readonly onSaved?: () => void;
}

// ── 상수 ──

const VERDICT_OPTIONS: readonly { readonly value: LabelVerdict; readonly label: string; readonly icon: string; readonly color: string; readonly desc: string }[] = [
  { value: 'confirmed', label: '정확함', icon: '\u2705', color: '#22c55e', desc: 'AI 예측이 정확합니다' },
  { value: 'modified', label: '수정 필요', icon: '\u270F\uFE0F', color: '#f59e0b', desc: '유형/심각도가 다릅니다' },
  { value: 'false_positive', label: '오탐', icon: '\u274C', color: '#ef4444', desc: '실제 문제가 아닙니다' },
  { value: 'missed', label: '미감지 추가', icon: '\uD83D\uDD0D', color: '#8b5cf6', desc: 'AI가 놓친 이벤트 등록' },
];

const OUTCOME_OPTIONS: readonly { readonly value: LabelOutcome; readonly label: string; readonly icon: string }[] = [
  { value: 'resolved', label: '해결됨', icon: '\uD83D\uDFE2' },
  { value: 'ongoing', label: '진행 중', icon: '\uD83D\uDFE1' },
  { value: 'worsened', label: '악화됨', icon: '\uD83D\uDD34' },
  { value: 'no_action', label: '조치 불필요', icon: '\u26AA' },
];

const EVENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  estrus: '발정', estrus_dnb: '발정(DNB)',
  insemination: '수정', pregnancy_check: '임신 감정',
  fertility_warning: '재발정', no_insemination: '미수정',
  calving: '분만', calving_detection: '분만 징후',
  calving_confirmation: '분만 확인', calving_waiting: '분만 대기', abortion: '유산',
  temperature_high: '고체온', temperature_low: '저체온', temperature_warning: '체온 이상',
  rumination_decrease: '반추 저하', rumination_warning: '반추 이상',
  activity_increase: '활동량 증가', activity_decrease: '활동량 저하', activity_warning: '활동 이상',
  health_general: '건강 주의', health_warning: '건강 경고', clinical_condition: '임상 이상',
  feeding_warning: '사양 이상', drinking_warning: '음수 이상',
  dry_off: '건유 전환', management: '관리',
};

const SEVERITY_OPTIONS: readonly { readonly value: string; readonly label: string; readonly color: string }[] = [
  { value: 'critical', label: '긴급', color: '#ef4444' },
  { value: 'high', label: '높음', color: '#f97316' },
  { value: 'medium', label: '보통', color: '#eab308' },
  { value: 'low', label: '낮음', color: '#3b82f6' },
];

// ── 유틸 ──

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

// ── 메인 컴포넌트 ──

export function EventLabelModal({ alarm, onClose, onSaved }: Props): React.JSX.Element {
  const [verdict, setVerdict] = useState<LabelVerdict | null>(null);
  const [actualType, setActualType] = useState<string>(alarm.eventType);
  const [actualSeverity, setActualSeverity] = useState<string>(alarm.severity);
  const [actualDiagnosis, setActualDiagnosis] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [outcome, setOutcome] = useState<LabelOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventLabel = EVENT_TYPE_LABELS[alarm.eventType] ?? alarm.eventType;
  const showModifiedFields = verdict === 'modified' || verdict === 'missed';

  async function handleSave(): Promise<void> {
    if (!verdict || !alarm.animalId) return;

    setSaving(true);
    setError(null);

    try {
      await createEventLabel({
        eventId: alarm.eventId,
        animalId: alarm.animalId,
        farmId: alarm.farmId,
        predictedType: alarm.eventType,
        predictedSeverity: alarm.severity,
        verdict,
        actualType: showModifiedFields ? actualType : undefined,
        actualSeverity: showModifiedFields ? actualSeverity : undefined,
        actualDiagnosis: actualDiagnosis || undefined,
        actionTaken: actionTaken || undefined,
        outcome: outcome ?? undefined,
        notes: notes || undefined,
      });
      setSaved(true);
      onSaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : '저장에 실패했습니다';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
        style={{
          backgroundColor: 'var(--ct-card)',
          border: '1px solid var(--ct-border)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--ct-border)' }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--ct-text)' }}>
              {'\uD83C\uDFF7\uFE0F'} 소버린 AI 현장 확인
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
              AI 예측을 검증하고 학습 데이터를 축적합니다
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
            style={{ color: 'var(--ct-text-secondary)' }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* 스크롤 바디 */}
        <div className="flex-1 overflow-y-auto px-6 py-4" style={{ maxHeight: 'calc(85vh - 140px)' }}>
          {saved ? (
            <SuccessView onClose={onClose} />
          ) : (
            <>
              {/* AI 예측 요약 */}
              <PredictionSummary
                earTag={alarm.earTag}
                farmName={alarm.farmName}
                eventLabel={eventLabel}
                severity={alarm.severity}
                confidence={alarm.confidence}
                detectedAt={alarm.detectedAt}
              />

              {/* 판정 선택 */}
              <SectionTitle label="판정" />
              <div className="grid grid-cols-2 gap-2">
                {VERDICT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVerdict(opt.value)}
                    className="flex flex-col rounded-xl px-3 py-3 text-left transition-all"
                    style={{
                      backgroundColor: verdict === opt.value ? `${opt.color}20` : 'var(--ct-bg)',
                      border: `2px solid ${verdict === opt.value ? opt.color : 'var(--ct-border)'}`,
                      transform: verdict === opt.value ? 'scale(1.02)' : 'scale(1)',
                    }}
                  >
                    <span className="text-sm">
                      {opt.icon} <span style={{ color: 'var(--ct-text)', fontWeight: 600 }}>{opt.label}</span>
                    </span>
                    <span className="mt-1 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>

              {/* 수정/미감지 시 실제 값 입력 */}
              {showModifiedFields && (
                <>
                  <SectionTitle label="실제 이벤트 정보" />
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--ct-text-secondary)' }}>
                        실제 이벤트 유형
                      </label>
                      <select
                        value={actualType}
                        onChange={(e) => setActualType(e.target.value)}
                        className="w-full rounded-lg px-3 py-2 text-sm"
                        style={{
                          backgroundColor: 'var(--ct-bg)',
                          border: '1px solid var(--ct-border)',
                          color: 'var(--ct-text)',
                        }}
                      >
                        {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--ct-text-secondary)' }}>
                        실제 심각도
                      </label>
                      <div className="flex gap-2">
                        {SEVERITY_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setActualSeverity(opt.value)}
                            className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-all"
                            style={{
                              backgroundColor: actualSeverity === opt.value ? `${opt.color}25` : 'var(--ct-bg)',
                              border: `1.5px solid ${actualSeverity === opt.value ? opt.color : 'var(--ct-border)'}`,
                              color: actualSeverity === opt.value ? opt.color : 'var(--ct-text-secondary)',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 실제 진단명 */}
              <SectionTitle label="진단/상세" />
              <textarea
                value={actualDiagnosis}
                onChange={(e) => setActualDiagnosis(e.target.value)}
                placeholder="실제 진단명 또는 관찰 내용 (예: 유방염 초기, 발정 확인 후 수정 완료)"
                rows={2}
                className="w-full resize-none rounded-lg px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--ct-bg)',
                  border: '1px solid var(--ct-border)',
                  color: 'var(--ct-text)',
                }}
              />

              {/* 조치 내용 */}
              <SectionTitle label="취한 조치" />
              <textarea
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                placeholder="취한 조치 (예: 항생제 투여, 수의사 호출, 격리 조치)"
                rows={2}
                className="w-full resize-none rounded-lg px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--ct-bg)',
                  border: '1px solid var(--ct-border)',
                  color: 'var(--ct-text)',
                }}
              />

              {/* 결과 */}
              <SectionTitle label="결과" />
              <div className="flex gap-2">
                {OUTCOME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOutcome(outcome === opt.value ? null : opt.value)}
                    className="flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-all"
                    style={{
                      backgroundColor: outcome === opt.value ? 'var(--ct-primary-muted)' : 'var(--ct-bg)',
                      border: `1.5px solid ${outcome === opt.value ? 'var(--ct-primary)' : 'var(--ct-border)'}`,
                      color: outcome === opt.value ? 'var(--ct-primary)' : 'var(--ct-text-secondary)',
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>

              {/* 메모 */}
              <SectionTitle label="메모 (선택)" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="기타 참고사항..."
                rows={2}
                className="w-full resize-none rounded-lg px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--ct-bg)',
                  border: '1px solid var(--ct-border)',
                  color: 'var(--ct-text)',
                }}
              />

              {error && (
                <div
                  className="mt-3 rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
                >
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* 푸터 — 저장 버튼 */}
        {!saved && (
          <div
            className="flex items-center justify-between px-6 py-4"
            style={{ borderTop: '1px solid var(--ct-border)' }}
          >
            <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
              {verdict ? `${VERDICT_OPTIONS.find((v) => v.value === verdict)?.icon ?? ''} ${VERDICT_OPTIONS.find((v) => v.value === verdict)?.label ?? ''} 선택됨` : '판정을 선택하세요'}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={!verdict || !alarm.animalId || saving}
              className="rounded-xl px-5 py-2 text-sm font-semibold transition-all"
              style={{
                backgroundColor: verdict ? 'var(--ct-primary)' : 'var(--ct-border)',
                color: verdict ? '#fff' : 'var(--ct-text-secondary)',
                opacity: !verdict || saving ? 0.5 : 1,
                cursor: !verdict || saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '저장 중...' : '레이블 저장'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 서브 컴포넌트 ──

function PredictionSummary({
  earTag, farmName, eventLabel, severity, confidence, detectedAt,
}: {
  readonly earTag: string;
  readonly farmName: string;
  readonly eventLabel: string;
  readonly severity: string;
  readonly confidence: number;
  readonly detectedAt: string;
}): React.JSX.Element {
  const severityColor = SEVERITY_OPTIONS.find((s) => s.value === severity)?.color ?? '#6b7280';

  return (
    <div
      className="mb-4 rounded-xl p-4"
      style={{
        backgroundColor: 'var(--ct-bg)',
        border: '1px solid var(--ct-border)',
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
          AI {'\uD83E\uDD16'} 예측
        </span>
        <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
          {formatDateTime(detectedAt)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-md px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: 'var(--ct-primary-muted)', color: 'var(--ct-primary)' }}
        >
          {earTag}
        </span>
        <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
          {farmName}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-sm font-medium" style={{ color: 'var(--ct-text)' }}>
          {eventLabel}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ backgroundColor: `${severityColor}20`, color: severityColor }}
        >
          {SEVERITY_OPTIONS.find((s) => s.value === severity)?.label ?? severity}
        </span>
        <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
          신뢰도 {Math.round(confidence * 100)}%
        </span>
      </div>
    </div>
  );
}

function SectionTitle({ label }: { readonly label: string }): React.JSX.Element {
  return (
    <h4
      className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider"
      style={{ color: 'var(--ct-text-secondary)' }}
    >
      {label}
    </h4>
  );
}

function SuccessView({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl"
        style={{ backgroundColor: '#22c55e20' }}
      >
        {'\u2705'}
      </div>
      <h3 className="text-lg font-semibold" style={{ color: 'var(--ct-text)' }}>
        레이블 저장 완료
      </h3>
      <p className="mt-2 text-center text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
        피드백이 AI 학습 데이터에 반영됩니다.
        <br />
        레이블이 축적될수록 예측 정확도가 향상됩니다.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 rounded-xl px-6 py-2 text-sm font-semibold transition-all"
        style={{ backgroundColor: 'var(--ct-primary)', color: '#fff' }}
      >
        닫기
      </button>
    </div>
  );
}
