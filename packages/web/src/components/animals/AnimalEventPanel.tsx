// 개체 이벤트 패널 — 타임라인 + 이벤트 기록 버튼
// 9종: 분만 | 수정(AI) | 임신감정 | 치료/투약 | 건유 | 검정측정(DHI) | 도태 | 예방접종 | 우군이동

import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnimalEvent } from '@web/api/animal-events.api';
import { getAnimalEvents } from '@web/api/animal-events.api';
import { EventFormModal } from './EventFormModal';

const EVENT_META: Record<string, { icon: string; label: string; color: string }> = {
  calving:         { icon: '🐣', label: '분만',      color: '#f59e0b' },
  insemination:    { icon: '💉', label: '수정(AI)',   color: '#3b82f6' },
  pregnancy_check: { icon: '🔍', label: '임신감정',   color: '#8b5cf6' },
  treatment:       { icon: '💊', label: '치료/투약',  color: '#ef4444' },
  dry_off:         { icon: '🏖️', label: '건유',      color: '#eab308' },
  dhi:             { icon: '📊', label: '검정측정',   color: '#06b6d4' },
  cull:            { icon: '❌', label: '도태',       color: '#6b7280' },
  vaccination:     { icon: '💉', label: '예방접종',   color: '#22c55e' },
  herd_move:       { icon: '🚚', label: '우군이동',   color: '#94a3b8' },
};

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function EventDetailText({ event }: { readonly event: AnimalEvent }): React.JSX.Element {
  const d = event.details;
  switch (event.eventType) {
    case 'calving': {
      const sex = (d.calfSex as string) === 'female' ? '암' : (d.calfSex as string) === 'male' ? '수' : '미상';
      const status = (d.calfStatus as string) === 'alive' ? '생존' : (d.calfStatus as string) === 'stillborn' ? '사산' : '허약';
      return <span>{sex}송아지 · {status}{d.calfEarTag ? ` · 귀표: ${d.calfEarTag as string}` : ''}</span>;
    }
    case 'insemination':
      return <span>{(d.semenBull as string) ?? '정액 미기재'}{d.technicianName ? ` · ${d.technicianName as string}` : ''}</span>;
    case 'pregnancy_check': {
      const result = (d.result as string) === 'pregnant' ? '임신 ✅' : (d.result as string) === 'open' ? '미임신 ❌' : '불확실';
      return <span>{result}{d.daysPostInsemination ? ` · 수정 후 ${d.daysPostInsemination as number}일` : ''}</span>;
    }
    case 'treatment':
      return <span>{(d.diagnosis as string) ?? '진단 미기재'}{d.withdrawalDays ? ` · 휴약 ${d.withdrawalDays as number}일` : ''}</span>;
    case 'dry_off':
      return <span>건유 전환{d.expectedCalvingDate ? ` · 예정분만 ${formatEventDate(d.expectedCalvingDate as string)}` : ''}</span>;
    case 'dhi':
      return <span>
        {d.milkKg ? `${(d.milkKg as number).toFixed(1)}kg` : ''}
        {d.fatPct ? ` · 유지 ${(d.fatPct as number).toFixed(2)}%` : ''}
        {d.proteinPct ? ` · 유단백 ${(d.proteinPct as number).toFixed(2)}%` : ''}
        {d.scc ? ` · SCC ${(d.scc as number).toLocaleString()}` : ''}
      </span>;
    case 'cull': {
      const reason: Record<string, string> = { disease:'질병', injury:'부상', low_production:'저생산', age:'노령', reproductive:'번식장애', other:'기타' };
      return <span>{reason[d.reason as string] ?? d.reason as string}</span>;
    }
    case 'vaccination':
      return <span>{(d.vaccineName as string) ?? '백신명 미기재'}</span>;
    case 'herd_move':
      return <span>{d.fromGroup ? `${d.fromGroup as string} → ` : ''}{(d.toGroup as string) ?? ''}</span>;
    default:
      return <span>-</span>;
  }
}

interface Props {
  readonly animalId: string;
  readonly farmId: string;
  readonly earTag: string;
}

export function AnimalEventPanel({ animalId, farmId, earTag }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['animal-events', animalId],
    queryFn: () => getAnimalEvents(animalId),
    staleTime: 2 * 60_000,
  });

  const handleEventCreated = useCallback(() => {
    setShowForm(false);
    void queryClient.invalidateQueries({ queryKey: ['animal-events', animalId] });
  }, [queryClient, animalId]);

  // 이벤트 타입별 카운트 (상단 통계바)
  const counts = events.reduce<Record<string, number>>((acc, e) => {
    return { ...acc, [e.eventType]: (acc[e.eventType] ?? 0) + 1 };
  }, {});

  return (
    <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16 }}>

      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>📋 이벤트 기록</h2>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8,
            background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
            color: '#fff', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 700,
          }}
        >
          + 이벤트 기록
        </button>
      </div>

      {/* ── 통계 뱃지 ── */}
      {events.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {Object.entries(counts).map(([type, cnt]) => {
            const meta = EVENT_META[type];
            if (!meta) return null;
            return (
              <span
                key={type}
                style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 10,
                  background: `${meta.color}15`, color: meta.color,
                  border: `1px solid ${meta.color}30`, fontWeight: 600,
                }}
              >
                {meta.icon} {meta.label} {cnt}
              </span>
            );
          })}
        </div>
      )}

      {/* ── 타임라인 ── */}
      {isLoading && (
        <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--ct-text-muted)', fontSize: 12 }}>
          이벤트 로딩 중...
        </div>
      )}

      {!isLoading && events.length === 0 && (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--ct-text-muted)', fontSize: 12 }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>📋</div>
          기록된 이벤트 없음<br />
          <span style={{ fontSize: 11 }}>이벤트 기록 버튼으로 첫 번째 이벤트를 추가하세요</span>
        </div>
      )}

      {!isLoading && events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 400, overflowY: 'auto' }}>
          {events.map((event, idx) => {
            const meta = EVENT_META[event.eventType] ?? { icon: '📌', label: event.eventType, color: '#64748b' };
            const isLast = idx === events.length - 1;
            return (
              <div key={event.eventId} style={{ display: 'flex', gap: 10, paddingBottom: isLast ? 0 : 10, position: 'relative' }}>
                {/* 세로 연결선 */}
                {!isLast && (
                  <div style={{
                    position: 'absolute', left: 13, top: 26, bottom: 0,
                    width: 1, background: 'var(--ct-border)',
                  }} />
                )}

                {/* 아이콘 원 */}
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: `${meta.color}20`, border: `2px solid ${meta.color}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, zIndex: 1,
                }}>
                  {meta.icon}
                </div>

                {/* 내용 */}
                <div style={{ flex: 1, paddingTop: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px',
                      borderRadius: 4, background: `${meta.color}15`, color: meta.color,
                    }}>
                      {meta.label}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
                      {formatEventDate(event.eventDate)}
                    </span>
                    {event.recordedByName && (
                      <span style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>by {event.recordedByName}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ct-text)', lineHeight: 1.4 }}>
                    <EventDetailText event={event} />
                  </div>
                  {event.notes && (
                    <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                      {event.notes}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 이벤트 기록 모달 ── */}
      {showForm && (
        <EventFormModal
          animalId={animalId}
          farmId={farmId}
          earTag={earTag}
          onClose={() => setShowForm(false)}
          onSuccess={handleEventCreated}
        />
      )}
    </div>
  );
}
