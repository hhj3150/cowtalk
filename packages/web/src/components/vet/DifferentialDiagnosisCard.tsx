// 감별진단 카드 — 개체 프로필 페이지에서 질병 확률·센서 근거·확인검사 표시
// 수의사가 "감별진단 실행" 버튼을 눌러야 API 호출 (수동 트리거)

import React, { useState } from 'react';
import { CollapsibleCard } from '@web/components/common/CollapsibleCard';
import { useDifferentialDiagnosis } from '@web/hooks/useDifferentialDiagnosis';
import type {
  DiagnosisCandidate,
  SensorEvidence,
  FarmHistoryPattern,
} from '@cowtalk/shared';

// ── Props ──

interface DifferentialDiagnosisCardProps {
  readonly animalId: string;
}

// ── 상수 ──

const URGENCY_CONFIG: Readonly<Record<string, { label: string; color: string; bg: string }>> = {
  immediate:  { label: '즉시 조치 필요', color: '#ef4444', bg: '#fef2f2' },
  within_24h: { label: '24시간 이내 조치', color: '#f97316', bg: '#fff7ed' },
  routine:    { label: '정기 관찰', color: '#22c55e', bg: '#f0fdf4' },
};

const QUALITY_CONFIG: Readonly<Record<string, { label: string; color: string }>> = {
  good:         { label: '센서 양호', color: '#22c55e' },
  limited:      { label: '센서 제한적', color: '#eab308' },
  insufficient: { label: '센서 불충분', color: '#ef4444' },
};

const STATUS_ICON: Readonly<Record<string, { icon: string; color: string }>> = {
  supports:    { icon: '▲', color: '#ef4444' },
  contradicts: { icon: '▼', color: '#22c55e' },
  neutral:     { icon: '─', color: '#64748b' },
};

// ── 메인 컴포넌트 ──

export function DifferentialDiagnosisCard({
  animalId,
}: DifferentialDiagnosisCardProps): React.JSX.Element {
  const [triggered, setTriggered] = useState(false);
  const { data, isLoading, error } = useDifferentialDiagnosis(animalId, triggered);

  return (
    <CollapsibleCard title="🔬 감별진단" badge={data ? data.candidates.length : null} badgeColor="#8b5cf6">
      {!triggered ? (
        <TriggerButton onClick={() => setTriggered(true)} />
      ) : isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error instanceof Error ? error.message : '진단 실패'} onRetry={() => setTriggered(true)} />
      ) : data ? (
        <DiagnosisResult
          candidates={data.candidates}
          farmHistory={data.farmHistory}
          urgencyLevel={data.urgencyLevel}
          dataQuality={data.dataQuality}
        />
      ) : null}
    </CollapsibleCard>
  );
}

// ── 서브 컴포넌트 ──

function TriggerButton({ onClick }: { readonly onClick: () => void }): React.JSX.Element {
  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          padding: '10px 24px',
          borderRadius: 8,
          border: 'none',
          background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        🔬 감별진단 실행
      </button>
      <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 6 }}>
        센서 데이터 + 농장 이력 기반 질병 확률 분석
      </div>
    </div>
  );
}

function LoadingState(): React.JSX.Element {
  return (
    <div style={{ textAlign: 'center', padding: 24, color: 'var(--ct-text-muted)', fontSize: 13 }}>
      <div style={{ fontSize: 20, marginBottom: 8 }}>⏳</div>
      센서·이력 데이터 분석 중...
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <div style={{ textAlign: 'center', padding: 16 }}>
      <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>⚠️ {message}</div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '6px 16px',
          borderRadius: 6,
          border: '1px solid var(--ct-border)',
          background: 'var(--ct-card)',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        다시 시도
      </button>
    </div>
  );
}

// ── 진단 결과 ──

function DiagnosisResult({
  candidates,
  farmHistory,
  urgencyLevel,
  dataQuality,
}: {
  readonly candidates: readonly DiagnosisCandidate[];
  readonly farmHistory: readonly FarmHistoryPattern[];
  readonly urgencyLevel: string;
  readonly dataQuality: string;
}): React.JSX.Element {
  const urgency = URGENCY_CONFIG[urgencyLevel] ?? { label: '정기 관찰', color: '#22c55e', bg: '#f0fdf4' };
  const quality = QUALITY_CONFIG[dataQuality] ?? { label: '센서 제한적', color: '#eab308' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 긴급도 + 데이터 품질 배너 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        borderRadius: 8,
        background: urgency.bg,
        border: `1px solid ${urgency.color}30`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: urgency.color }}>
          {urgency.label}
        </span>
        <span style={{
          fontSize: 10,
          padding: '2px 8px',
          borderRadius: 12,
          background: `${quality.color}20`,
          color: quality.color,
          fontWeight: 600,
        }}>
          {quality.label}
        </span>
      </div>

      {/* 데이터 불충분 경고 */}
      {dataQuality === 'insufficient' && (
        <div style={{
          fontSize: 11,
          color: '#ef4444',
          padding: '6px 10px',
          borderRadius: 6,
          background: '#fef2f210',
          border: '1px dashed #ef444440',
        }}>
          ⚠️ 센서 데이터가 부족합니다. 볼루스 연결 상태를 확인하세요.
        </div>
      )}

      {/* 후보 질병 리스트 */}
      {candidates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 16, color: 'var(--ct-text-muted)', fontSize: 12 }}>
          현재 센서 데이터로는 특이 소견이 없습니다
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {candidates.map((c) => (
            <CandidateRow key={c.disease} candidate={c} />
          ))}
        </div>
      )}

      {/* 농장 이력 */}
      {farmHistory.length > 0 && <FarmHistorySection history={farmHistory} />}
    </div>
  );
}

// ── 후보 질병 행 ──

function CandidateRow({ candidate }: { readonly candidate: DiagnosisCandidate }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const probColor = candidate.probability >= 60 ? '#ef4444'
    : candidate.probability >= 30 ? '#f97316'
    : '#22c55e';

  return (
    <div style={{
      borderRadius: 8,
      border: '1px solid var(--ct-border)',
      background: 'var(--ct-card)',
      overflow: 'hidden',
    }}>
      {/* 요약 행 */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '10px 12px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {/* 질병명 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>
            {candidate.diseaseKo}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
            {candidate.disease}
          </div>
        </div>

        {/* 확률 바 */}
        <div style={{ width: 100, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            background: 'var(--ct-bg)',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(candidate.probability, 100)}%`,
              height: '100%',
              borderRadius: 3,
              background: probColor,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: probColor, minWidth: 32, textAlign: 'right' }}>
            {candidate.probability}%
          </span>
        </div>

        {/* 펼침 표시 */}
        <span style={{ fontSize: 10, color: 'var(--ct-text-muted)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          ▼
        </span>
      </button>

      {/* 상세 내용 */}
      {expanded && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 센서 근거 */}
          {candidate.evidence.length > 0 && (
            <EvidenceTable evidence={candidate.evidence} />
          )}

          {/* 매칭 증상 */}
          {candidate.matchingSymptoms.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ct-text-muted)', marginBottom: 4 }}>매칭 증상</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {candidate.matchingSymptoms.map((s) => (
                  <span key={s} style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: '#8b5cf620',
                    color: '#8b5cf6',
                    fontWeight: 500,
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 확인검사 */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ct-text-muted)', marginBottom: 4 }}>확인검사</div>
            <ol style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {candidate.confirmatoryTests.map((t, i) => (
                <li key={i} style={{ fontSize: 11, color: 'var(--ct-text)', lineHeight: 1.4 }}>
                  {t}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 센서 근거 테이블 ──

function EvidenceTable({ evidence }: { readonly evidence: readonly SensorEvidence[] }): React.JSX.Element {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ct-text-muted)', marginBottom: 4 }}>센서 근거</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: '2px 8px',
        fontSize: 11,
      }}>
        {/* 헤더 */}
        <div style={{ fontWeight: 600, color: 'var(--ct-text-muted)', fontSize: 10 }}>지표</div>
        <div style={{ fontWeight: 600, color: 'var(--ct-text-muted)', fontSize: 10, textAlign: 'right' }}>현재값</div>
        <div style={{ fontWeight: 600, color: 'var(--ct-text-muted)', fontSize: 10, textAlign: 'right' }}>정상범위</div>
        <div style={{ fontWeight: 600, color: 'var(--ct-text-muted)', fontSize: 10, textAlign: 'center' }}>판정</div>

        {/* 데이터 행 */}
        {evidence.map((e) => {
          const statusInfo = STATUS_ICON[e.status] ?? { icon: '─', color: '#64748b' };
          return (
            <React.Fragment key={e.metric}>
              <div style={{ color: 'var(--ct-text)' }}>{METRIC_LABELS[e.metric] ?? e.metric}</div>
              <div style={{ textAlign: 'right', color: 'var(--ct-text)', fontWeight: 600 }}>
                {e.currentValue != null ? e.currentValue.toFixed(1) : '─'}
              </div>
              <div style={{ textAlign: 'right', color: 'var(--ct-text-muted)' }}>{e.normalRange}</div>
              <div style={{ textAlign: 'center', color: statusInfo.color, fontWeight: 700 }}>
                {statusInfo.icon}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── 농장 이력 ──

function FarmHistorySection({ history }: { readonly history: readonly FarmHistoryPattern[] }): React.JSX.Element {
  const maxCount = Math.max(...history.map((h) => h.count), 1);

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ct-text-muted)', marginBottom: 4 }}>
        농장 최근 90일 진단 이력
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {history.map((h) => (
          <div key={h.diagnosis} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--ct-text)', minWidth: 60 }}>
              {DIAGNOSIS_KO[h.diagnosis] ?? h.diagnosis}
            </span>
            <div style={{
              flex: 1,
              height: 5,
              borderRadius: 3,
              background: 'var(--ct-bg)',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${(h.count / maxCount) * 100}%`,
                height: '100%',
                borderRadius: 3,
                background: '#64748b',
              }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--ct-text-muted)', minWidth: 20, textAlign: 'right' }}>
              {h.count}건
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 라벨 맵 ──

const METRIC_LABELS: Readonly<Record<string, string>> = {
  temperature: '체온',
  rumination: '반추',
  activity: '활동량',
};

const DIAGNOSIS_KO: Readonly<Record<string, string>> = {
  mastitis: '유방염',
  ketosis: '케토시스',
  acidosis: '산독증',
  pneumonia: '폐렴',
  metritis: '자궁내막염',
  lda: '제4위변위',
};
