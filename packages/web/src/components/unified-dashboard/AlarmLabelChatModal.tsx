// 팅커벨 AI 지식 강화 루프 — 알람 레이블 + AI 대화 모달
// Sovereign AI Knowledge Loop: Expert labels ground truth via AI-assisted chat
//
// 핵심 개념:
// smaXtec 센서(해외)는 데이터 소스일 뿐, 현장 전문가가 AI와 대화하며
// 레이블링한 지식은 해당 국가/지역의 고유 자산(팅커벨 AI)이 된다.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useVoiceInput } from '@web/hooks/useVoiceInput';
import { useVoiceOutput } from '@web/hooks/useVoiceOutput';
import { MicButton } from '@web/components/common/MicButton';
import { apiGet } from '@web/api/client';
import { useT } from '@web/i18n/useT';
import { getEventContext, streamLabelChat, submitLabel, getAnimalEvents, getLabelHistory, submitFollowUp, getAnimalInfo, submitObservation, getObservations, saveConversationRecord } from '@web/api/label-chat.api';
import type { AnimalEvent, AnimalInfo, LabelWithFollowUps, SubmitFollowUpRequest, ClinicalObservation, SubmitObservationRequest, ExtractedRecordClient } from '@web/api/label-chat.api';
import type { EventContext, LabelVerdict, LabelOutcome } from '@cowtalk/shared';
import { SensorDataPanel } from './SensorDataPanel';
import { ExtractedRecordCard } from './ExtractedRecordCard';

// ── 상수 ──

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

// VERDICT_OPTIONS / OUTCOME_OPTIONS / EVENT_TYPE_LABELS 는 i18n으로 전환되어
// 컴포넌트 내부에서 t() 함수를 사용해 동적으로 생성. value/color는 그대로 유지.

const VERDICT_META: readonly { readonly value: LabelVerdict; readonly color: string; readonly labelKey: string; readonly descKey: string }[] = [
  { value: 'confirmed',      color: '#22c55e', labelKey: 'verdict.confirmed.label',       descKey: 'verdict.confirmed.desc' },
  { value: 'modified',       color: '#eab308', labelKey: 'verdict.partially.label',       descKey: 'verdict.partially.desc' },
  { value: 'false_positive', color: '#ef4444', labelKey: 'verdict.false_positive.label',  descKey: 'verdict.false_positive.desc' },
  { value: 'missed',         color: '#8b5cf6', labelKey: 'verdict.too_late.label',        descKey: 'verdict.too_late.desc' },
];

const OUTCOME_META: readonly { readonly value: LabelOutcome; readonly labelKey: string }[] = [
  { value: 'resolved',  labelKey: 'outcome.resolved' },
  { value: 'ongoing',   labelKey: 'outcome.ongoing' },
  { value: 'worsened',  labelKey: 'outcome.worsened' },
  { value: 'no_action', labelKey: 'outcome.no_action' },
];

// generateSuggestedQuestions(module-level, 한국어 질문 hardcoded)에서만 사용하는
// 한국어 라벨 fallback. JSX의 사용자 표시용은 t('event.<key>')로 대체됨.
const EVENT_TYPE_LABELS_KO: Record<string, string> = {
  temperature_high: '고체온',
  clinical_condition: '임상 이상',
  rumination_decrease: '반추 저하',
  activity_decrease: '활동량 저하',
  drinking_decrease: '음수 저하',
  health_warning: '건강 경고',
  estrus: '발정',
  heat: '발정',
  calving: '분만',
  calving_detection: '분만 징후',
  activity_increase: '활동량 증가',
};

// ── 이벤트 타입별 맞춤 추천 질문 ──

const EVENT_QUESTIONS: Record<string, readonly string[]> = {
  heat: [
    '수정 적기는 언제야? 최적 타이밍을 알려줘',
    '발정 강도는 어떤 수준이야?',
    '반복 발정 여부를 확인해줘 — 번식 장애 가능성은?',
    '이전 수정 이력과 비교해서 이번 발정 패턴은 어때?',
  ],
  estrus: [
    '수정 적기는 언제야? 최적 타이밍을 알려줘',
    '발정 강도는 어떤 수준이야?',
    '반복 발정 여부를 확인해줘 — 번식 장애 가능성은?',
    '이전 수정 이력과 비교해서 이번 발정 패턴은 어때?',
  ],
  temperature_high: [
    '체온 상승의 원인으로 뭐가 의심돼?',
    '유방염이나 감염 가능성은?',
    '응급 상황인지 판단해줘 — 수의사 호출이 필요해?',
    '최근 사료 변경이나 환경 변화와 연관성은?',
  ],
  rumination_decrease: [
    '반추 감소 원인을 분석해줘 — 사료 문제일 가능성은?',
    '소화기 질환이나 제4위변위 가능성은?',
    '케토시스 위험도를 평가해줘',
    '사료 섭취량과 음수량 변화도 같이 확인해줘',
  ],
  calving: [
    '난산 위험도를 평가해줘',
    '초유 급여 시기와 양은 어떻게 해야 해?',
    '산후 관리 체크리스트를 알려줘',
    '분만 후 자궁 회복 모니터링 포인트는?',
  ],
  calving_detection: [
    '난산 위험도를 평가해줘',
    '초유 급여 시기와 양은 어떻게 해야 해?',
    '산후 관리 체크리스트를 알려줘',
    '분만 후 자궁 회복 모니터링 포인트는?',
  ],
  health_warning: [
    '현재 증상을 종합 분석해줘',
    '격리가 필요한 상황인지 판단해줘',
    '수의사 호출 시기를 추천해줘',
    '동일 축사 내 다른 소들도 확인해야 해?',
  ],
  activity_decrease: [
    '활동량 감소 원인을 분석해줘',
    '통증이나 지절 문제 가능성은?',
    '분만 임박 징후일 수 있어?',
    '최근 센서 데이터 추이와 비교해서 어떤 패턴이야?',
  ],
  activity_increase: [
    '활동량 증가가 발정 징후인지 분석해줘',
    '스트레스나 환경 요인일 가능성은?',
    '다른 센서 지표와 교차 분석해줘',
    '최근 이력을 보고 원인을 추정해줘',
  ],
  drinking_decrease: [
    '음수량 감소 원인을 분석해줘',
    '탈수 위험도를 평가해줘',
    '수질이나 급수 시설 문제 가능성은?',
    '사료 섭취량과 반추 활동도 같이 확인해줘',
  ],
  clinical_condition: [
    '현재 임상 증상을 종합 분석해줘',
    '긴급 조치가 필요한 상황인지 판단해줘',
    '유사 증상의 다른 질환 가능성은?',
    '치료 이력과 비교해서 경과는 어때?',
  ],
};

const NORMAL_ANIMAL_QUESTIONS: readonly string[] = [
  '현재 건강 상태를 종합 평가해줘',
  '센서 데이터 추이를 분석해줘 — 이상 징후는 없어?',
  '이 소의 비유 성적은 어떤 수준이야?',
  '예방적으로 주의해야 할 점이 있어?',
];

function generateSuggestedQuestions(
  context: EventContext | null,
  animalInfo: AnimalInfo | null,
  earTag: string,
): readonly string[] {
  // 이벤트 컨텍스트가 있는 경우 — 이벤트 타입 기반 맞춤 질문
  if (context) {
    const eventType = context.eventType;
    const typeQuestions = EVENT_QUESTIONS[eventType];

    if (typeQuestions) {
      return typeQuestions;
    }

    // 매핑되지 않은 이벤트 타입 — 범용 이벤트 질문
    const typeLabel = EVENT_TYPE_LABELS_KO[eventType] ?? eventType;
    return [
      `이 ${typeLabel} 알람의 원인으로 뭐가 의심돼?`,
      `${earTag}번 소의 최근 이력을 보고 현재 상태를 분석해줘`,
      '이 이벤트가 오탐일 가능성은?',
      '어떤 조치를 취해야 하는지 추천해줘',
    ];
  }

  // 이벤트 없이 개체 정보만 있는 경우 — 정상 소 유용 질문
  if (animalInfo) {
    return NORMAL_ANIMAL_QUESTIONS.map((q) =>
      q.startsWith('센서') ? `${earTag}번 소의 ${q}` : `${earTag}번 소의 ${q}`,
    );
  }

  return [];
}

interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly extractedRecords?: readonly ExtractedRecordClient[];
}

interface Props {
  readonly animalId: string;
  readonly initialEventId?: string;
  readonly onClose: () => void;
}

// ── ChatBubble ──

function ChatBubble({ message }: {
  readonly message: ChatMessage;
}): React.JSX.Element {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div style={{
        textAlign: 'center',
        fontSize: 11,
        color: 'var(--ct-text-muted)',
        padding: '8px 0',
        fontStyle: 'italic',
      }}>
        {message.content}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 8,
    }}>
      {!isUser && (
        <div style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          flexShrink: 0,
          marginRight: 8,
          marginTop: 2,
        }}>
          🧠
        </div>
      )}
      <div style={{
        maxWidth: '80%',
        borderRadius: 12,
        padding: '10px 14px',
        fontSize: 13,
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        background: isUser ? 'var(--ct-primary)' : 'rgba(0,0,0,0.2)',
        color: isUser ? '#ffffff' : 'var(--ct-text)',
        border: isUser ? 'none' : '1px solid var(--ct-border)',
      }}>
        {message.content}
      </div>
    </div>
  );
}

// ── EventSelector ──

function EventSelector({ events, selectedId, onSelect, eventTypeLabel }: {
  readonly events: readonly AnimalEvent[];
  readonly selectedId: string | null;
  readonly onSelect: (eventId: string) => void;
  readonly eventTypeLabel: (et: string) => string;
}): React.JSX.Element {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      maxHeight: 180,
      overflowY: 'auto',
    }}>
      {events.map((evt) => {
        const isSelected = evt.eventId === selectedId;
        const color = SEVERITY_COLORS[evt.severity] ?? '#94a3b8';
        const d = new Date(evt.detectedAt);
        const timeStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

        return (
          <button
            key={evt.eventId}
            type="button"
            onClick={() => onSelect(evt.eventId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 8,
              border: isSelected ? `1.5px solid ${color}` : '1px solid var(--ct-border)',
              background: isSelected ? `${color}11` : 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: color,
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text)' }}>
                {eventTypeLabel(evt.eventType)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
                {timeStr}
              </div>
            </div>
            {evt.hasLabel && (
              <span style={{
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 4,
                background: '#22c55e22',
                color: '#22c55e',
                fontWeight: 600,
              }}>
                레이블됨
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── LabelForm ──

function LabelForm({ context: _context, onSubmit, isSubmitting }: {
  readonly context: EventContext;
  readonly onSubmit: (data: {
    verdict: LabelVerdict;
    actualDiagnosis?: string;
    actionTaken?: string;
    outcome?: LabelOutcome;
    notes?: string;
  }) => void;
  readonly isSubmitting: boolean;
}): React.JSX.Element {
  const t = useT();
  const VERDICT_OPTIONS = React.useMemo(() => VERDICT_META.map((m) => ({
    value: m.value, color: m.color, label: t(m.labelKey), desc: t(m.descKey),
  })), [t]);
  const OUTCOME_OPTIONS = React.useMemo(() => OUTCOME_META.map((m) => ({
    value: m.value, label: t(m.labelKey),
  })), [t]);
  const [verdict, setVerdict] = useState<LabelVerdict | null>(null);
  const [actualDiagnosis, setActualDiagnosis] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [outcome, setOutcome] = useState<LabelOutcome | null>(null);
  const [notes, setNotes] = useState('');

  const handleSubmit = (): void => {
    if (!verdict) return;
    onSubmit({
      verdict,
      actualDiagnosis: actualDiagnosis || undefined,
      actionTaken: actionTaken || undefined,
      outcome: outcome ?? undefined,
      notes: notes || undefined,
    });
  };

  return (
    <div style={{
      borderTop: '1px solid var(--ct-border)',
      padding: '14px 0 0',
    }}>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--ct-text)',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span>🏷️</span>
        <span>현장 확인 레이블</span>
        <span style={{ fontSize: 10, color: 'var(--ct-text-muted)', fontWeight: 400 }}>
          (팅커벨 AI 학습 데이터)
        </span>
      </div>

      {/* 판정 (verdict) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {VERDICT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setVerdict(opt.value)}
            title={opt.desc}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: verdict === opt.value
                ? `2px solid ${opt.color}`
                : '1px solid var(--ct-border)',
              background: verdict === opt.value ? `${opt.color}22` : 'transparent',
              color: verdict === opt.value ? opt.color : 'var(--ct-text-secondary)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 확장 필드: verdict 선택 시 표시 */}
      {verdict && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 실제 진단 */}
          <input
            type="text"
            placeholder="실제 진단 (예: 유방염, 케토시스, 사료변경 스트레스...)"
            value={actualDiagnosis}
            onChange={(e) => setActualDiagnosis(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--ct-border)',
              background: 'rgba(0,0,0,0.15)',
              color: 'var(--ct-text)',
              fontSize: 12,
              outline: 'none',
            }}
          />

          {/* 취한 조치 */}
          <input
            type="text"
            placeholder="취한 조치 (예: 항생제 투여, 수액 처치, 경과 관찰...)"
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--ct-border)',
              background: 'rgba(0,0,0,0.15)',
              color: 'var(--ct-text)',
              fontSize: 12,
              outline: 'none',
            }}
          />

          {/* 결과 */}
          <div style={{ display: 'flex', gap: 6 }}>
            {OUTCOME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setOutcome(opt.value)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: outcome === opt.value
                    ? '1.5px solid var(--ct-primary)'
                    : '1px solid var(--ct-border)',
                  background: outcome === opt.value ? 'rgba(0,214,126,0.1)' : 'transparent',
                  color: outcome === opt.value ? 'var(--ct-primary)' : 'var(--ct-text-muted)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 메모 */}
          <textarea
            placeholder="추가 메모 (자유 입력 — AI가 학습에 활용합니다)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--ct-border)',
              background: 'rgba(0,0,0,0.15)',
              color: 'var(--ct-text)',
              fontSize: 12,
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />

          {/* 제출 버튼 */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: 'none',
              background: isSubmitting
                ? 'var(--ct-text-muted)'
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.3px',
            }}
          >
            {isSubmitting ? '저장 중...' : '🏷️ 레이블 저장 → 팅커벨 AI 학습'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── 예후 상태 상수 ──

const FOLLOW_UP_STATUS_OPTIONS: readonly { readonly value: string; readonly label: string; readonly color: string }[] = [
  { value: 'recovered', label: '완치', color: '#22c55e' },
  { value: 'improving', label: '호전', color: '#4ade80' },
  { value: 'unchanged', label: '변동없음', color: '#eab308' },
  { value: 'worsened', label: '악화', color: '#f97316' },
  { value: 'relapsed', label: '재발', color: '#ef4444' },
  { value: 'dead', label: '폐사', color: '#991b1b' },
];

const APPETITE_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'normal', label: '정상' },
  { value: 'decreased', label: '감소' },
  { value: 'none', label: '절식' },
];

const MOBILITY_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'normal', label: '정상' },
  { value: 'reduced', label: '저하' },
  { value: 'lame', label: '파행' },
];

const MILK_OPTIONS: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'normal', label: '정상' },
  { value: 'decreased', label: '감소' },
  { value: 'increased', label: '증가' },
  { value: 'no_milk', label: '무유' },
];

// ── FollowUpForm ──

function FollowUpForm({ labelId, eventId, animalId, onSubmit, isSubmitting: submitting }: {
  readonly labelId: string;
  readonly eventId: string;
  readonly animalId: string;
  readonly onSubmit: (data: SubmitFollowUpRequest) => void;
  readonly isSubmitting: boolean;
}): React.JSX.Element {
  const [status, setStatus] = useState<string | null>(null);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [temperature, setTemperature] = useState('');
  const [appetite, setAppetite] = useState<string | null>(null);
  const [mobility, setMobility] = useState<string | null>(null);
  const [milkYieldChange, setMilkYieldChange] = useState<string | null>(null);
  const [additionalTreatment, setAdditionalTreatment] = useState('');
  const [treatmentChanged, setTreatmentChanged] = useState(false);

  const handleSubmit = (): void => {
    if (!status) return;
    onSubmit({
      labelId,
      eventId,
      animalId,
      status,
      clinicalNotes: clinicalNotes || undefined,
      temperature: temperature ? parseFloat(temperature) : undefined,
      appetite: appetite ?? undefined,
      mobility: mobility ?? undefined,
      milkYieldChange: milkYieldChange ?? undefined,
      additionalTreatment: additionalTreatment || undefined,
      treatmentChanged,
    });
  };

  return (
    <div style={{
      marginTop: 12,
      padding: '12px 0 0',
      borderTop: '1px solid var(--ct-border)',
    }}>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--ct-text)',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span>📋</span>
        <span>예후 추적 기록</span>
        <span style={{ fontSize: 10, color: 'var(--ct-text-muted)', fontWeight: 400 }}>
          (진단 후 경과 → AI 인과관계 학습)
        </span>
      </div>

      {/* 예후 상태 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {FOLLOW_UP_STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setStatus(opt.value)}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: status === opt.value
                ? `2px solid ${opt.color}`
                : '1px solid var(--ct-border)',
              background: status === opt.value ? `${opt.color}22` : 'transparent',
              color: status === opt.value ? opt.color : 'var(--ct-text-secondary)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {status && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 임상 관찰 */}
          <textarea
            placeholder="임상 관찰 (현재 상태, 변화 사항 기록)"
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            rows={2}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--ct-border)',
              background: 'rgba(0,0,0,0.15)',
              color: 'var(--ct-text)',
              fontSize: 12,
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />

          {/* 체온 + 임상 지표 행 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>체온:</span>
              <input
                type="number"
                step="0.1"
                placeholder="39.0"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                style={{
                  width: 70,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--ct-border)',
                  background: 'rgba(0,0,0,0.15)',
                  color: 'var(--ct-text)',
                  fontSize: 11,
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>°C</span>
            </div>

            {/* 식욕 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>식욕:</span>
              {APPETITE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAppetite(opt.value)}
                  style={{
                    padding: '2px 7px',
                    borderRadius: 4,
                    border: appetite === opt.value ? '1px solid var(--ct-primary)' : '1px solid var(--ct-border)',
                    background: appetite === opt.value ? 'rgba(0,214,126,0.1)' : 'transparent',
                    color: appetite === opt.value ? 'var(--ct-primary)' : 'var(--ct-text-muted)',
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 보행 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>보행:</span>
              {MOBILITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMobility(opt.value)}
                  style={{
                    padding: '2px 7px',
                    borderRadius: 4,
                    border: mobility === opt.value ? '1px solid var(--ct-primary)' : '1px solid var(--ct-border)',
                    background: mobility === opt.value ? 'rgba(0,214,126,0.1)' : 'transparent',
                    color: mobility === opt.value ? 'var(--ct-primary)' : 'var(--ct-text-muted)',
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 유량 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>유량:</span>
              {MILK_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMilkYieldChange(opt.value)}
                  style={{
                    padding: '2px 7px',
                    borderRadius: 4,
                    border: milkYieldChange === opt.value ? '1px solid var(--ct-primary)' : '1px solid var(--ct-border)',
                    background: milkYieldChange === opt.value ? 'rgba(0,214,126,0.1)' : 'transparent',
                    color: milkYieldChange === opt.value ? 'var(--ct-primary)' : 'var(--ct-text-muted)',
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 추가 처치 */}
          <input
            type="text"
            placeholder="추가 처치 (약물 변경, 수액 추가 등)"
            value={additionalTreatment}
            onChange={(e) => setAdditionalTreatment(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--ct-border)',
              background: 'rgba(0,0,0,0.15)',
              color: 'var(--ct-text)',
              fontSize: 12,
              outline: 'none',
            }}
          />

          {/* 처방 변경 여부 */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ct-text-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={treatmentChanged}
              onChange={(e) => setTreatmentChanged(e.target.checked)}
              style={{ accentColor: 'var(--ct-primary)' }}
            />
            처방 변경됨 (기존 처방에서 변경된 경우 체크)
          </label>

          {/* 저장 */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: 'none',
              background: submitting
                ? 'var(--ct-text-muted)'
                : 'linear-gradient(135deg, #f97316, #ef4444)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.3px',
            }}
          >
            {submitting ? '저장 중...' : '📋 예후 기록 → 팅커벨 AI 인과관계 학습'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── FollowUpTimeline ──

function FollowUpTimeline({ labelHistory }: {
  readonly labelHistory: readonly LabelWithFollowUps[];
}): React.JSX.Element {
  const t = useT();
  const VERDICT_OPTIONS = React.useMemo(() => VERDICT_META.map((m) => ({
    value: m.value, color: m.color, label: t(m.labelKey), desc: t(m.descKey),
  })), [t]);

  if (labelHistory.length === 0) return <></>;

  const statusColor = (s: string): string => {
    const opt = FOLLOW_UP_STATUS_OPTIONS.find((o) => o.value === s);
    return opt?.color ?? '#94a3b8';
  };

  const statusLabel = (s: string): string => {
    const opt = FOLLOW_UP_STATUS_OPTIONS.find((o) => o.value === s);
    return opt?.label ?? s;
  };

  const verdictLabel = (v: string): string => {
    const opt = VERDICT_OPTIONS.find((o) => o.value === v);
    return opt?.label ?? v;
  };

  return (
    <div style={{
      marginTop: 10,
      padding: '10px 0 0',
      borderTop: '1px solid var(--ct-border)',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--ct-text-muted)',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <span>🔄</span>
        <span>진단 → 처방 → 예후 이력</span>
      </div>

      {labelHistory.map((label) => (
        <div key={label.labelId} style={{
          marginBottom: 10,
          padding: '8px 10px',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.1)',
          border: '1px solid var(--ct-border)',
        }}>
          {/* 레이블 헤더 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 10 }}>🏷️</span>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: VERDICT_OPTIONS.find((o) => o.value === label.verdict)?.color ?? '#94a3b8',
            }}>
              {verdictLabel(label.verdict)}
            </span>
            {label.actualDiagnosis && (
              <span style={{ fontSize: 10, color: 'var(--ct-text-secondary)' }}>
                {label.actualDiagnosis}
              </span>
            )}
            <span style={{ fontSize: 9, color: 'var(--ct-text-muted)', marginLeft: 'auto' }}>
              {new Date(label.labeledAt).toLocaleDateString('ko-KR')}
            </span>
          </div>
          {label.actionTaken && (
            <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginBottom: 4 }}>
              조치: {label.actionTaken}
            </div>
          )}

          {/* Follow-up 타임라인 */}
          {label.followUps.length > 0 && (
            <div style={{ marginTop: 6, paddingLeft: 12, borderLeft: '2px solid var(--ct-border)' }}>
              {label.followUps.map((fu) => (
                <div key={fu.followUpId} style={{
                  position: 'relative',
                  paddingLeft: 12,
                  paddingBottom: 6,
                  marginBottom: 4,
                }}>
                  {/* 타임라인 점 */}
                  <div style={{
                    position: 'absolute',
                    left: -7,
                    top: 3,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: statusColor(fu.status),
                    border: '2px solid var(--ct-card)',
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: statusColor(fu.status),
                    }}>
                      D+{fu.daysSinceLabel} {statusLabel(fu.status)}
                    </span>
                    {fu.temperature && (
                      <span style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>
                        {fu.temperature.toFixed(1)}°C
                      </span>
                    )}
                    {fu.treatmentChanged && (
                      <span style={{
                        fontSize: 8,
                        padding: '0 4px',
                        borderRadius: 3,
                        background: 'rgba(239,68,68,0.15)',
                        color: '#ef4444',
                        fontWeight: 700,
                      }}>
                        처방변경
                      </span>
                    )}
                  </div>
                  {fu.clinicalNotes && (
                    <div style={{ fontSize: 9, color: 'var(--ct-text-muted)', marginTop: 2 }}>
                      {fu.clinicalNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {label.followUps.length === 0 && (
            <div style={{ fontSize: 9, color: 'var(--ct-text-muted)', fontStyle: 'italic', marginTop: 4 }}>
              예후 기록 없음 — 추적을 시작하세요
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── 관찰 유형 상수 ──

const OBSERVATION_TYPES: readonly { readonly value: string; readonly label: string; readonly icon: string }[] = [
  { value: 'calving', label: '분만', icon: '🐣' },
  { value: 'insemination', label: '수정', icon: '💉' },
  { value: 'hoof_treatment', label: '발굽치료', icon: '🦶' },
  { value: 'treatment', label: '치료/투약', icon: '💊' },
  { value: 'vaccination', label: '예방접종', icon: '🛡️' },
  { value: 'clinical_exam', label: '임상검사', icon: '🩺' },
  { value: 'body_condition', label: '체형평가', icon: '📏' },
  { value: 'behavior_change', label: '행동변화', icon: '👀' },
  { value: 'feed_change', label: '사료변경', icon: '🌾' },
  { value: 'general_note', label: '일반관찰', icon: '📝' },
];

const OBS_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  OBSERVATION_TYPES.map((t) => [t.value, `${t.icon} ${t.label}`]),
);

// ── ObservationForm ──

function ObservationForm({ animalId, farmId, onSubmit, isSubmitting: submitting }: {
  readonly animalId: string;
  readonly farmId: string;
  readonly onSubmit: (data: SubmitObservationRequest) => void;
  readonly isSubmitting: boolean;
}): React.JSX.Element {
  const [obsType, setObsType] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [temperature, setTemperature] = useState('');
  const [medication, setMedication] = useState('');

  const handleSubmit = (): void => {
    if (!obsType || !description.trim()) return;
    onSubmit({
      animalId,
      farmId,
      observationType: obsType,
      description: description.trim(),
      temperature: temperature ? parseFloat(temperature) : undefined,
      medication: medication || undefined,
    });
    // 제출 후 초기화
    setObsType(null);
    setDescription('');
    setTemperature('');
    setMedication('');
  };

  return (
    <div style={{
      marginTop: 12,
      padding: '12px 0 0',
      borderTop: '1px solid var(--ct-border)',
    }}>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--ct-text)',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span>📋</span>
        <span>임상 관찰 기록</span>
        <span style={{ fontSize: 10, color: 'var(--ct-text-muted)', fontWeight: 400 }}>
          (센서가 잡지 못하는 현장 기록 → AI 학습)
        </span>
      </div>

      {/* 관찰 유형 선택 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
        {OBSERVATION_TYPES.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setObsType(obsType === opt.value ? null : opt.value)}
            style={{
              padding: '4px 8px',
              borderRadius: 6,
              border: obsType === opt.value
                ? '2px solid var(--ct-primary)'
                : '1px solid var(--ct-border)',
              background: obsType === opt.value ? 'rgba(0,214,126,0.1)' : 'transparent',
              color: obsType === opt.value ? 'var(--ct-primary)' : 'var(--ct-text-secondary)',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {opt.icon} {opt.label}
          </button>
        ))}
      </div>

      {obsType && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            placeholder="관찰 내용을 자세히 기록하세요 (예: 오늘 아침 분만, 암송아지, 정상 분만...)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--ct-border)',
              background: 'rgba(0,0,0,0.15)',
              color: 'var(--ct-text)',
              fontSize: 12,
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>체온:</span>
              <input
                type="number"
                step="0.1"
                placeholder="39.0"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                style={{
                  width: 70,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--ct-border)',
                  background: 'rgba(0,0,0,0.15)',
                  color: 'var(--ct-text)',
                  fontSize: 11,
                  outline: 'none',
                }}
              />
            </div>
            <input
              type="text"
              placeholder="약물/처치 (선택)"
              value={medication}
              onChange={(e) => setMedication(e.target.value)}
              style={{
                flex: 1,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid var(--ct-border)',
                background: 'rgba(0,0,0,0.15)',
                color: 'var(--ct-text)',
                fontSize: 11,
                outline: 'none',
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !description.trim()}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: 'none',
              background: submitting || !description.trim()
                ? 'var(--ct-text-muted)'
                : 'linear-gradient(135deg, #06b6d4, #0284c7)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: submitting || !description.trim() ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.3px',
            }}
          >
            {submitting ? '저장 중...' : '📋 관찰 기록 → 팅커벨 AI 학습'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── ObservationTimeline ──

function ObservationTimeline({ observations }: {
  readonly observations: readonly ClinicalObservation[];
}): React.JSX.Element {
  if (observations.length === 0) return <></>;

  return (
    <div style={{
      marginTop: 10,
      padding: '10px 0 0',
      borderTop: '1px solid var(--ct-border)',
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--ct-text-muted)',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <span>📋</span>
        <span>임상 관찰 이력</span>
        <span style={{ fontSize: 9, color: 'var(--ct-text-muted)', fontWeight: 400 }}>
          ({observations.length}건)
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {observations.slice(0, 10).map((obs) => (
          <div key={obs.observationId} style={{
            padding: '6px 10px',
            borderRadius: 6,
            background: 'rgba(0,0,0,0.08)',
            border: '1px solid var(--ct-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#06b6d4' }}>
                {OBS_TYPE_LABELS[obs.observationType] ?? obs.observationType}
              </span>
              <span style={{ fontSize: 9, color: 'var(--ct-text-muted)', marginLeft: 'auto' }}>
                {new Date(obs.observedAt).toLocaleDateString('ko-KR')}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--ct-text-secondary)', lineHeight: 1.5 }}>
              {obs.description.length > 80 ? obs.description.slice(0, 80) + '...' : obs.description}
            </div>
            {(obs.temperature ?? obs.medication) && (
              <div style={{ fontSize: 9, color: 'var(--ct-text-muted)', marginTop: 2 }}>
                {obs.temperature ? `${obs.temperature.toFixed(1)}°C` : ''}
                {obs.temperature && obs.medication ? ' · ' : ''}
                {obs.medication ?? ''}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 메인 모달 ──

export function AlarmLabelChatModal({ animalId, initialEventId, onClose }: Props): React.JSX.Element {
  const [events, setEvents] = useState<readonly AnimalEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId ?? null);
  const [context, setContext] = useState<EventContext | null>(null);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [labelSuccess, setLabelSuccess] = useState(false);
  const [labelHistory, setLabelHistory] = useState<readonly LabelWithFollowUps[]>([]);
  const [isFollowUpSubmitting, setIsFollowUpSubmitting] = useState(false);
  const [followUpSuccess, setFollowUpSuccess] = useState(false);
  const [sensorSummary, setSensorSummary] = useState<string | null>(null);
  const [sensorAnomalies, setSensorAnomalies] = useState<readonly string[]>([]);
  const [animalInfo, setAnimalInfo] = useState<AnimalInfo | null>(null);
  const [observations, setObservations] = useState<readonly ClinicalObservation[]>([]);
  const [isObsSubmitting, setIsObsSubmitting] = useState(false);
  const [obsSuccess, setObsSuccess] = useState(false);
  const [savingRecordId, setSavingRecordId] = useState<string | null>(null);
  const [savedRecordIds, setSavedRecordIds] = useState<ReadonlySet<string>>(new Set());

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);

  // i18n — 컴포넌트 본체에서는 eventTypeLabel만 사용 (sub-components는 자체 useT)
  const t = useT();
  const eventTypeLabel = useCallback((eventType: string): string => {
    const localized = t(`event.${eventType}`);
    // 키가 dict에 없으면 t()는 키 자체 반환 — 그 경우 raw eventType 표시
    return localized === `event.${eventType}` ? eventType : localized;
  }, [t]);

  const handleVoiceResult = useCallback((text: string) => {
    setInput(text);
    setTimeout(() => {
      const sendBtn = document.querySelector('[data-send-btn]') as HTMLButtonElement | null;
      sendBtn?.click();
    }, 100);
  }, []);
  const voice = useVoiceInput(handleVoiceResult);

  // OpenAI Nova 음성 출력 — 라벨링 모달은 기본 OFF (긴 진단 대화는 화면이 더 효과적)
  const voiceOutput = useVoiceOutput({
    voice: 'nova',
    maxChars: 500,
    initialVoiceMode: false,
    storageKey: 'cowtalk:label-chat:voice-mode',
  });

  // 센서 이상 여부 확인 (이벤트 없어도 z-score 기반 이상 감지)
  useEffect(() => {
    apiGet<{ metrics: Record<string, readonly { ts: number; value: number }[]> }>(
      `/unified-dashboard/animal/${animalId}/sensor-chart?days=7`
    ).then((res: { metrics: Record<string, readonly { ts: number; value: number }[]> }) => {
      const anomalies: string[] = [];
      const THRESHOLDS: Record<string, { label: string; min: number; max: number; unit: string }> = {
        temp: { label: '체온', min: 38.0, max: 39.3, unit: '°C' },
        act: { label: '활동', min: 50, max: 500, unit: 'I/24h' },
        rum: { label: '반추', min: 300, max: 600, unit: '분' },
      };
      for (const [key, cfg] of Object.entries(THRESHOLDS)) {
        const pts = res.metrics[key];
        if (!pts || pts.length === 0) continue;
        const latest = pts[pts.length - 1]!.value;
        if (latest < cfg.min || latest > cfg.max) {
          anomalies.push(`${cfg.label} ${latest.toFixed(1)}${cfg.unit} (정상 ${cfg.min}~${cfg.max})`);
        }
      }
      setSensorAnomalies(anomalies);
    }).catch(() => {});
  }, [animalId]);

  // 동물 기본 정보 + 이벤트 목록 + 관찰 기록 로드
  useEffect(() => {
    getAnimalInfo(animalId).then((info) => setAnimalInfo(info)).catch(() => {});
    getObservations(animalId).then((data) => setObservations(data)).catch(() => {});
    getAnimalEvents(animalId).then((data) => {
      setEvents(data);
      if (!selectedEventId && data.length > 0) {
        setSelectedEventId(data[0]!.eventId);
      }
    }).catch(() => {
      // ignore
    });
  }, [animalId, selectedEventId]);

  // 이벤트 선택 시 컨텍스트 로드 / 이벤트 없는 소는 바로 AI 대화 시작
  useEffect(() => {
    if (selectedEventId) {
      // 이벤트가 있는 경우
      setContext(null);
      setMessages([]);
      setLabelSuccess(false);
      setFollowUpSuccess(false);
      setLabelHistory([]);

      getEventContext(selectedEventId).then((ctx) => {
        setContext(ctx);
        setMessages([{
          id: 'system-0',
          role: 'system',
          content: `${ctx.farmName} | ${ctx.earTag} | ${eventTypeLabel(ctx.eventType)} (${ctx.severity}) — AI와 대화하며 현장 확인 결과를 레이블링하세요.`,
        }]);
      }).catch(() => {});

      getLabelHistory(selectedEventId).then((history) => {
        setLabelHistory(history);
      }).catch(() => {});
    } else if (animalInfo && events.length === 0) {
      // 이벤트가 없는 소 → 센서 이상 여부에 따라 메시지 변경
      const hasAnomalies = sensorAnomalies.length > 0;
      const anomalyText = hasAnomalies
        ? `센서 이상 감지: ${sensorAnomalies.join(', ')}`
        : '이벤트 없음 (정상)';
      setMessages([{
        id: 'system-0',
        role: 'system',
        content: `${animalInfo.farmName} | ${animalInfo.earTag} | ${anomalyText} — AI와 대화하며 ${hasAnomalies ? '이상 원인을 분석' : '정상 상태 확인'}하세요.`,
      }]);
    }
  }, [selectedEventId, animalInfo, events.length, sensorAnomalies]);

  // 자동 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 메시지 전송
  // AI 채팅 가능 여부: 이벤트 컨텍스트가 있거나, 이벤트 없는 소의 기본 정보가 있으면 가능
  const canChat = context !== null || (animalInfo !== null && events.length === 0);

  const handleSend = useCallback((): void => {
    if (!input.trim() || isStreaming || !canChat) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    };

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsStreaming(true);

    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // 이벤트 컨텍스트를 직렬화하여 AI에 전달 (센서 데이터 + 동물 프로필 포함)
    const eventContextStr = context
      ? [
          `이벤트ID: ${context.eventId}`,
          `이벤트타입: ${context.eventType} (smaXtec: ${context.smaxtecOriginalType})`,
          `심각도: ${context.severity}`,
          `감지시간: ${context.detectedAt}`,
          `동물: ${context.earTag} (${context.animalId})`,
          `농장: ${context.farmName} (${context.farmId})`,
          `센서요약: ${context.sensorSummary}`,
          `최근이력: ${context.recentHistory.slice(0, 5).map((h) => `${h.eventType}(${h.severity}) ${h.detectedAt}`).join(', ')}`,
          context.currentLabels.length > 0
            ? `기존레이블: ${context.currentLabels.map((l) => `${l.verdict}${l.actualDiagnosis ? ': ' + l.actualDiagnosis : ''}`).join(', ')}`
            : '기존레이블: 없음',
          sensorSummary ? `\n--- 실시간 센서 데이터 ---\n${sensorSummary}` : '',
        ].filter(Boolean).join('\n')
      : [
          `동물: ${animalInfo?.earTag ?? '?'} (${animalId})`,
          `농장: ${animalInfo?.farmName ?? '?'} (${animalInfo?.farmId ?? '?'})`,
          `품종: ${animalInfo?.breed ?? '?'} | 성별: ${animalInfo?.sex ?? '?'}`,
          '이벤트: 없음 (정상 상태 확인)',
          sensorSummary ? `\n--- 실시간 센서 데이터 ---\n${sensorSummary}` : '',
        ].filter(Boolean).join('\n');

    let accumulatedAnswer = '';
    const cancel = streamLabelChat(
      {
        question: input.trim(),
        eventId: context?.eventId ?? `normal-check-${animalId}`,
        animalId: context?.animalId ?? animalId,
        farmId: context?.farmId ?? animalInfo?.farmId,
        conversationHistory: history,
        eventContext: eventContextStr,
      },
      (chunk) => {
        accumulatedAnswer += chunk;
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
          }
          return updated;
        });
      },
      () => {
        setIsStreaming(false);
        // 음성 모드 ON일 때 자동 재생
        if (voiceOutput.voiceMode && accumulatedAnswer.trim()) {
          void voiceOutput.speakText(accumulatedAnswer).catch(() => { /* silent */ });
        }
      },
      (err) => {
        setIsStreaming(false);
        const errMsg = err?.message ?? 'AI 응답 오류';
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === 'assistant' && last.content === '') {
            updated[updated.length - 1] = { ...last, content: `⚠️ ${errMsg}\n\n잠시 후 다시 시도해 주세요.` };
          }
          return updated;
        });
      },
      (records) => {
        // AI가 대화에서 기록을 추출함 → 마지막 어시스턴트 메시지에 첨부
        if (records.length > 0) {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            const last = updated[lastIdx];
            if (last && last.role === 'assistant') {
              updated[lastIdx] = { ...last, extractedRecords: records };
            }
            return updated;
          });
        }
      },
    );

    cancelStreamRef.current = cancel;
  }, [input, isStreaming, canChat, context, animalInfo, animalId, messages, sensorSummary]);

  // 추출된 기록 확인 & 저장
  const handleConfirmRecord = useCallback(async (record: ExtractedRecordClient): Promise<void> => {
    const recordKey = `${record.eventType}-${record.summary}`;
    setSavingRecordId(recordKey);
    try {
      const conversationSummary = messages
        .filter((m) => m.role !== 'system')
        .map((m) => `[${m.role}]: ${m.content.slice(0, 200)}`)
        .join('\n');

      await saveConversationRecord({
        animalId: context?.animalId ?? animalId,
        farmId: context?.farmId ?? animalInfo?.farmId ?? '',
        record,
        conversationSummary,
      });

      setSavedRecordIds((prev) => new Set([...prev, recordKey]));

      // 관찰 기록 목록 갱신
      if (animalId) {
        getObservations(animalId).then(setObservations).catch(() => {});
      }
    } catch {
      // 에러 시 무시 (UI에서 버튼 다시 시도 가능)
    } finally {
      setSavingRecordId(null);
    }
  }, [messages, context, animalId, animalInfo]);

  // 레이블 제출
  const handleLabelSubmit = useCallback(async (data: {
    verdict: LabelVerdict;
    actualDiagnosis?: string;
    actionTaken?: string;
    outcome?: LabelOutcome;
    notes?: string;
  }): Promise<void> => {
    if (!context) return;
    setIsSubmitting(true);

    // AI 대화 요약 생성
    const assistantMessages = messages.filter((m) => m.role === 'assistant' && m.content);
    const conversationSummary = assistantMessages.length > 0
      ? assistantMessages.map((m) => m.content).join(' | ').slice(0, 500)
      : undefined;

    try {
      await submitLabel({
        eventId: context.eventId,
        animalId: context.animalId,
        farmId: context.farmId,
        verdict: data.verdict,
        actualDiagnosis: data.actualDiagnosis,
        actionTaken: data.actionTaken,
        outcome: data.outcome,
        notes: data.notes,
        conversationSummary,
      });
      setLabelSuccess(true);

      // 이벤트 목록 + 레이블 히스토리 새로고침
      const refreshed = await getAnimalEvents(animalId);
      setEvents(refreshed);
      const history = await getLabelHistory(context.eventId);
      setLabelHistory(history);
    } catch {
      // ignore — error shown in UI
    } finally {
      setIsSubmitting(false);
    }
  }, [context, messages, animalId]);

  // 예후 기록 제출
  const handleFollowUpSubmit = useCallback(async (data: SubmitFollowUpRequest): Promise<void> => {
    if (!context) return;
    setIsFollowUpSubmitting(true);

    // AI 대화 요약 (예후 기록 시에도 AI와 대화한 내용 포함)
    const assistantMessages = messages.filter((m) => m.role === 'assistant' && m.content);
    const conversationSummary = assistantMessages.length > 0
      ? assistantMessages.map((m) => m.content).join(' | ').slice(0, 500)
      : undefined;

    try {
      await submitFollowUp({ ...data, conversationSummary });
      setFollowUpSuccess(true);

      // 레이블 히스토리 새로고침
      const history = await getLabelHistory(context.eventId);
      setLabelHistory(history);

      // 3초 후 성공 메시지 숨김
      setTimeout(() => setFollowUpSuccess(false), 3000);
    } catch {
      // ignore
    } finally {
      setIsFollowUpSubmitting(false);
    }
  }, [context, messages]);

  // 임상 관찰 기록 제출
  const handleObservationSubmit = useCallback(async (data: SubmitObservationRequest): Promise<void> => {
    setIsObsSubmitting(true);

    const assistantMessages = messages.filter((m) => m.role === 'assistant' && m.content);
    const conversationSummary = assistantMessages.length > 0
      ? assistantMessages.map((m) => m.content).join(' | ').slice(0, 500)
      : undefined;

    try {
      await submitObservation({ ...data, conversationSummary });
      setObsSuccess(true);
      const refreshed = await getObservations(animalId);
      setObservations(refreshed);
      setTimeout(() => setObsSuccess(false), 3000);
    } catch {
      // ignore
    } finally {
      setIsObsSubmitting(false);
    }
  }, [messages, animalId]);

  // 키보드 단축키
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 추천 질문 — 이벤트 타입/센서 상황별 동적 생성
  const earTag = context?.earTag ?? animalInfo?.earTag ?? '?';
  const suggestedQuestions = generateSuggestedQuestions(context, animalInfo, earTag);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '95vw',
        maxWidth: 1500,
        height: '88vh',
        background: 'var(--ct-card)',
        borderRadius: 18,
        border: '1px solid var(--ct-border)',
        display: 'flex',
        overflow: 'hidden',
      }}>
        {/* ── 좌측: 이벤트 컨텍스트 패널 ── */}
        <div style={{
          width: 260,
          borderRight: '1px solid var(--ct-border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* 헤더 */}
          <div style={{
            padding: '16px 14px',
            borderBottom: '1px solid var(--ct-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>🧠</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ct-text)' }}>
                팅커벨 AI
              </div>
              <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
                현장 확인 → AI 지식 강화
              </div>
            </div>
          </div>

          {/* 동물 정보 카드 (이벤트 유무와 관계없이 항상 표시) */}
          {animalInfo && (
            <div style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--ct-border)',
            }}>
              <div style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: context
                  ? `${SEVERITY_COLORS[context.severity] ?? '#94a3b8'}11`
                  : 'rgba(34,197,94,0.06)',
                border: context
                  ? `1px solid ${SEVERITY_COLORS[context.severity] ?? '#94a3b8'}33`
                  : '1px solid rgba(34,197,94,0.2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ct-text)' }}>
                    {animalInfo.earTag}
                  </span>
                  {context ? (
                    <span style={{
                      fontSize: 9,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: `${SEVERITY_COLORS[context.severity] ?? '#94a3b8'}22`,
                      color: SEVERITY_COLORS[context.severity] ?? '#94a3b8',
                      fontWeight: 600,
                    }}>
                      {context.severity}
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 9,
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: 'rgba(34,197,94,0.15)',
                      color: '#22c55e',
                      fontWeight: 600,
                    }}>
                      정상
                    </span>
                  )}
                  <span style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>
                    {animalInfo.breed} · {animalInfo.sex === 'female' ? '♀' : '♂'}
                  </span>
                </div>

                {context ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text-secondary)', marginBottom: 2 }}>
                      {eventTypeLabel(context.eventType)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
                      {context.farmName} | {new Date(context.detectedAt).toLocaleString('ko-KR')}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 4 }}>
                      {context.sensorSummary}
                    </div>
                  </>
                ) : (
                  <>
                    {sensorAnomalies.length > 0 ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#f97316', marginBottom: 2 }}>
                          ⚠️ 센서 이상 감지
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
                          {animalInfo.farmName} | smaXtec 이벤트는 없으나 센서값 이상
                        </div>
                        <div style={{ fontSize: 10, color: '#f97316', marginTop: 4, lineHeight: 1.5 }}>
                          {sensorAnomalies.map((a, i) => (
                            <div key={i}>• {a}</div>
                          ))}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                          AI에게 원인 분석을 요청하세요.
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#22c55e', marginBottom: 2 }}>
                          최근 7일 이벤트 없음
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
                          {animalInfo.farmName} | 정상 확인 레이블 가능
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                          센서 데이터를 확인하고 AI와 대화하며
                          정상 상태 확인 또는 관찰 소견을 기록하세요.
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* 이벤트 목록 */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '12px 14px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ct-text-muted)', marginBottom: 8 }}>
              {events.length > 0 ? `최근 이벤트 (${events.length}건)` : '최근 이벤트 없음'}
            </div>
            {events.length > 0 ? (
              <EventSelector
                events={events}
                selectedId={selectedEventId}
                onSelect={setSelectedEventId}
                eventTypeLabel={eventTypeLabel}
              />
            ) : (
              <div style={{
                padding: '16px 12px',
                textAlign: 'center',
                fontSize: 11,
                color: 'var(--ct-text-muted)',
                borderRadius: 8,
                background: sensorAnomalies.length > 0 ? 'rgba(249,115,22,0.1)' : 'rgba(0,0,0,0.05)',
              }}>
                {sensorAnomalies.length > 0 ? (
                  <>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>⚠️</div>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#f97316' }}>센서값 이상 감지</div>
                    <div style={{ fontSize: 10, lineHeight: 1.5 }}>
                      smaXtec 이벤트는 미발생이나 센서 데이터 분석 결과 이상이 감지되었습니다.
                      AI에게 상세 분석을 요청하세요.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>✅</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>이벤트가 없는 정상 개체</div>
                    <div style={{ fontSize: 10, lineHeight: 1.5 }}>
                      정상 개체도 관찰 기록을 남길 수 있습니다.
                      AI와 대화하며 현재 상태를 확인하세요.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 팅커벨 AI 배지 */}
          <div style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--ct-border)',
            background: 'rgba(99,102,241,0.05)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', marginBottom: 2 }}>
              🧚 팅커벨 AI Knowledge Loop
            </div>
            <div style={{ fontSize: 9, color: 'var(--ct-text-muted)', lineHeight: 1.5 }}>
              현장 전문가의 레이블이 국가별 고유 AI 지식으로 축적됩니다.
              센서는 해외 기술이지만, 레이블 데이터는 대한민국의 고유 자산입니다.
            </div>
          </div>
        </div>

        {/* ── 중앙: 센서 데이터 차트 + 동물 프로필 ── */}
        <SensorDataPanel
          animalId={animalId}
          selectedEventId={selectedEventId}
          onDataLoaded={setSensorSummary}
        />

        {/* ── 우측: AI 대화 + 레이블 ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* 헤더 */}
          <div style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--ct-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 6px #22c55e88',
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>
                팅커벨 AI 어시스턴트
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--ct-text-muted)',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                padding: '4px 8px',
              }}
            >
              ✕
            </button>
          </div>

          {/* smaXtec 스타일 개체 메타데이터 바 */}
          {animalInfo && (
            <div style={{
              padding: '8px 18px',
              borderBottom: '1px solid var(--ct-border)',
              background: 'rgba(0,0,0,0.12)',
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              flexWrap: 'nowrap',
              overflowX: 'auto',
            }}>
              {[
                { label: '관리번호', value: animalInfo.earTag, icon: '🐄' },
                { label: '산차', value: animalInfo.parity > 0 ? `${animalInfo.parity}산` : '미경산', icon: '🔄' },
                { label: 'DIM', value: animalInfo.daysInMilk != null ? `${animalInfo.daysInMilk}일` : '—', icon: '📅' },
                {
                  label: '비유상태',
                  value: (
                    animalInfo.lactationStatus === 'milking' ? '착유중' :
                    animalInfo.lactationStatus === 'dry' ? '건유' :
                    animalInfo.lactationStatus === 'pregnant' ? '임신중' :
                    animalInfo.lactationStatus === 'open' ? '공태' :
                    animalInfo.lactationStatus === 'heifer' ? '육성우' :
                    animalInfo.lactationStatus
                  ),
                  icon: '🥛',
                },
                { label: '품종', value: animalInfo.breed, icon: '🧬' },
              ].map((item, idx, arr) => (
                <React.Fragment key={item.label}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '0 12px',
                    minWidth: 60,
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 9, color: 'var(--ct-text-muted)', marginBottom: 1 }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ct-text)', whiteSpace: 'nowrap' }}>
                      {item.icon} {item.value}
                    </span>
                  </div>
                  {idx < arr.length - 1 && (
                    <span style={{ color: 'var(--ct-border)', fontSize: 14, flexShrink: 0 }}>|</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* 채팅 영역 */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px 18px',
          }}>
            {messages.map((msg) => (
              <React.Fragment key={msg.id}>
                <ChatBubble message={msg} />
                {msg.extractedRecords && msg.extractedRecords.length > 0 && (
                  <div style={{ padding: '0 4px' }}>
                    {msg.extractedRecords.map((rec) => {
                      const recordKey = `${rec.eventType}-${rec.summary}`;
                      return (
                        <ExtractedRecordCard
                          key={recordKey}
                          record={rec}
                          onConfirm={handleConfirmRecord}
                          onDismiss={() => {
                            setMessages((prev) => prev.map((m) =>
                              m.id === msg.id
                                ? { ...m, extractedRecords: m.extractedRecords?.filter((r) => r !== rec) }
                                : m,
                            ));
                          }}
                          saving={savingRecordId === recordKey}
                          saved={savedRecordIds.has(recordKey)}
                        />
                      );
                    })}
                  </div>
                )}
              </React.Fragment>
            ))}
            {isStreaming && (
              <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', padding: '4px 0' }}>
                AI 응답 중...
              </div>
            )}
            <div ref={chatEndRef} />

            {/* 추천 질문 (대화 시작 전) */}
            {messages.length <= 1 && canChat && suggestedQuestions.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--ct-text-muted)', marginBottom: 8 }}>
                  AI에게 물어보세요:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setInput(q);
                        inputRef.current?.focus();
                      }}
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--ct-border)',
                        background: 'rgba(0,0,0,0.1)',
                        color: 'var(--ct-text-secondary)',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 음성 인식 에러 배너 */}
          {voice.error && (
            <div
              role="alert"
              onClick={voice.dismissError}
              style={{
                margin: '0 18px',
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444',
                fontSize: 12,
                lineHeight: 1.4,
                cursor: 'pointer',
              }}
            >
              {voice.error.message}
              <span style={{ opacity: 0.7, marginLeft: 6, fontSize: 10 }}>(클릭해서 닫기)</span>
            </div>
          )}

          {/* 입력 영역 */}
          <div style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--ct-border)',
          }}>
            <div style={{
              display: 'flex',
              gap: 8,
              marginBottom: canChat ? 12 : 0,
            }}>
              <MicButton
                isListening={voice.isListening}
                onClick={voice.isListening ? voice.stopListening : () => { void voice.startListening(); }}
                disabled={isStreaming || !canChat}
                size={34}
              />

              {/* 음성 답변 토글 — Nova 음성 ON/OFF */}
              <button
                type="button"
                onClick={voiceOutput.toggleVoiceMode}
                disabled={!canChat}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: voiceOutput.voiceMode ? 'var(--ct-primary)' : 'var(--ct-bg)',
                  color: voiceOutput.voiceMode ? '#ffffff' : 'var(--ct-text-secondary)',
                  border: '1px solid var(--ct-border)',
                  cursor: canChat ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.2s',
                }}
                title={voiceOutput.voiceMode ? '음성 답변 ON — 클릭하여 끄기' : '음성 답변 OFF — 클릭하여 켜기'}
                aria-label={voiceOutput.voiceMode ? '음성 답변 끄기' : '음성 답변 켜기'}
                aria-pressed={voiceOutput.voiceMode}
              >
                {voiceOutput.voiceMode ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <line x1="23" y1="9" x2="17" y2="15"/>
                    <line x1="17" y1="9" x2="23" y2="15"/>
                  </svg>
                )}
              </button>
              <input
                ref={inputRef}
                type="text"
                placeholder={voice.isListening ? '듣는 중...' : (context ? 'AI에게 이 알람에 대해 질문하세요...' : 'AI에게 이 소에 대해 질문하세요...')}
                value={voice.isListening ? voice.transcript : input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isStreaming || !canChat}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--ct-border)',
                  background: 'rgba(0,0,0,0.15)',
                  color: 'var(--ct-text)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                data-send-btn
                onClick={handleSend}
                disabled={isStreaming || !input.trim() || !canChat}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: isStreaming || !input.trim()
                    ? 'var(--ct-text-muted)'
                    : 'var(--ct-primary)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}
              >
                전송
              </button>
            </div>

            {/* 레이블 폼 */}
            {context && !labelSuccess && (
              <LabelForm
                context={context}
                onSubmit={handleLabelSubmit}
                isSubmitting={isSubmitting}
              />
            )}

            {/* 레이블 성공 메시지 */}
            {labelSuccess && (
              <div style={{
                padding: '14px 16px',
                borderRadius: 10,
                background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: 12,
              }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
                    레이블 저장 완료
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
                    팅커벨 AI 지식 강화 루프에 반영되었습니다. 아래에서 예후를 추적하세요.
                  </div>
                </div>
              </div>
            )}

            {/* 예후 추적: 기존 레이블이 있으면 follow-up 폼 표시 */}
            {context && labelHistory.length > 0 && (
              <>
                <FollowUpTimeline labelHistory={labelHistory} />
                <FollowUpForm
                  labelId={labelHistory[0]!.labelId}
                  eventId={context.eventId}
                  animalId={context.animalId}
                  onSubmit={handleFollowUpSubmit}
                  isSubmitting={isFollowUpSubmitting}
                />
              </>
            )}

            {/* 예후 성공 메시지 */}
            {followUpSuccess && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(249,115,22,0.1)',
                border: '1px solid rgba(249,115,22,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
              }}>
                <span style={{ fontSize: 16 }}>📋</span>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#f97316' }}>
                  예후 기록 저장 — 팅커벨 AI가 인과관계를 학습합니다
                </div>
              </div>
            )}

            {/* ── 임상 관찰 기록 (모든 소 공통) ── */}
            {animalInfo && (
              <>
                <ObservationTimeline observations={observations} />
                <ObservationForm
                  animalId={animalId}
                  farmId={context?.farmId ?? animalInfo.farmId}
                  onSubmit={handleObservationSubmit}
                  isSubmitting={isObsSubmitting}
                />
              </>
            )}

            {/* 관찰 기록 성공 메시지 */}
            {obsSuccess && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(6,182,212,0.1)',
                border: '1px solid rgba(6,182,212,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
              }}>
                <span style={{ fontSize: 16 }}>📋</span>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#06b6d4' }}>
                  임상 관찰 기록 저장 — 팅커벨 AI 학습 자료로 축적됩니다
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
