// 축산물이력추적 섹션 — 독립 컴포넌트
// animalId로 이력제 데이터 조회하여 표시
// 이력번호 클릭 시 전체 공공데이터 펼침

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAnimalTrace } from '@web/api/animal.api';
import type { AnimalTraceData } from '@web/api/animal.api';

interface Props {
  readonly animalId: string;
  /** 간략 모드: traceId만 표시 + 클릭 시 펼침 */
  readonly compact?: boolean;
}

export function TraceSection({ animalId, compact = false }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(!compact);

  const { data, isLoading, isError } = useQuery<AnimalTraceData>({
    queryKey: ['animal-trace', animalId],
    queryFn: () => getAnimalTrace(animalId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded" style={{ background: 'var(--ct-border)' }} />
        ))}
      </div>
    );
  }

  // API 에러 시
  if (isError) {
    return (
      <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
        이력제 정보 조회 실패
      </p>
    );
  }

  // 이력번호가 없는 개체
  if (!data?.traceId) {
    return (
      <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
        이력제 번호 미등록
      </p>
    );
  }

  // 간략 모드: 이력번호 뱃지만 표시
  if (compact && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
        style={{
          background: 'rgba(59,130,246,0.1)',
          color: '#3b82f6',
          border: '1px solid rgba(59,130,246,0.2)',
        }}
      >
        🏛️ {data.traceId}
        <span style={{ fontSize: 10, opacity: 0.7 }}>클릭하여 이력 보기 ›</span>
      </button>
    );
  }

  // 데이터 미조회 (API 키 없거나 네트워크 문제)
  if (!data.available) {
    return (
      <div className="rounded-lg p-3 text-center" style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)' }}>
        <p className="text-xs font-medium" style={{ color: 'var(--ct-text)' }}>
          🏛️ 이력번호: {data.traceId}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--ct-text-secondary)' }}>
          {data.reason ?? '공공데이터 API 연결 중'}
        </p>
        <a
          href="https://mtrace.go.kr/mtrace2/main/main.do"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block text-xs text-blue-500 underline"
        >
          축산물이력제 홈페이지에서 직접 조회 →
        </a>
      </div>
    );
  }

  // 전체 이력 표시
  return (
    <div className="space-y-3 text-xs">
      {/* 헤더 */}
      {compact && (
        <div className="flex items-center justify-between">
          <p className="font-semibold" style={{ color: 'var(--ct-text)' }}>🏛️ 축산물이력추적</p>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs px-2 py-0.5 rounded"
            style={{ color: 'var(--ct-text-secondary)' }}
          >
            접기 ▲
          </button>
        </div>
      )}

      {/* 기본 이력 정보 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { label: '이력번호', value: data.traceId },
          { label: '출생일', value: data.birthDate },
          { label: '성별', value: data.sex },
          { label: '품종', value: data.breed },
          { label: '농장 식별번호', value: data.farmId },
          { label: '등록농장명', value: data.farmName },
        ].map((item) => (
          <div key={item.label} className="rounded p-2" style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)' }}>
            <p className="text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>{item.label}</p>
            <p className="mt-0.5 font-medium" style={{ color: 'var(--ct-text)' }}>{item.value || '—'}</p>
          </div>
        ))}
      </div>

      {data.farmAddress && (
        <div className="rounded px-3 py-2" style={{ background: 'rgba(59,130,246,0.08)', color: '#3b82f6' }}>
          📍 {data.farmAddress}
        </div>
      )}

      {/* 이동이력 */}
      {(data.movements?.length ?? 0) > 0 && (
        <div>
          <p className="mb-1 font-semibold" style={{ color: 'var(--ct-text)' }}>🚛 이동이력</p>
          <div className="space-y-1">
            {data.movements!.map((m, i) => (
              <div key={i} className="flex items-center gap-2 rounded px-2 py-1.5" style={{ background: 'var(--ct-bg)' }}>
                <span style={{ color: 'var(--ct-text-secondary)' }}>{m.date}</span>
                <span style={{ color: 'var(--ct-text-secondary)' }}>|</span>
                <span style={{ color: 'var(--ct-text)' }}>
                  {m.fromFarm ? `${m.fromFarm} →` : ''} {m.toFarm}
                </span>
                <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
                  {m.reason}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 도축정보 */}
      {data.slaughterInfo && (
        <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <p className="mb-1 font-semibold" style={{ color: '#ef4444' }}>🥩 도축정보</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '도축일', value: data.slaughterInfo.date },
              { label: '도축장', value: data.slaughterInfo.facility },
              { label: '등급', value: data.slaughterInfo.grade ?? '—' },
              { label: '중량', value: data.slaughterInfo.weight ? `${data.slaughterInfo.weight}kg` : '—' },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[10px]" style={{ color: 'rgba(239,68,68,0.6)' }}>{item.label}</p>
                <p className="font-medium" style={{ color: '#ef4444' }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-right text-[10px]" style={{ color: 'var(--ct-text-secondary)', opacity: 0.5 }}>
        출처: 축산물이력추적시스템 (data.ekape.or.kr)
      </p>
    </div>
  );
}
