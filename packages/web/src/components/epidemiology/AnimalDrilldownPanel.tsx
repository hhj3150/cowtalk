// 공통 개체 상세 드릴다운 패널
// 체온 이력 LineChart + smaXtec 이벤트 타임라인 + AI 분석 버튼
// 우측에서 슬라이드인 — fixed z-50

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { getAnimalDetail } from '@web/api/animal.api';
import { getSensorHistory } from '@web/api/sensor.api';
import { TraceSection } from '@web/components/trace/TraceSection';
import { InseminationPanel } from '@web/components/breeding/InseminationPanel';

// ===========================
// 타입
// ===========================

interface Props {
  readonly animalId: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly onClose: () => void;
  readonly onAiRequest: (triggerText: string) => void;
}

// smaXtec 이벤트 (Animal Detail events 필드)
interface SmaxtecEvent {
  readonly eventId?: string;
  readonly eventType?: string;
  readonly severity?: string;
  readonly detectedAt?: string;
  readonly description?: string;
}

// GET /api/animals/:animalId 응답 구조 (animal 중첩 없이 직접 반환)
interface AnimalDetailResponse {
  readonly animalId: string;
  readonly earTag: string;
  readonly farmId: string;
  readonly farmName?: string;
  readonly name?: string;
  readonly breed?: string;
  readonly status: string;
  readonly latestTemperature?: number | null;
  readonly latestActivity?: number | null;
  readonly latestRumination?: number | null;
  readonly recentEvents?: SmaxtecEvent[];
}

// ===========================
// 헬퍼
// ===========================

const EVENT_LABELS: Record<string, string> = {
  temperature_high: '고체온',
  health_103: '고체온(103)',
  health_104: '고체온(104)',
  health_308: '고체온(308)',
  health_309: '고체온(309)',
  estrus: '발정',
  calving: '분만',
  insemination: '수정',
  heat_stress: '열 스트레스',
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}시`;
}

function severityColor(severity?: string): string {
  if (severity === 'critical') return '#ef4444';
  if (severity === 'high') return '#f97316';
  if (severity === 'medium') return '#eab308';
  return '#6b7280';
}

// ===========================
// 개체 상태 뱃지
// ===========================

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const cfg: Record<string, { label: string; cls: string }> = {
    active: { label: '활성', cls: 'bg-green-100 text-green-700' },
    sick: { label: '이상', cls: 'bg-red-100 text-red-700' },
    pregnant: { label: '임신', cls: 'bg-blue-100 text-blue-700' },
    dry: { label: '건유', cls: 'bg-gray-100 text-gray-700' },
    sold: { label: '출하', cls: 'bg-slate-100 text-slate-500' },
  };
  const c = cfg[status] ?? { label: status, cls: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.cls}`}>
      {c.label}
    </span>
  );
}

// ===========================
// 메인 컴포넌트
// ===========================

export function AnimalDrilldownPanel({
  animalId,
  farmName,
  onClose,
  onAiRequest,
}: Props): React.JSX.Element {
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['animal-detail', animalId],
    queryFn: () => getAnimalDetail(animalId),
    staleTime: 30_000,
  });

  const { data: sensor, isLoading: sensorLoading } = useQuery({
    queryKey: ['sensor-history', animalId, '7d'],
    queryFn: () => getSensorHistory(animalId, '7d'),
    staleTime: 60_000,
  });

  // API는 { animalId, earTag, ..., recentEvents } 형태로 반환 (animal 중첩 없음)
  const animal = detail != null ? (detail as unknown as AnimalDetailResponse) : null;
  const events: readonly SmaxtecEvent[] = animal?.recentEvents ?? [];
  const recentEvents = [...events]
    .filter((e) => e.detectedAt)
    .sort((a, b) => new Date(b.detectedAt!).getTime() - new Date(a.detectedAt!).getTime())
    .slice(0, 10);

  // 체온 차트 데이터 — 6시간 간격으로 샘플링
  const tempData = (sensor?.data ?? [])
    .filter((_, i) => i % 6 === 0)
    .map((d) => ({
      time: fmtTime(d.timestamp),
      temp: d.temperature != null ? Number(d.temperature.toFixed(1)) : null,
    }))
    .filter((d) => d.temp !== null);

  const isLoading = detailLoading || sensorLoading;

  function handleAiRequest(): void {
    const earTag = animal?.earTag ?? animalId;
    const latestTemp = animal?.latestTemperature;

    const sensorCtx = [
      latestTemp != null ? `체온 ${Number(latestTemp).toFixed(1)}°C${Number(latestTemp) >= 39.5 ? ' ⚠️발열' : ''}` : null,
      animal?.latestActivity != null ? `활동량 ${Math.round(Number(animal.latestActivity))}` : null,
      animal?.latestRumination != null ? `반추 ${Math.round(Number(animal.latestRumination))}분` : null,
    ].filter(Boolean).join(', ');

    const eventCtx = recentEvents.length > 0
      ? `[최근 이벤트 ${recentEvents.length}건] ${recentEvents.slice(0, 5).map((e) => {
          const label = EVENT_LABELS[e.eventType ?? ''] ?? e.eventType ?? '이벤트';
          const severity = e.severity ? `(${e.severity})` : '';
          return `${label}${severity}`;
        }).join(', ')}`
      : '[최근 이벤트 없음]';

    const tempChartCtx = tempData.length > 0
      ? `[7일 체온추이] ${tempData.slice(-5).map((d) => `${d.time}:${d.temp}°`).join(' → ')}`
      : '';

    const animalInfo = `[개체] #${earTag}, ${farmName}, 상태: ${animal?.status ?? '—'}`;

    const fullContext = [animalInfo, `[센서] ${sensorCtx || '데이터 없음'}`, eventCtx, tempChartCtx].filter(Boolean).join('\n');

    const trigger = `[팅커벨 AI — 개체 정밀 분석]\n${fullContext}\n\n위 데이터를 기반으로 이 소의 현재 상태를 분석해주세요. 즉각 조치가 필요하면 우선순위별로, 목장주와 수의사가 지금 해야 할 행동을 구체적으로 알려주세요. (${Date.now()})`;
    onAiRequest(trigger);
  }

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      {/* 패널 */}
      <div
        className="fixed right-0 top-0 z-50 flex flex-col overflow-hidden"
        style={{
          width: 'min(100vw, 400px)',
          height: 'calc(100vh - env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 60px)',
          background: 'var(--ct-card)',
          borderLeft: '1px solid var(--ct-border)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        }}
      >
        {/* 헤더 */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--ct-border)' }}
        >
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>
              🐄 개체 상세
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
              {farmName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-2 py-1 rounded"
            style={{ background: 'var(--ct-border)', color: 'var(--ct-text-secondary)' }}
          >
            ✕ 닫기
          </button>
        </div>

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-lg animate-pulse" style={{ background: 'var(--ct-border)' }} />
              ))}
            </div>
          ) : animal == null ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--ct-text-secondary)' }}>
              개체 정보를 불러올 수 없습니다.
            </p>
          ) : (
            <>
              {/* 기본 정보 카드 */}
              <div
                className="rounded-lg p-3 space-y-2"
                style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)' }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>
                    {animal.earTag}
                  </p>
                  <StatusBadge status={animal.status} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <p
                      className="text-lg font-bold"
                      style={{ color: (animal.latestTemperature ?? 0) >= 38.5 ? '#ef4444' : 'var(--ct-primary)' }}
                    >
                      {animal.latestTemperature != null ? `${Number(animal.latestTemperature).toFixed(1)}°` : '—'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>현재 체온</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold" style={{ color: 'var(--ct-text)' }}>
                      {animal.latestActivity != null ? Math.round(Number(animal.latestActivity)) : '—'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>활동량</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold" style={{ color: 'var(--ct-text)' }}>
                      {animal.latestRumination != null ? Math.round(Number(animal.latestRumination)) : '—'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>반추(분)</p>
                  </div>
                </div>
              </div>

              {/* 🏛️ 이력제 번호 → 클릭 시 공공데이터 */}
              <TraceSection animalId={animalId} compact />

              {/* 7일 체온 추이 차트 */}
              <div
                className="rounded-lg p-3"
                style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)' }}
              >
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ct-text)' }}>
                  🌡️ 7일 체온 추이
                </p>
                {tempData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={tempData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--ct-border)" />
                      <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis domain={[37, 42]} tick={{ fontSize: 9 }} unit="°" />
                      <Tooltip formatter={(v: number) => [`${v}°C`, '체온']} />
                      <ReferenceLine y={38.5} stroke="#ef4444" strokeDasharray="4 4" />
                      <Line
                        type="monotone"
                        dataKey="temp"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        dot={false}
                        connectNulls
                        name="체온"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-center py-6" style={{ color: 'var(--ct-text-secondary)' }}>
                    체온 데이터 없음
                  </p>
                )}
              </div>

              {/* smaXtec 이벤트 타임라인 */}
              <div
                className="rounded-lg p-3"
                style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)' }}
              >
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ct-text)' }}>
                  📋 최근 이벤트
                </p>
                {recentEvents.length > 0 ? (
                  <div className="space-y-1.5">
                    {recentEvents.map((evt, idx) => (
                      <div key={`${evt.eventId ?? idx}`} className="flex items-start gap-2">
                        <span
                          className="mt-0.5 h-2 w-2 rounded-full flex-shrink-0"
                          style={{ background: severityColor(evt.severity) }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium leading-tight" style={{ color: 'var(--ct-text)' }}>
                            {EVENT_LABELS[evt.eventType ?? ''] ?? evt.eventType ?? '이벤트'}
                          </p>
                          {evt.detectedAt && (
                            <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                              {fmtTime(evt.detectedAt)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>최근 이벤트 없음</p>
                )}
              </div>

              {/* 💉 번식 — 수정 추천 (발정 상태일 때 특히 유용) */}
              <div
                className="rounded-lg p-3"
                style={{ background: 'var(--ct-bg)', border: '1px solid var(--ct-border)' }}
              >
                <InseminationPanel animalId={animalId} />
              </div>

              {/* AI 분석 버튼 */}
              <button
                type="button"
                onClick={handleAiRequest}
                className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: 'var(--ct-primary, #3b82f6)' }}
              >
                <span>🤖</span>
                <span>팅커벨 AI 분석</span>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
