// 대화-즉-기록: AI가 추출한 구조화 기록 확인 카드
// 채팅 메시지 사이에 인라인으로 표시
// 사용자가 확인/수정 후 저장

import React, { useState } from 'react';
import type { ExtractedRecordClient } from '@web/api/label-chat.api';

// ── 이벤트 유형별 설정 ──

const EVENT_CONFIG: Readonly<Record<string, { label: string; icon: string; color: string }>> = {
  insemination: { label: '수정', icon: '💉', color: '#8b5cf6' },
  calving: { label: '분만', icon: '🐄', color: '#ec4899' },
  treatment: { label: '치료/투약', icon: '💊', color: '#3b82f6' },
  mastitis: { label: '유방염', icon: '🔴', color: '#ef4444' },
  hoof_treatment: { label: '발굽 치료', icon: '🦶', color: '#f97316' },
  vaccination: { label: '예방접종', icon: '🛡️', color: '#22c55e' },
  abortion: { label: '유산', icon: '⚠️', color: '#dc2626' },
  clinical_exam: { label: '임상 검진', icon: '🩺', color: '#6366f1' },
  behavior_change: { label: '행동 변화', icon: '👁️', color: '#eab308' },
  feed_change: { label: '사료 변경', icon: '🌾', color: '#84cc16' },
  general_observation: { label: '일반 관찰', icon: '📋', color: '#64748b' },
};

// ── 필드 한국어 라벨 ──

const FIELD_LABELS: Readonly<Record<string, string>> = {
  semenId: '정액 번호',
  inseminationTime: '수정 시각',
  estrusLevel: '발정 강도',
  inseminatorName: '수정사',
  method: '수정 방법',
  calfSex: '송아지 성별',
  birthType: '분만 유형',
  calfStatus: '송아지 상태',
  calfWeight: '송아지 체중',
  placentaExpelled: '태반 배출',
  calvingTime: '분만 시각',
  diagnosis: '진단',
  medication: '약물',
  dosage: '용량',
  route: '투여 경로',
  duration: '투약 기간',
  withdrawalPeriod: '출하 제한',
  treatedBy: '수의사',
  affectedQuarter: '감염 유방',
  severity: '중증도',
  cmtResult: 'CMT 결과',
  milkDiscarded: '우유 폐기',
  affectedLeg: '이환지',
  condition: '질환',
  treatment: '치료 내용',
  lameness_score: '파행 점수',
  vaccineType: '백신 종류',
  manufacturer: '제조사',
  batchNumber: '로트번호',
  nextDueDate: '다음 접종일',
  gestationDays: '임신 일수',
  possibleCause: '추정 원인',
  fetusCondition: '태아 상태',
  labSampleTaken: '검체 채취',
  temperature: '체온',
  bodyConditionScore: '체형점수',
  weight: '체중',
  notes: '비고',
};

const VALUE_LABELS: Readonly<Record<string, string>> = {
  strong: '강함',
  medium: '중간',
  weak: '약함',
  male: '수컷',
  female: '암컷',
  unknown: '미확인',
  normal: '정상',
  dystocia: '난산',
  cesarean: '제왕절개',
  alive: '생존',
  stillborn: '사산',
  mild: '경미',
  moderate: '중등',
  severe: '중증',
};

function formatValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return VALUE_LABELS[value] ?? value;
  return String(value);
}

// ── Props ──

interface Props {
  readonly record: ExtractedRecordClient;
  readonly onConfirm: (record: ExtractedRecordClient) => void;
  readonly onDismiss: () => void;
  readonly saving?: boolean;
  readonly saved?: boolean;
}

// ── 컴포넌트 ──

export function ExtractedRecordCard({ record, onConfirm, onDismiss, saving, saved }: Props): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const config = EVENT_CONFIG[record.eventType] ?? { label: record.eventType, icon: '📋', color: '#64748b' };
  const dataEntries = Object.entries(record.structuredData.data).filter(
    ([, v]) => v != null && v !== '',
  );

  if (saved) {
    return (
      <div
        style={{
          margin: '8px 0',
          padding: '10px 14px',
          borderRadius: 10,
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
        }}
      >
        <span style={{ color: '#22c55e', fontSize: 13 }}>
          ✅ {config.icon} {config.label} 기록이 저장되었습니다 → 팅커벨 AI 학습 데이터로 축적
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        margin: '8px 0',
        padding: '12px 14px',
        borderRadius: 10,
        background: 'rgba(99, 102, 241, 0.08)',
        border: `1px solid ${config.color}40`,
      }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{config.icon}</span>
        <span style={{ fontWeight: 600, fontSize: 13, color: config.color }}>
          {config.label} 기록 감지
        </span>
        <span
          style={{
            fontSize: 11,
            padding: '1px 6px',
            borderRadius: 4,
            background: record.confidence >= 0.8 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
            color: record.confidence >= 0.8 ? '#22c55e' : '#eab308',
          }}
        >
          확신도 {Math.round(record.confidence * 100)}%
        </span>
      </div>

      {/* 요약 */}
      <div style={{ fontSize: 13, color: 'var(--ct-text)', marginBottom: 8 }}>
        {record.summary}
      </div>

      {/* 추출된 필드 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 10 }}>
        {dataEntries.map(([key, value]) => (
          <div key={key} style={{ display: 'flex', gap: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--ct-text-secondary)', minWidth: 70 }}>
              {FIELD_LABELS[key] ?? key}:
            </span>
            {editing ? (
              <input
                defaultValue={formatValue(value)}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--ct-border)',
                  borderRadius: 4,
                  padding: '1px 4px',
                  fontSize: 12,
                  color: 'var(--ct-text)',
                }}
              />
            ) : (
              <span style={{ color: 'var(--ct-text)', fontWeight: 500 }}>
                {formatValue(value)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 누락 필드 안내 */}
      {record.missingFields.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--ct-text-secondary)', marginBottom: 8 }}>
          ℹ️ 미입력: {record.missingFields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}
        </div>
      )}

      {/* 버튼 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => onConfirm(record)}
          disabled={saving}
          style={{
            flex: 1,
            padding: '6px 12px',
            borderRadius: 6,
            border: 'none',
            background: config.color,
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? '저장 중...' : '✅ 확인 & 저장'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--ct-border)',
            background: 'transparent',
            color: 'var(--ct-text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {editing ? '취소' : '✏️ 수정'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--ct-border)',
            background: 'transparent',
            color: 'var(--ct-text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          무시
        </button>
      </div>
    </div>
  );
}
