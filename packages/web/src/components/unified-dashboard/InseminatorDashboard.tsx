// 수정사 전용 대시보드 위젯 — 오늘 수정할 소 + AM/PM 경로 + 번식 통계
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

/** 발정 감지 시간 → 수정 적기 (12~18h 후) */
function getOptimalWindow(detectedAt: string): { start: Date; end: Date } {
  const detected = new Date(detectedAt);
  return {
    start: new Date(detected.getTime() + 12 * 60 * 60 * 1000),
    end: new Date(detected.getTime() + 18 * 60 * 60 * 1000),
  };
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatOptimalTime(detectedAt: string): string {
  const { start, end } = getOptimalWindow(detectedAt);
  const now = new Date();

  if (now > end) return '⏰ 적기 지남';
  if (now > start) return `🔴 지금! (~${formatTime(end)})`;
  return `${formatTime(start)}~${formatTime(end)}`;
}

/** 목장의 대표 수정 적기가 오전인지 판단 */
function isMorningFarm(farm: FarmEstrus): boolean {
  if (farm.animals.length === 0) return true;
  const first = farm.animals[0];
  if (!first) return true;
  // 가장 빠른 적기 시작 기준
  const earliest = farm.animals.reduce((min, a) => {
    const { start } = getOptimalWindow(a.detectedAt);
    return start < min ? start : min;
  }, getOptimalWindow(first.detectedAt).start);
  return earliest.getHours() < 12;
}

export function InseminatorDashboard({ onFarmClick }: Props): React.JSX.Element {
  const [data, setData] = useState<InseminatorStats | null>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const selectedFarmIds = useFarmStore((s) => s.selectedFarmIds);
  const farmIdsParam = selectedFarmIds.length > 0 ? `&farmIds=${selectedFarmIds.join(',')}` : '';

  useEffect(() => {
    Promise.all([
      apiGet<{ items: readonly { eventId: string; farmId: string; farmName: string; animalId: string; earTag: string; eventType: string; detectedAt: string; severity: string }[]; total: number }>(
        `/unified-dashboard/drilldown?eventType=estrus${farmIdsParam}`
      ),
      apiGet<{ total: number }>(`/unified-dashboard/drilldown?eventType=insemination${farmIdsParam}`),
      apiGet<{ total: number }>(`/unified-dashboard/drilldown?eventType=pregnancy_check${farmIdsParam}`),
      apiGet<{ total: number }>(`/unified-dashboard/drilldown?eventType=no_insemination${farmIdsParam}`),
    ]).then(([estrusRes, insemRes, pregRes, noInsemRes]) => {
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

  // AM/PM 분류
  const amFarms = data.farmBreakdown.filter((f) => isMorningFarm(f));
  const pmFarms = data.farmBreakdown.filter((f) => !isMorningFarm(f));

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

      {/* AM/PM 수정 경로 */}
      <div style={{
        background: 'var(--ct-card)',
        border: '1px solid var(--ct-border)',
        borderRadius: 12,
        padding: '16px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--ct-text)', margin: 0 }}>
            🗺️ 오늘 수정 경로
          </h3>
          <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>
            총 {data.todayEstrus}두 · {data.farmBreakdown.length}개 농장
          </span>
        </div>

        {data.farmBreakdown.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--ct-text-muted)', fontSize: 13 }}>
            ✅ 오늘 수정 대상이 없습니다
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 500, overflowY: 'auto' }}>
            {/* 오전 경로 */}
            {amFarms.length > 0 && (
              <RouteSection
                label="☀️ 오전 수정"
                farms={amFarms}
                color="#f59e0b"
                onFarmClick={onFarmClick}
                onAnimalNavigate={(aid) => navigate(`/cow/${aid}`)}
              />
            )}
            {/* 오후 경로 */}
            {pmFarms.length > 0 && (
              <RouteSection
                label="🌙 오후 수정"
                farms={pmFarms}
                color="#6366f1"
                onFarmClick={onFarmClick}
                onAnimalNavigate={(aid) => navigate(`/cow/${aid}`)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** AM/PM 경로 섹션 */
function RouteSection({
  label,
  farms,
  color,
  onFarmClick,
  onAnimalNavigate,
}: {
  readonly label: string;
  readonly farms: readonly FarmEstrus[];
  readonly color: string;
  readonly onFarmClick?: (farmId: string) => void;
  readonly onAnimalNavigate: (animalId: string) => void;
}): React.JSX.Element {
  const totalCount = farms.reduce((sum, f) => sum + f.estrusCount, 0);

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
        padding: '6px 10px',
        borderRadius: 6,
        background: `${color}15`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, color }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
          {farms.length}개 농장 · {totalCount}두
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {farms.map((farm, idx) => (
          <div
            key={farm.farmId}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--ct-bg)',
              border: '1px solid var(--ct-border)',
            }}
          >
            {/* 농장 헤더 */}
            <div
              onClick={() => onFarmClick?.(farm.farmId)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, color: '#fff',
                  background: color, borderRadius: '50%',
                  width: 20, height: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {idx + 1}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ct-text)' }}>
                  {farm.farmName}
                </span>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 800, color,
                background: `${color}15`, padding: '2px 8px', borderRadius: 10,
              }}>
                {farm.estrusCount}두
              </span>
            </div>

            {/* 개체 목록 — 클릭 시 개체 대시보드 이동 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 26 }}>
              {farm.animals.slice(0, 6).map((a) => {
                const timing = formatOptimalTime(a.detectedAt);
                const isUrgent = timing.includes('지금') || timing.includes('지남');
                return (
                  <div
                    key={a.animalId}
                    onClick={() => onAnimalNavigate(a.animalId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') onAnimalNavigate(a.animalId); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 11,
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: isUrgent ? 'rgba(239,68,68,0.1)' : 'var(--ct-card)',
                      cursor: 'pointer',
                      border: '1px solid var(--ct-border)',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#22c55e' }}>
                      #{a.earTag}
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
    </div>
  );
}
