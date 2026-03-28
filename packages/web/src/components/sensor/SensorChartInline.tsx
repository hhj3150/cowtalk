// 개체 프로필 임베디드 센서 차트 — SmaxtecSensorChart 통합 래퍼
// 4개 별도 패널(구버전) → smaXtec 스타일 통합 차트로 교체

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAnimalSensorChart } from '@web/api/unified-dashboard.api';
import { SmaxtecSensorChart } from '@web/components/unified-dashboard/SmaxtecSensorChart';
import { useIsMobile } from '@web/hooks/useIsMobile';

interface Props {
  readonly animalId: string;
}

const PERIOD_OPTIONS = [
  { label: '일', days: 2 },
  { label: '주', days: 7 },
  { label: '월', days: 30 },
] as const;

export function SensorChartInline({ animalId }: Props): React.JSX.Element {
  const [days, setDays] = useState(7);
  const isMobile = useIsMobile();
  const chartHeight = isMobile ? 280 : 420;

  const { data, isLoading, error } = useQuery({
    queryKey: ['sensor-chart-inline', animalId, days],
    queryFn: () => fetchAnimalSensorChart(animalId, days),
    staleTime: 5 * 60 * 1000,
  });

  const hasSimulated = (data?.simulatedMetrics?.length ?? 0) > 0;

  return (
    <div style={{
      background: 'var(--ct-card)',
      border: '1px solid var(--ct-border)',
      borderRadius: 10,
      padding: '12px 14px',
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>📊</span>
          <span>센서 데이터</span>
          {hasSimulated && (
            <span style={{
              fontSize: 9, fontWeight: 600,
              background: 'rgba(245,158,11,0.15)',
              color: '#b45309',
              padding: '1px 5px', borderRadius: 4,
              border: '1px solid rgba(245,158,11,0.3)',
            }}>
              추정치 포함
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setDays(opt.days)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: days === opt.days
                  ? '1.5px solid var(--ct-primary)'
                  : '1px solid var(--ct-border)',
                background: days === opt.days ? 'rgba(0,214,126,0.12)' : 'transparent',
                color: days === opt.days ? 'var(--ct-primary)' : 'var(--ct-text-muted)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: days === opt.days ? 700 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 차트 영역 */}
      {isLoading && (
        <div style={{
          height: chartHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ct-text-muted)',
          fontSize: 12,
        }}>
          센서 데이터 로딩 중...
        </div>
      )}
      {error && (
        <div style={{
          height: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ef4444',
          fontSize: 12,
        }}>
          센서 데이터를 불러올 수 없습니다
        </div>
      )}
      {data && (
        <SmaxtecSensorChart data={data} height={chartHeight} />
      )}
      {!isLoading && !error && !data && (
        <div style={{
          height: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ct-text-muted)',
          fontSize: 12,
        }}>
          데이터 없음
        </div>
      )}
    </div>
  );
}
