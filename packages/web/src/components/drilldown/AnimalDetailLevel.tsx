// 드릴다운 3단계 — 개체 상세 + 센서 차트

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '@web/api/client';
import { SensorChart } from '@web/components/data/SensorChart';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import { Badge } from '@web/components/common/Badge';
import { TraceSection } from '@web/components/trace/TraceSection';

interface AnimalDetail {
  readonly animalId: string;
  readonly earTag: string;
  readonly name: string;
  readonly breed: string;
  readonly status: string;
  readonly birthDate: string | null;
  readonly currentDeviceId: string | null;
  readonly farmId: string;
}

interface Props {
  readonly animalId: string;
}

const SEVERITY_DOTS: Record<string, string> = {
  critical: 'var(--ct-danger)',
  high: 'var(--ct-warning)',
  medium: '#EAB308',
  low: 'var(--ct-success)',
};

export function AnimalDetailLevel({ animalId }: Props): React.JSX.Element {
  const navigate = useNavigate();
  const { data: animal, isLoading } = useQuery({
    queryKey: ['drilldown', 'animal', animalId],
    queryFn: () => apiGet<AnimalDetail>(`/animals/${animalId}`),
  });

  if (isLoading) return <LoadingSkeleton lines={8} />;

  return (
    <div className="space-y-6">
      {/* 개체 정보 카드 */}
      <div className="ct-card p-4" style={{ background: 'var(--ct-bg)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--ct-text)' }}>
              {animal?.earTag ?? animalId.slice(0, 8)}
              {animal?.name && <span className="ml-2 text-base font-normal" style={{ color: 'var(--ct-text-secondary)' }}>({animal.name})</span>}
            </h3>
            <div className="mt-1 flex items-center gap-3 text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
              {animal?.breed && <span>품종: {animal.breed}</span>}
              {animal?.birthDate && (
                <span>생년월일: {new Date(animal.birthDate).toLocaleDateString('ko-KR')}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              label={animal?.status === 'active' ? '활동' : animal?.status ?? '알수없음'}
              variant={animal?.status === 'active' ? 'success' : 'medium'}
            />
            {animal?.currentDeviceId && (
              <Badge label="센서 연결" variant="success" />
            )}
            <button
              type="button"
              onClick={() => navigate(`/cow/${animalId}`)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: '#16a34a' }}
            >
              🧠 소버린 AI
            </button>
          </div>
        </div>
      </div>

      {/* 🏛️ 이력제 — 클릭 시 공공데이터 펼침 */}
      <div>
        <TraceSection animalId={animalId} compact />
      </div>

      {/* 센서 차트 */}
      <div>
        <h4 className="mb-3 text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>센서 데이터</h4>
        <div className="ct-card p-4">
          <SensorChart animalId={animalId} defaultRange="24h" height={350} />
        </div>
      </div>

      {/* 최근 이벤트 */}
      <RecentEvents animalId={animalId} />
    </div>
  );
}

function RecentEvents({ animalId }: { animalId: string }): React.JSX.Element {
  interface EventRow {
    readonly eventId: string;
    readonly eventType: string;
    readonly severity: string;
    readonly detectedAt: string;
    readonly details: Record<string, unknown>;
  }

  const { data, isLoading } = useQuery({
    queryKey: ['drilldown', 'events', animalId],
    queryFn: () => apiGet<readonly EventRow[]>('/events', { animalId, limit: 10 }),
  });

  if (isLoading) return <LoadingSkeleton lines={3} />;

  const events: readonly EventRow[] = Array.isArray(data) ? data : [];

  if (events.length === 0) {
    return (
      <div>
        <h4 className="mb-3 text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>최근 이벤트</h4>
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>최근 이벤트가 없습니다.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="mb-3 text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>최근 이벤트</h4>
      <div className="space-y-2">
        {events.map((evt) => (
          <div
            key={evt.eventId ?? `${evt.eventType}-${evt.detectedAt}`}
            className="ct-card flex items-center justify-between p-3"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: SEVERITY_DOTS[evt.severity] ?? 'var(--ct-success)' }}
              />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--ct-text)' }}>{evt.eventType}</p>
                <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                  {new Date(evt.detectedAt).toLocaleString('ko-KR')}
                </p>
              </div>
            </div>
            <Badge label={evt.severity} variant={evt.severity as 'high' | 'medium' | 'low'} />
          </div>
        ))}
      </div>
    </div>
  );
}
