// 시도/전국 목장 지수 롤업 위젯 — 행정관·방역관
// "전국 어디가 좋아지고 어디가 나빠지는가" — farm_index_snapshots 실측만 집계.
// 정직성: 스냅샷 없는 시도는 '—', 헤더에 "N/전체 농장 스냅샷 기준" 모수 명시.

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@web/api/client';
import { TitleAccentBar } from './WidgetTitle';

interface ProvinceRollup {
  readonly province: string;
  readonly snappedFarms: number;
  readonly totalFarms: number;
  readonly avgOverall: number | null;
  readonly delta7d: number | null;
}

interface NationalRollup {
  readonly nationalAvg: number | null;
  readonly snappedFarms: number;
  readonly totalFarms: number;
  readonly provinces: readonly ProvinceRollup[];
  readonly asOfDate: string;
}

function scoreColor(score: number): string {
  return score >= 85 ? '#22c55e' : score >= 70 ? '#38bdf8' : score >= 55 ? '#f59e0b' : '#ef4444';
}

export function RegionalIndexWidget(): React.JSX.Element | null {
  const { data, isLoading } = useQuery({
    queryKey: ['farm-index-rollup'],
    queryFn: () => apiGet<NationalRollup>('/farms/index-rollup'),
    staleTime: 5 * 60 * 1000,
  });

  // 스냅샷이 아직 하나도 없으면(배치 1회차 전) 패널 숨김 — 빈 표로 화면을 차지하지 않음
  if (!isLoading && (!data || data.snappedFarms === 0)) return null;

  return (
    <div className="ct-card ct-fade-up" style={{ borderRadius: 14, padding: '16px 16px 14px' }} role="region" aria-label="전국 목장 지수">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <TitleAccentBar />
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ct-text)', letterSpacing: '-0.2px' }}>
          전국 목장 지수
        </span>
        {data && (
          <>
            {data.nationalAvg != null && (
              <span style={{
                fontSize: 13, fontWeight: 800, color: scoreColor(data.nationalAvg),
                fontVariantNumeric: 'tabular-nums',
              }}>
                평균 {data.nationalAvg}점
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ct-text-muted)' }}>
              {data.snappedFarms}/{data.totalFarms} 농장 스냅샷 기준 · {data.asOfDate}
            </span>
          </>
        )}
      </div>

      {isLoading && <div className="ct-shimmer" style={{ height: 120, borderRadius: 12 }} />}

      {!isLoading && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {data.provinces.map((p) => {
            const has = p.avgOverall != null;
            return (
              <div key={p.province} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text)', width: 44, flexShrink: 0 }}>
                  {p.province}
                </span>
                <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--ct-border)', overflow: 'hidden' }}>
                  {has && (
                    <div style={{
                      width: `${p.avgOverall}%`, height: '100%', borderRadius: 4,
                      background: scoreColor(p.avgOverall!),
                      transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                    }} />
                  )}
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 700, width: 28, textAlign: 'right', flexShrink: 0,
                  color: has ? 'var(--ct-text)' : 'var(--ct-text-muted)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {has ? p.avgOverall : '—'}
                </span>
                <span style={{
                  fontSize: 10, width: 40, textAlign: 'right', flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                  color: p.delta7d == null ? 'var(--ct-text-muted)' : p.delta7d >= 0 ? '#22c55e' : '#ef4444',
                }}>
                  {p.delta7d == null ? '' : `${p.delta7d >= 0 ? '▲' : '▼'}${Math.abs(p.delta7d)}`}
                </span>
                <span style={{ fontSize: 10, color: 'var(--ct-text-muted)', width: 52, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {p.snappedFarms}/{p.totalFarms}농장
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
