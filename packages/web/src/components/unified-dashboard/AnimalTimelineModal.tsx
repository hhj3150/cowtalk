// 통합 대시보드 — 개체 smaXtec 타임라인 모달
// 소 개체 클릭 시 전체 이벤트 히스토리를 타임라인 차트로 표시

import React, { useEffect, useState } from 'react';
import { apiGet } from '@web/api/client';
import { SensorChartModal } from './SensorChartModal';

// ── 타입 ──

interface AnimalInfo {
  readonly animalId: string;
  readonly earTag: string;
  readonly name: string;
  readonly breed: string;
  readonly sex: string;
  readonly birthDate: string | null;
  readonly parity: number | null;
  readonly daysInMilk: number | null;
  readonly lactationStatus: string;
  readonly farmId: string;
  readonly farmName: string;
}

interface TimelineEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly smaxtecType: string;
  readonly smaxtecLabel: string;
  readonly category: string;
  readonly categoryColor: string;
  readonly detectedAt: string;
  readonly severity: string;
  readonly confidence: number;
  readonly details: Record<string, unknown> | null;
  readonly acknowledged: boolean;
}

interface TimelineResponse {
  readonly animal: AnimalInfo;
  readonly timeline: readonly TimelineEvent[];
  readonly totalEvents: number;
}

interface Props {
  readonly animalId: string;
  readonly onClose: () => void;
  readonly onSovereignClick?: (animalId: string) => void;
}

// ── 상수 ──

const LACTATION_LABELS: Record<string, string> = {
  milking: '착유중',
  lactating: '착유중',
  dry: '건유',
  pregnant: '임신',
  open: '공태',
  unknown: '미분류',
};

const CATEGORY_LABELS: Record<string, string> = {
  fertility: '번식',
  calving: '분만',
  health: '건강',
  activity: '활동',
  feeding: '사양',
  management: '관리',
};

// ── 유틸 ──

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDetailValue(details: Record<string, unknown> | null): string {
  if (!details) return '';
  const parts: string[] = [];

  if (details.cycle_length !== undefined) {
    parts.push(`발정주기: ${String(details.cycle_length)}일`);
  }
  if (details.pregnant !== undefined) {
    parts.push(details.pregnant ? '임신 확인' : '미임신');
  }
  if (details.value !== undefined) {
    const val = Number(details.value);
    parts.push(`수치: ${val < 10 ? val.toFixed(2) : val.toFixed(1)}`);
  }
  if (details.number !== undefined) {
    parts.push(`산차: ${String(details.number)}`);
  }
  if (details.insemination_date) {
    const insDate = new Date(String(details.insemination_date));
    parts.push(`수정일: ${insDate.toLocaleDateString('ko-KR')}`);
  }
  if (details.expected_calving_date) {
    const calvDate = new Date(String(details.expected_calving_date));
    parts.push(`분만예정: ${calvDate.toLocaleDateString('ko-KR')}`);
  }

  return parts.join(' · ');
}

// ── 동물 프로필 카드 ──

function AnimalProfile({ animal }: { readonly animal: AnimalInfo }): React.JSX.Element {
  return (
    <div
      className="flex items-center gap-4 rounded-lg p-4"
      style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)' }}
    >
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
        style={{ background: 'var(--ct-border)' }}
      >
        {'\uD83D\uDC04'}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold" style={{ color: 'var(--ct-text)' }}>
            {animal.earTag}번
          </span>
          {animal.name && (
            <span className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
              ({animal.name})
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
          <span>{animal.farmName}</span>
          <span>{animal.breed}</span>
          {animal.parity !== null && <span>산차: {animal.parity}</span>}
          {animal.daysInMilk !== null && animal.daysInMilk > 0 && <span>비유일수: {animal.daysInMilk}일</span>}
          <span
            className="rounded-full px-2 py-0.5"
            style={{
              background: animal.lactationStatus === 'milking' || animal.lactationStatus === 'lactating'
                ? '#22c55e20' : 'var(--ct-border)',
              color: animal.lactationStatus === 'milking' || animal.lactationStatus === 'lactating'
                ? '#22c55e' : 'var(--ct-text-secondary)',
            }}
          >
            {LACTATION_LABELS[animal.lactationStatus] ?? animal.lactationStatus}
          </span>
          {animal.birthDate && <span>출생: {formatDate(animal.birthDate)}</span>}
        </div>
      </div>
    </div>
  );
}

// ── 카테고리 통계 바 ──

function CategoryStats({ timeline }: { readonly timeline: readonly TimelineEvent[] }): React.JSX.Element {
  const counts: Record<string, number> = {};
  for (const event of timeline) {
    counts[event.category] = (counts[event.category] ?? 0) + 1;
  }

  const total = timeline.length;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'var(--ct-text-secondary)' }}>
          이벤트 분류 (전체 {total}건)
        </span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full" style={{ background: 'var(--ct-border)' }}>
        {entries.map(([category, cnt]) => {
          const pct = (cnt / total) * 100;
          const color = timeline.find((e) => e.category === category)?.categoryColor ?? '#6b7280';
          return (
            <div
              key={category}
              style={{ width: `${pct}%`, backgroundColor: color, minWidth: cnt > 0 ? '4px' : '0' }}
              title={`${CATEGORY_LABELS[category] ?? category}: ${cnt}건 (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        {entries.map(([category, cnt]) => {
          const color = timeline.find((e) => e.category === category)?.categoryColor ?? '#6b7280';
          return (
            <div key={category} className="flex items-center gap-1.5 text-xs">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              <span style={{ color: 'var(--ct-text-secondary)' }}>
                {CATEGORY_LABELS[category] ?? category} {cnt}건
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 타임라인 이벤트 행 ──

function TimelineRow({ event, isLast }: { readonly event: TimelineEvent; readonly isLast: boolean }): React.JSX.Element {
  const detailStr = formatDetailValue(event.details);

  return (
    <div className="flex gap-3">
      {/* 타임라인 선 + 점 */}
      <div className="flex flex-col items-center" style={{ width: '20px' }}>
        <div
          className="h-3 w-3 flex-shrink-0 rounded-full"
          style={{
            backgroundColor: event.categoryColor,
            border: '2px solid var(--ct-card)',
            boxShadow: `0 0 0 2px ${event.categoryColor}40`,
          }}
        />
        {!isLast && (
          <div
            className="flex-1"
            style={{
              width: '2px',
              backgroundColor: 'var(--ct-border)',
              minHeight: '24px',
            }}
          />
        )}
      </div>

      {/* 이벤트 내용 */}
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: `${event.categoryColor}20`,
              color: event.categoryColor,
            }}
          >
            {event.smaxtecLabel}
          </span>
          <span className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
            {formatDateTime(event.detectedAt)}
          </span>
        </div>
        {detailStr && (
          <p className="mt-1 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
            {detailStr}
          </p>
        )}
      </div>
    </div>
  );
}

// ── 메인 모달 ──

export function AnimalTimelineModal({ animalId, onClose, onSovereignClick }: Props): React.JSX.Element {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSensorChart, setShowSensorChart] = useState(false);

  useEffect(() => {
    apiGet<TimelineResponse>(`/unified-dashboard/animal/${animalId}/timeline`)
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [animalId]);

  // ESC 키로 닫기
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl shadow-2xl"
        style={{
          background: 'var(--ct-card)',
          border: '1px solid var(--ct-border)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{ borderColor: 'var(--ct-border)' }}
        >
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--ct-text)' }}>
              {'\uD83D\uDC04'} 개체 smaXtec 이벤트 히스토리
            </h2>
            <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
              {data ? `${data.animal.farmName} · ${data.animal.earTag}번 · 총 ${data.totalEvents}건` : '로딩 중...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSensorChart(true)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                background: 'var(--ct-primary)',
                color: '#fff',
              }}
            >
              {'\uD83D\uDCCA'} 센서 차트 보기
            </button>
            {onSovereignClick && (
              <button
                type="button"
                onClick={() => {
                  onSovereignClick(animalId);
                  onClose();
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: '#16a34a',
                  color: '#fff',
                }}
              >
                {'\uD83E\uDDE0'} 소버린 AI
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/10"
              style={{ color: 'var(--ct-text-secondary)' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div
                className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: 'var(--ct-primary)', borderTopColor: 'transparent' }}
              />
              <span className="ml-3 text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
                개체 데이터 조회 중...
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#fef2f2', color: '#dc2626' }}>
              오류: {error}
            </div>
          )}

          {data && (
            <div className="flex flex-col gap-4">
              {/* 프로필 카드 */}
              <AnimalProfile animal={data.animal} />

              {/* 카테고리 통계 */}
              {data.timeline.length > 0 && <CategoryStats timeline={data.timeline} />}

              {/* 타임라인 */}
              {data.timeline.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
                  이 개체의 smaXtec 이벤트가 없습니다.
                </div>
              ) : (
                <div className="mt-2">
                  {data.timeline.map((event, index) => (
                    <TimelineRow
                      key={event.eventId}
                      event={event}
                      isLast={index === data.timeline.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 하단 */}
        <div
          className="border-t px-6 py-3 text-right"
          style={{ borderColor: 'var(--ct-border)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--ct-primary)' }}
          >
            닫기
          </button>
        </div>
      </div>

      {/* 센서 차트 모달 */}
      {showSensorChart && (
        <SensorChartModal
          animalId={animalId}
          onClose={() => setShowSensorChart(false)}
        />
      )}
    </div>
  );
}
