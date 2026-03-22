// 통합 대시보드 — 체온 이상 순위 위젯
// 전염병/유방염 등 감염성 질병 조기 감지를 위한 체온 알람 기준 소 순위

import React, { useEffect, useState } from 'react';
import { apiGet } from '@web/api/client';

// ── 타입 ──

interface FeverAnimal {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly alertCount: number;
  readonly latestAt: string;
  readonly latestValue: number | null;
}

interface FeverRankingResponse {
  readonly rankings: readonly FeverAnimal[];
  readonly total: number;
}

interface Props {
  readonly farmId?: string | null;
  readonly onAnimalClick?: (animalId: string) => void;
}

// ── 유틸 ──

function formatTimeAgo(iso: string): string {
  if (!iso) return '';
  const now = Date.now();
  const detected = new Date(iso).getTime();
  const diffMin = Math.floor((now - detected) / 60_000);

  if (diffMin < 1) return '방금';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  return `${Math.floor(diffHour / 24)}일 전`;
}

function getSeverityColor(alertCount: number): string {
  if (alertCount >= 5) return '#ef4444'; // critical
  if (alertCount >= 3) return '#f97316'; // high
  if (alertCount >= 2) return '#eab308'; // medium
  return '#3b82f6'; // low
}

// ── 메인 컴포넌트 ──

export function FeverRankingWidget({ farmId, onAnimalClick }: Props): React.JSX.Element {
  const [data, setData] = useState<FeverRankingResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const query = farmId ? `?farmId=${farmId}` : '';
    apiGet<FeverRankingResponse>(`/unified-dashboard/fever-ranking${query}`)
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [farmId]);

  const rankings = data?.rankings ?? [];
  const maxCount = rankings.length > 0 ? Math.max(...rankings.map((r) => r.alertCount)) : 0;

  return (
    <div className="ct-card p-4" style={{ borderRadius: '12px' }}>
      <h3
        className="mb-3 font-semibold"
        style={{ fontSize: '13px', color: 'var(--ct-text)' }}
      >
        {'\uD83C\uDF21\uFE0F'} 체온 이상 순위 (24시간)
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div
            className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: 'var(--ct-primary)', borderTopColor: 'transparent' }}
          />
        </div>
      ) : rankings.length === 0 ? (
        <div
          className="flex items-center justify-center rounded-lg px-4 py-6"
          style={{ color: 'var(--ct-text-secondary)' }}
        >
          <span className="text-sm">{'\u2705'} 체온 이상 알람이 없습니다</span>
        </div>
      ) : (
        <div
          className="flex flex-col gap-1 overflow-y-auto"
          style={{ maxHeight: '320px' }}
        >
          {rankings.map((animal, index) => {
            const progressWidth = maxCount > 0 ? (animal.alertCount / maxCount) * 100 : 0;
            const color = getSeverityColor(animal.alertCount);

            return (
              <button
                key={animal.animalId}
                type="button"
                onClick={() => onAnimalClick?.(animal.animalId)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-black/5"
                style={{ cursor: onAnimalClick ? 'pointer' : 'default' }}
              >
                {/* 순위 */}
                <span
                  className="flex-shrink-0 text-xs font-bold"
                  style={{
                    width: '20px',
                    textAlign: 'center',
                    color: index < 3 ? '#ef4444' : 'var(--ct-text-secondary)',
                  }}
                >
                  {index + 1}
                </span>

                {/* 소 정보 + 프로그레스 */}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm" style={{ color: 'var(--ct-text)' }}>
                      [{animal.farmName}] {animal.earTag}번
                    </span>
                    <span className="flex-shrink-0 text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                      {formatTimeAgo(animal.latestAt)}
                    </span>
                  </div>
                  <div
                    className="h-1.5 w-full overflow-hidden rounded-full"
                    style={{ backgroundColor: 'var(--ct-border)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${progressWidth}%`,
                        backgroundColor: color,
                        minWidth: animal.alertCount > 0 ? '4px' : '0',
                      }}
                    />
                  </div>
                </div>

                {/* 알람 수 */}
                <span
                  className="flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: color,
                    color: '#ffffff',
                    minWidth: '28px',
                    textAlign: 'center',
                  }}
                >
                  {animal.alertCount}
                </span>

                {/* 드릴다운 화살표 */}
                {onAnimalClick && (
                  <span className="text-xs" style={{ color: 'var(--ct-primary)' }}>
                    {'\u203A'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
