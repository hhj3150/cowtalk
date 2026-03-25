// 수정사 전용 대시보드 위젯 — 오늘 수정할 소 + 경로 + 번식 통계
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '@web/api/client';
import { useIsMobile } from '@web/hooks/useIsMobile';
import { useFarmStore } from '@web/stores/farm.store';

interface FarmEstrus {
  readonly farmId: string;
  readonly farmName: string;
  readonly estrusCount: number;
  readonly animals: readonly { animalId: string; earTag: string; detectedAt: string }[];
}

interface InseminatorStats {
  readonly todayEstrus: number;
  readonly todayInseminated: number;
  readonly todayPregnancyCheck: number;
  readonly todayNoInsemination: number;
  readonly farmBreakdown: readonly FarmEstrus[];
}

interface Props {
  readonly onAnimalClick?: (animalId: string) => void;
  readonly onFarmClick?: (farmId: string) => void;
}

function formatOptimalTime(detectedAt: string): string {
  const detected = new Date(detectedAt);
  const optimal12h = new Date(detected.getTime() + 12 * 60 * 60 * 1000);
  const optimal18h = new Date(detected.getTime() + 18 * 60 * 60 * 1000);
  const now = new Date();

  const fmt = (d: Date): string => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  if (now > optimal18h) return '⏰ 적기 지남';
  if (now > optimal12h) return `🔴 지금! (~${fmt(optimal18h)})`;
  return `${fmt(optimal12h)}~${fmt(optimal18h)}`;
}

export function InseminatorDashboard({ onAnimalClick, onFarmClick }: Props): React.JSX.Element {
  const [data, setData] = useState<InseminatorStats | null>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const selectedFarmIds = useFarmStore((s) => s.selectedFarmIds);
  const farmIdsParam = selectedFarmIds.length > 0 ? `&farmIds=${selectedFarmIds.join(',')}` : '';

  useEffect(() => {
    // 드릴다운 API로 발정 대상우 전체 조회 (live-alarms는 50건 제한)
    Promise.all([
      apiGet<{ items: readonly { eventId: string; farmId: string; farmName: string; animalId: string; earTag: string; eventType: string; detectedAt: string; severity: string }[]; total: number }>(
        `/unified-dashboard/drilldown?eventType=estrus${farmIdsParam}`
      ),
      apiGet<{ total: number }>(`/unified-dashboard/drilldown?eventType=insemination${farmIdsParam}`),
      apiGet<{ total: number }>(`/unified-dashboard/drilldown?eventType=pregnancy_check${farmIdsParam}`),
      apiGet<{ total: number }>(`/unified-dashboard/drilldown?eventType=no_insemination${farmIdsParam}`),
    ]).then(([estrusRes, insemRes, pregRes, noInsemRes]) => {
      // 농장별 그룹핑
      const farmMap = new Map<string, FarmEstrus>();
      for (const a of estrusRes.items) {
        const existing = farmMap.get(a.farmId);
        if (existing) {
          farmMap.set(a.farmId, {
            ...existing,
            estrusCount: existing.estrusCount + 1,
            animals: [...existing.animals, { animalId: a.animalId, earTag: a.earTag, detectedAt: a.detectedAt }],
          });
        } else {
          farmMap.set(a.farmId, {
            farmId: a.farmId,
            farmName: a.farmName,
            estrusCount: 1,
            animals: [{ animalId: a.animalId, earTag: a.earTag, detectedAt: a.detectedAt }],
          });
        }
      }

      const farmBreakdown = Array.from(farmMap.values()).sort((a, b) => b.estrusCount - a.estrusCount);

      setData({
        todayEstrus: estrusRes.total,
        todayInseminated: insemRes.total,
        todayPregnancyCheck: pregRes.total,
        todayNoInsemination: noInsemRes.total,
        farmBreakdown,
      });
    }).catch(() => {});
  }, [farmIdsParam]);

  if (!data) {
    return (
      <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 20, textAlign: 'center', color: 'var(--ct-text-muted)' }}>
        수정사 대시보드 로딩 중...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 오늘 번식 KPI */}
      <div style={{
        background: 'var(--ct-card)',
        border: '1px solid var(--ct-border)',
        borderRadius: 12,
        padding: '16px 18px',
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ct-text)', margin: '0 0 12px' }}>
          💉 오늘 번식 현황
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: '발정 감지', count: data.todayEstrus, color: '#ef4444', icon: '🐄' },
            { label: '수정 완료', count: data.todayInseminated, color: '#3b82f6', icon: '✅' },
            { label: '임신 검사', count: data.todayPregnancyCheck, color: '#22c55e', icon: '🔍' },
            { label: '미수정', count: data.todayNoInsemination, color: '#eab308', icon: '⚠️' },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              textAlign: 'center',
              padding: '10px 6px',
              borderRadius: 8,
              background: kpi.count > 0 ? `${kpi.color}10` : 'var(--ct-bg)',
            }}>
              <div style={{ fontSize: 14, marginBottom: 2 }}>{kpi.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: kpi.count > 0 ? kpi.color : 'var(--ct-text-muted)' }}>
                {kpi.count}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>{kpi.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 농장별 수정 대상 — 수정 경로 */}
      <div style={{
        background: 'var(--ct-card)',
        border: '1px solid var(--ct-border)',
        borderRadius: 12,
        padding: '16px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ct-text)', margin: 0 }}>
            🗺️ 오늘 수정 경로 ({data.farmBreakdown.length}개 농장)
          </h3>
          <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>
            총 {data.todayEstrus}두 수정 대상
          </span>
        </div>

        {data.farmBreakdown.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--ct-text-muted)', fontSize: 13 }}>
            ✅ 오늘 수정 대상이 없습니다
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
            {data.farmBreakdown.map((farm, idx) => (
              <div
                key={farm.farmId}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: idx === 0 ? 'rgba(239,68,68,0.1)' : 'var(--ct-bg)',
                  border: idx === 0 ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
                  cursor: 'pointer',
                }}
                onClick={() => onFarmClick?.(farm.farmId)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#fff',
                      background: idx < 3 ? '#ef4444' : '#64748b',
                      borderRadius: '50%',
                      width: 22,
                      height: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {idx + 1}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>
                      {farm.farmName}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: '#ef4444',
                    background: 'rgba(239,68,68,0.15)',
                    padding: '2px 8px',
                    borderRadius: 10,
                  }}>
                    {farm.estrusCount}두
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 30 }}>
                  {farm.animals.slice(0, 6).map((a) => {
                    const timing = formatOptimalTime(a.detectedAt);
                    const isUrgent = timing.includes('지금') || timing.includes('지남');
                    return (
                      <div
                        key={a.animalId}
                        onClick={(e) => { e.stopPropagation(); onAnimalClick?.(a.animalId); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: isUrgent ? 'rgba(239,68,68,0.1)' : 'var(--ct-card)',
                          cursor: 'pointer',
                          border: '1px solid var(--ct-border)',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontWeight: 600, color: 'var(--ct-text)' }}>#{a.earTag}</span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); navigate(`/cow/${a.animalId}`); }}
                            style={{ background: 'none', border: 'none', color: 'var(--ct-primary)', fontSize: 9, cursor: 'pointer', padding: '0 2px', fontWeight: 600 }}
                          >
                            상세
                          </button>
                        </span>
                        <span style={{ fontSize: 10, color: isUrgent ? '#ef4444' : 'var(--ct-text-muted)', fontWeight: isUrgent ? 700 : 400 }}>
                          수정 적기: {timing}
                        </span>
                      </div>
                    );
                  })}
                  {farm.animals.length > 6 && (
                    <span style={{ fontSize: 10, color: 'var(--ct-text-muted)', paddingLeft: 8 }}>
                      +{farm.animals.length - 6}두 더 있음
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
