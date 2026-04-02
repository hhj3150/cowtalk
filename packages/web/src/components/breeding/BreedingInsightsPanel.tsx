// 번식 인사이트 패널 — 4종 분류 탭
// 무발정우 / 불규칙발정우 / 유산의심우 / 수정실패우

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '@web/api/client';

interface InsightAnimal {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly parity: number;
  readonly daysInMilk?: number | null;
  readonly detail: string;
}

interface BreedingInsights {
  readonly nonCycling: readonly InsightAnimal[];
  readonly irregularCycle: readonly InsightAnimal[];
  readonly abortionRisk: readonly InsightAnimal[];
  readonly repeatBreeder: readonly InsightAnimal[];
}

type TabKey = 'nonCycling' | 'irregularCycle' | 'abortionRisk' | 'repeatBreeder';

const TABS: { key: TabKey; label: string; icon: string; color: string }[] = [
  { key: 'nonCycling', label: '무발정', icon: '🔕', color: '#64748b' },
  { key: 'irregularCycle', label: '불규칙', icon: '🔄', color: '#f97316' },
  { key: 'abortionRisk', label: '유산의심', icon: '⚠️', color: '#ef4444' },
  { key: 'repeatBreeder', label: '수정실패', icon: '❌', color: '#dc2626' },
];

interface Props {
  readonly farmId?: string;
}

export function BreedingInsightsPanel({ farmId }: Props): React.JSX.Element {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('nonCycling');

  const url = farmId ? `/breeding/insights/${farmId}` : '/breeding/insights';
  const { data, isLoading } = useQuery<BreedingInsights>({
    queryKey: ['breeding-insights', farmId],
    queryFn: () => apiGet<BreedingInsights>(url),
    staleTime: 5 * 60_000,
  });

  const activeList = data?.[activeTab] ?? [];
  const tab = TABS.find((t) => t.key === activeTab)!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 탭 */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const count = data?.[t.key]?.length ?? 0;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: 1,
                minWidth: 70,
                padding: '6px 8px',
                borderRadius: 8,
                border: isActive ? `1.5px solid ${t.color}` : '1px solid var(--ct-border)',
                background: isActive ? `${t.color}15` : 'var(--ct-bg)',
                color: isActive ? t.color : 'var(--ct-text-muted)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: isActive ? 700 : 400,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {count > 0 && (
                <span style={{
                  background: t.color,
                  color: '#fff',
                  borderRadius: 10,
                  padding: '1px 6px',
                  fontSize: 10,
                  fontWeight: 700,
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 16, color: 'var(--ct-text-muted)', fontSize: 12 }}>로딩 중...</div>
      ) : activeList.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 16, color: 'var(--ct-text-muted)', fontSize: 12 }}>
          ✅ {tab.label} 해당 개체 없음
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 260, overflowY: 'auto' }}>
          {activeList.map((a) => (
            <button
              key={a.animalId}
              type="button"
              onClick={() => navigate(`/cow/${a.animalId}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 8,
                background: `${tab.color}08`,
                border: `1px solid ${tab.color}25`,
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: `${tab.color}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                flexShrink: 0,
              }}>
                {tab.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ct-text)' }}>
                  #{a.earTag}
                  <span style={{ fontWeight: 400, color: 'var(--ct-text-muted)', marginLeft: 6, fontSize: 11 }}>
                    {a.farmName} · {a.parity}산차
                    {a.daysInMilk ? ` · DIM ${a.daysInMilk}` : ''}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: tab.color, marginTop: 2 }}>{a.detail}</div>
              </div>
              <span style={{ fontSize: 10, color: 'var(--ct-text-muted)', flexShrink: 0 }}>→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
