// 통합 대시보드 — To-do 드릴다운 모달
// 클릭한 항목의 상세 목록: 어떤 농장, 몇 번 소, 언제 발생

import React, { useEffect, useState } from 'react';
import { apiGet } from '@web/api/client';

interface DrilldownItem {
  readonly eventId: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly animalId: string | null;
  readonly earTag: string;
  readonly animalName: string;
  readonly severity: string;
  readonly detectedAt: string;
}

interface DrilldownResponse {
  readonly eventType: string;
  readonly total: number;
  readonly items: readonly DrilldownItem[];
}

interface Props {
  readonly eventType: string;
  readonly label: string;
  readonly farmId?: string | null;
  readonly onClose: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
};

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function TodoDrilldownModal({ eventType, label, farmId, onClose }: Props): React.JSX.Element {
  const [data, setData] = useState<DrilldownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ eventType });
    if (farmId) params.set('farmId', farmId);

    apiGet<DrilldownResponse>(`/unified-dashboard/drilldown?${params.toString()}`)
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [eventType, farmId]);

  // ESC 키로 닫기
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // 농장별 그룹핑
  const groupedByFarm = data?.items.reduce<Record<string, DrilldownItem[]>>((acc, item) => {
    const key = item.farmName || item.farmId;
    return {
      ...acc,
      [key]: [...(acc[key] ?? []), item],
    };
  }, {}) ?? {};

  return (
    // 오버레이
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 모달 */}
      <div
        className="relative w-full max-w-2xl rounded-xl shadow-2xl"
        style={{
          background: 'var(--ct-card)',
          border: '1px solid var(--ct-border)',
          maxHeight: '80vh',
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
              {label}
            </h2>
            <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
              {data ? `금일 총 ${data.total}건` : '로딩 중...'}
              {' · '}농장별 상세 목록
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/10"
            style={{ color: 'var(--ct-text-secondary)' }}
          >
            ✕
          </button>
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
                데이터 조회 중...
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#fef2f2', color: '#dc2626' }}>
              오류: {error}
            </div>
          )}

          {data && data.items.length === 0 && (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
              금일 발생한 이벤트가 없습니다.
            </div>
          )}

          {data && data.items.length > 0 && (
            <div className="flex flex-col gap-4">
              {Object.entries(groupedByFarm).map(([farmName, items]) => (
                <div
                  key={farmName}
                  className="rounded-lg border"
                  style={{ borderColor: 'var(--ct-border)' }}
                >
                  {/* 농장 헤더 */}
                  <div
                    className="flex items-center justify-between border-b px-4 py-2.5"
                    style={{
                      borderColor: 'var(--ct-border)',
                      background: 'var(--ct-bg)',
                    }}
                  >
                    <span className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>
                      🏠 {farmName}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        background: 'var(--ct-primary)',
                        color: '#ffffff',
                      }}
                    >
                      {items.length}건
                    </span>
                  </div>

                  {/* 동물 목록 */}
                  <div className="divide-y" style={{ borderColor: 'var(--ct-border)' }}>
                    {items.map((item) => (
                      <div
                        key={item.eventId}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-black/5"
                      >
                        {/* severity dot */}
                        <span
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{ background: SEVERITY_COLORS[item.severity] ?? '#9ca3af' }}
                        />

                        {/* 귀표번호 */}
                        <span
                          className="min-w-[80px] text-sm font-medium"
                          style={{ color: 'var(--ct-text)' }}
                        >
                          {item.earTag}
                        </span>

                        {/* 이름 */}
                        {item.animalName && (
                          <span
                            className="text-xs"
                            style={{ color: 'var(--ct-text-secondary)' }}
                          >
                            {item.animalName}
                          </span>
                        )}

                        <span className="flex-1" />

                        {/* severity 뱃지 */}
                        <span
                          className="rounded px-1.5 py-0.5 text-xs"
                          style={{
                            background: `${SEVERITY_COLORS[item.severity] ?? '#9ca3af'}20`,
                            color: SEVERITY_COLORS[item.severity] ?? '#9ca3af',
                          }}
                        >
                          {SEVERITY_LABELS[item.severity] ?? item.severity}
                        </span>

                        {/* 시간 */}
                        <span
                          className="min-w-[40px] text-right text-xs"
                          style={{ color: 'var(--ct-text-secondary)' }}
                        >
                          {formatTime(item.detectedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
    </div>
  );
}
