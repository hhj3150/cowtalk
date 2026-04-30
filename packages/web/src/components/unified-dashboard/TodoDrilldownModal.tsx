// 통합 대시보드 — To-do 드릴다운 모달
// 클릭한 항목의 상세 목록 + 수의학 액션플랜
// 소 개체를 클릭하면 → AnimalTimelineModal (smaXtec 차트)

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGetWithRetry, describeColdPathError } from '@web/api/client';
import { AnimalTimelineModal } from './AnimalTimelineModal';

// ── 타입 ──

interface VetActionStep {
  readonly step: number;
  readonly instruction: string;
  readonly detail: string;
  readonly timeframe: string;
  readonly responsible: string;
}

interface VetActionPlan {
  readonly eventType: string;
  readonly title: string;
  readonly urgency: string;
  readonly actions: readonly VetActionStep[];
  readonly differentialDiagnosis: readonly string[];
  readonly epidemiologicalNote: string | null;
  readonly preventiveMeasures: readonly string[];
}

interface DrilldownItem {
  readonly eventId: string;
  readonly eventType?: string;
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
  readonly actionPlans?: Readonly<Record<string, VetActionPlan>>;
}

interface Props {
  readonly eventType: string;
  readonly label: string;
  readonly farmId?: string | null;
  readonly onClose: () => void;
  readonly onAnimalClick?: (animalId: string) => void;
  readonly onSovereignClick?: (animalId: string) => void;
}

// ── 상수 ──

const EVENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  temperature_high: '🌡️ 체온 상승',
  temperature_low: '🌡️ 체온 하강',
  rumination_decrease: '🔄 반추 감소',
  rumination_warning: '🔄 반추 이상',
  health_general: '🏥 건강 종합',
  health_warning: '🏥 건강 경고',
  clinical_condition: '🏥 임상 증상',
  calving_detection: '🐮 분만 감지',
  calving_imminent: '🐮 분만 임박',
  calving_confirmation: '✅ 분만 확인',
  estrus: '💕 발정',
  activity_decrease: '📉 활동 감소',
  drinking_decrease: '💧 음수 감소',
  ph_warning: '⚗️ pH 이상',
  fertility_warning: '💕 번식 이상',
};

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

const URGENCY_COLORS: Record<string, string> = {
  immediate: '#ef4444',
  within_2h: '#f97316',
  within_6h: '#eab308',
  within_24h: '#3b82f6',
  scheduled: '#6b7280',
};

const URGENCY_LABELS: Record<string, string> = {
  immediate: '즉시',
  within_2h: '2시간 이내',
  within_6h: '6시간 이내',
  within_24h: '24시간 이내',
  scheduled: '예정',
};

const RESPONSIBLE_LABELS: Record<string, string> = {
  farmer: '🧑‍🌾 농장주',
  veterinarian: '🩺 수의사',
  quarantine_officer: '🛡️ 방역관',
};

// ── 유틸 ──

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// ── 액션플랜 패널 컴포넌트 ──

function ActionPlanPanel({ plan }: { readonly plan: VetActionPlan }): React.JSX.Element {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(0,214,126,0.04) 0%, rgba(0,214,126,0.01) 100%)',
        border: '1px solid rgba(0,214,126,0.2)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {/* 플랜 헤더 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          borderBottom: expanded ? '1px solid rgba(0,214,126,0.15)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>📋</span>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ct-text)' }}>
            {plan.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 6,
              background: `${URGENCY_COLORS[plan.urgency] ?? '#6b7280'}20`,
              color: URGENCY_COLORS[plan.urgency] ?? '#6b7280',
              letterSpacing: 0.3,
            }}
          >
            ⏰ {URGENCY_LABELS[plan.urgency] ?? plan.urgency}
          </span>
          <span style={{ color: 'var(--ct-text-secondary)', fontSize: 14, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▾
          </span>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '12px 16px 16px' }}>
          {/* 액션 스텝 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {plan.actions.map((action) => (
              <div
                key={action.step}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--ct-border)',
                }}
              >
                {/* 스텝 번호 */}
                <div style={{
                  minWidth: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'var(--ct-primary)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                  flexShrink: 0,
                }}>
                  {action.step}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* 제목행 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--ct-text)' }}>
                      {action.instruction}
                    </span>
                    <span style={{
                      fontSize: 9,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.06)',
                      color: 'var(--ct-text-secondary)',
                      whiteSpace: 'nowrap',
                    }}>
                      {RESPONSIBLE_LABELS[action.responsible] ?? action.responsible}
                    </span>
                    <span style={{
                      fontSize: 9,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(59,130,246,0.1)',
                      color: '#60a5fa',
                      whiteSpace: 'nowrap',
                    }}>
                      ⏱ {action.timeframe}
                    </span>
                  </div>
                  {/* 상세 설명 */}
                  <p style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--ct-text-secondary)', margin: 0 }}>
                    {action.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* 감별 진단 */}
          {plan.differentialDiagnosis.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginBottom: 6, letterSpacing: 0.3 }}>
                🔍 감별 진단 (Differential Diagnosis)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {plan.differentialDiagnosis.map((dx) => (
                  <span
                    key={dx}
                    style={{
                      fontSize: 10,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'rgba(245,158,11,0.08)',
                      color: 'var(--ct-text-secondary)',
                      lineHeight: 1.6,
                    }}
                  >
                    {dx}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 역학 주의사항 */}
          {plan.epidemiologicalNote && (
            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.15)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
                🌍 역학적 주의 (Epidemiological Alert)
              </div>
              <p style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--ct-text-secondary)', margin: 0 }}>
                {plan.epidemiologicalNote}
              </p>
            </div>
          )}

          {/* 예방 조치 */}
          {plan.preventiveMeasures.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ct-primary)', marginBottom: 6 }}>
                🛡️ 예방 조치
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {plan.preventiveMeasures.map((m) => (
                  <div key={m} style={{ fontSize: 10, color: 'var(--ct-text-secondary)', paddingLeft: 14, position: 'relative', lineHeight: 1.6 }}>
                    <span style={{ position: 'absolute', left: 0, top: 0 }}>•</span>
                    {m}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 메인 모달 ──

export function TodoDrilldownModal({ eventType, label, farmId, onClose, onAnimalClick, onSovereignClick }: Props): React.JSX.Element {
  const [data, setData] = useState<DrilldownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; raw: string } | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'list' | 'actions'>('list');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRetryAttempt(0);

    const params = new URLSearchParams({ eventType });
    if (farmId) params.set('farmId', farmId);

    // 콜드패스 재시도: 8s → 15s → 30s 점진 timeout (503/타임아웃만, 4xx 즉시 throw)
    apiGetWithRetry<DrilldownResponse>(
      `/unified-dashboard/drilldown?${params.toString()}`,
      undefined,
      { onAttempt: ({ attempt }) => { if (!cancelled) setRetryAttempt(attempt); } },
    )
      .then((result) => {
        if (cancelled) return;
        // 프론트엔드 안전장치: 같은 귀표번호+이벤트타입 중복 제거 (최신 유지)
        const seen = new Set<string>();
        const deduplicatedItems = result.items.filter((item) => {
          const key = `${item.farmId}-${item.earTag}-${item.eventType ?? ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setData({ ...result, items: deduplicatedItems, total: deduplicatedItems.length });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError({
          message: describeColdPathError(err),
          raw: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        });
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [eventType, farmId, retryNonce]);

  // ESC 키로 닫기
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        if (selectedAnimalId) {
          setSelectedAnimalId(null);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, selectedAnimalId]);

  // 농장별 그룹핑
  const groupedByFarm = data?.items.reduce<Record<string, DrilldownItem[]>>((acc, item) => {
    const key = item.farmName || item.farmId;
    return {
      ...acc,
      [key]: [...(acc[key] ?? []), item],
    };
  }, {}) ?? {};

  const actionPlans = data?.actionPlans ?? {};
  const actionPlanList = Object.values(actionPlans);
  const hasActionPlans = actionPlanList.length > 0;

  // 이벤트 유형별 건수 요약
  const typeSummary = data?.items.reduce<Record<string, number>>((acc, item) => {
    const et = item.eventType ?? 'unknown';
    return { ...acc, [et]: (acc[et] ?? 0) + 1 };
  }, {}) ?? {};

  return (
    <>
      {/* 오버레이 */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* 모달 */}
        <div
          className="relative w-full rounded-xl shadow-2xl"
          style={{
            background: 'var(--ct-card)',
            border: '1px solid var(--ct-border)',
            maxHeight: '85vh',
            maxWidth: hasActionPlans ? 900 : 640,
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
                  {data ? `총 ${data.total}건` : '로딩 중...'}
                </span>
                {/* 유형별 요약 뱃지 */}
                {Object.entries(typeSummary).slice(0, 5).map(([et, cnt]) => (
                  <span
                    key={et}
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.06)',
                      color: 'var(--ct-text-secondary)',
                    }}
                  >
                    {EVENT_TYPE_LABELS[et] ?? et} {cnt}
                  </span>
                ))}
              </div>
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

          {/* 탭 바 */}
          {hasActionPlans && (
            <div style={{ display: 'flex', borderBottom: '1px solid var(--ct-border)', padding: '0 24px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: activeTab === 'list' ? 700 : 500,
                  color: activeTab === 'list' ? 'var(--ct-primary)' : 'var(--ct-text-secondary)',
                  borderBottom: activeTab === 'list' ? '2px solid var(--ct-primary)' : '2px solid transparent',
                  background: 'none',
                  border: 'none',
                  borderBottomWidth: 2,
                  borderBottomStyle: 'solid',
                  borderBottomColor: activeTab === 'list' ? 'var(--ct-primary)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                📋 알람 목록 ({data?.total ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('actions')}
                style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: activeTab === 'actions' ? 700 : 500,
                  color: activeTab === 'actions' ? 'var(--ct-primary)' : 'var(--ct-text-secondary)',
                  background: 'none',
                  border: 'none',
                  borderBottomWidth: 2,
                  borderBottomStyle: 'solid',
                  borderBottomColor: activeTab === 'actions' ? 'var(--ct-primary)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                🩺 수의학 액션플랜 ({actionPlanList.length})
              </button>
            </div>
          )}

          {/* 본문 */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading && (
              <div className="flex flex-col items-center justify-center gap-2 py-12">
                <div className="flex items-center">
                  <div
                    className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
                    style={{ borderColor: 'var(--ct-primary)', borderTopColor: 'transparent' }}
                  />
                  <span className="ml-3 text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
                    {retryAttempt === 0
                      ? '데이터 조회 중...'
                      : `서버 응답이 늦어 재시도 중... (${retryAttempt}/2)`}
                  </span>
                </div>
                {retryAttempt > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>
                    콜드 스타트 중일 수 있습니다. 잠시만 기다려 주세요.
                  </span>
                )}
              </div>
            )}

            {error && (
              <div
                className="rounded-lg px-4 py-4"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
              >
                <div style={{ fontSize: 13, color: 'var(--ct-text)', marginBottom: 10, lineHeight: 1.6 }}>
                  ⚠️ {error.message}
                </div>
                <button
                  type="button"
                  onClick={() => setRetryNonce((n) => n + 1)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                  style={{ background: 'var(--ct-primary)', cursor: 'pointer' }}
                >
                  다시 시도
                </button>
                {import.meta.env.DEV && (
                  <pre
                    style={{
                      marginTop: 10,
                      padding: 8,
                      background: 'rgba(0,0,0,0.3)',
                      color: '#fca5a5',
                      fontSize: 10,
                      borderRadius: 6,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {error.raw}
                  </pre>
                )}
              </div>
            )}

            {data && data.items.length === 0 && (
              <div className="py-12 text-center text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
                발생한 이벤트가 없습니다.
              </div>
            )}

            {/* 알람 목록 탭 */}
            {data && data.items.length > 0 && activeTab === 'list' && (
              <div className="flex flex-col gap-4">
                {/* 간단 액션 요약 (목록 상단) */}
                {hasActionPlans && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'rgba(0,214,126,0.06)',
                      border: '1px solid rgba(0,214,126,0.15)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>💡</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ct-primary)', marginBottom: 4 }}>
                        즉시 조치 사항
                      </div>
                      {actionPlanList.slice(0, 3).map((plan) => (
                        <div key={plan.eventType} style={{ fontSize: 11, color: 'var(--ct-text-secondary)', marginBottom: 2, lineHeight: 1.6 }}>
                          <strong style={{ color: 'var(--ct-text)' }}>{plan.title.split('—')[0]?.trim()}</strong>
                          {' — '}{plan.actions[0]?.instruction ?? ''}
                          <span style={{ color: URGENCY_COLORS[plan.urgency] ?? '#6b7280', marginLeft: 6, fontSize: 10 }}>
                            ({URGENCY_LABELS[plan.urgency] ?? plan.urgency})
                          </span>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setActiveTab('actions')}
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          color: 'var(--ct-primary)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontWeight: 600,
                          padding: 0,
                        }}
                      >
                        상세 액션플랜 보기 →
                      </button>
                    </div>
                  </div>
                )}

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

                    {/* 동물 목록 — 클릭 가능 */}
                    <div className="divide-y" style={{ borderColor: 'var(--ct-border)' }}>
                      {items.map((item) => (
                        <button
                          key={item.eventId}
                          type="button"
                          onClick={() => {
                            if (item.animalId) {
                              if (onAnimalClick) {
                                onAnimalClick(item.animalId);
                                onClose();
                              } else {
                                setSelectedAnimalId(item.animalId);
                              }
                            }
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-black/5"
                          style={{ cursor: item.animalId ? 'pointer' : 'default' }}
                        >
                          {/* severity dot */}
                          <span
                            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                            style={{ background: SEVERITY_COLORS[item.severity] ?? '#9ca3af' }}
                          />

                          {/* 귀표번호 — 클릭 시 개체 프로필 이동 */}
                          <span
                            role="link"
                            tabIndex={0}
                            className="min-w-[80px] text-sm font-medium"
                            style={{
                              color: item.animalId ? 'var(--ct-primary)' : 'var(--ct-text)',
                              textDecoration: item.animalId ? 'underline' : 'none',
                              textUnderlineOffset: '2px',
                              cursor: item.animalId ? 'pointer' : 'default',
                            }}
                            title={item.animalId ? '개체 프로필 보기' : undefined}
                            onClick={(e) => { if (item.animalId) { e.stopPropagation(); navigate(`/cow/${item.animalId}`); } }}
                            onKeyDown={(e) => { if (item.animalId && e.key === 'Enter') navigate(`/cow/${item.animalId}`); }}
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

                          {/* 이벤트 유형 */}
                          {item.eventType && (
                            <span
                              className="rounded px-1.5 py-0.5 text-xs"
                              style={{
                                background: 'rgba(255,255,255,0.06)',
                                color: 'var(--ct-text-secondary)',
                                fontSize: 10,
                              }}
                            >
                              {EVENT_TYPE_LABELS[item.eventType] ?? item.eventType}
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

                          {/* 드릴다운 화살표 */}
                          {item.animalId && (
                            <span
                              className="text-xs"
                              style={{ color: 'var(--ct-primary)' }}
                            >
                              ›
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 액션플랜 탭 */}
            {data && activeTab === 'actions' && (
              <div className="flex flex-col gap-4">
                {/* 역학 경고 배너 */}
                {actionPlanList.some((p) => p.epidemiologicalNote) && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 10,
                      background: 'rgba(239,68,68,0.06)',
                      border: '1px solid rgba(239,68,68,0.2)',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>
                      🌍 역학적 모니터링 권고 (Epidemiological Advisory)
                    </div>
                    <p style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--ct-text-secondary)', margin: 0 }}>
                      금일 발생 알람 중 전염성 질병 관련 이벤트가 포함되어 있습니다.
                      지역 내 질병 발생 현황을 교차 확인하고, 군집 발생 시 방역당국 보고를 고려하십시오.
                    </p>
                  </div>
                )}

                {actionPlanList.length === 0 && (
                  <div className="py-12 text-center text-sm" style={{ color: 'var(--ct-text-secondary)' }}>
                    등록된 액션플랜이 없습니다.
                  </div>
                )}

                {actionPlanList.map((plan) => (
                  <ActionPlanPanel key={plan.eventType} plan={plan} />
                ))}
              </div>
            )}
          </div>

          {/* 하단 */}
          <div
            className="flex items-center justify-between border-t px-6 py-3"
            style={{ borderColor: 'var(--ct-border)' }}
          >
            <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
              소를 클릭하면 smaXtec 이벤트 히스토리를 볼 수 있습니다
            </span>
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

      {/* 개체 타임라인 모달 (2차 드릴다운) */}
      {selectedAnimalId && (
        <AnimalTimelineModal
          animalId={selectedAnimalId}
          onClose={() => setSelectedAnimalId(null)}
          onSovereignClick={onSovereignClick}
        />
      )}
    </>
  );
}
