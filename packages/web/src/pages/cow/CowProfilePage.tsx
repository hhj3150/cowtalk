// 개체별 디지털 트윈 — /cow/:id
// 센서 30일 차트 + 질병/치료 타임라인 + 번식 이력 + AI 건강 점수 + 알람

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet } from '@web/api/client';
import { SensorChartInline } from '@web/components/sensor/SensorChartInline';
import { DryOffModal } from '@web/components/cow/DryOffModal';
import { BreedingTimeline } from '@web/components/cow/BreedingTimeline';
import { TinkerbellAssistant } from '@web/components/unified-dashboard/TinkerbellAssistant';
import { TraceSection } from '@web/components/trace/TraceSection';
import { InseminationPanel } from '@web/components/breeding/InseminationPanel';
import { FarmSemenInventory } from '@web/components/breeding/FarmSemenInventory';
import { PregnancyCheckModal } from '@web/components/breeding/PregnancyCheckModal';
import { SectionErrorBoundary } from '@web/components/common/SectionErrorBoundary';
import { WeightDataCollector } from '@web/components/weight/WeightDataCollector';
import { VaccinationHistory } from '@web/components/vaccine/VaccinationHistory';
import { InspectionResults } from '@web/components/vaccine/InspectionResults';
import { useIsMobile } from '@web/hooks/useIsMobile';
import { AnimalEventPanel } from '@web/components/animals/AnimalEventPanel';
import { useSovereignAlarms } from '@web/hooks/useUnifiedDashboard';
import { SovereignAlarmFeed } from '@web/components/unified-dashboard/SovereignAlarmFeed';

interface CowProfile {
  readonly animalId: string;
  readonly earTag: string;
  readonly name: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly breed: string;
  readonly breedType: string;
  readonly sex: string;
  readonly gender?: string; // legacy alias
  readonly birthDate: string | null;
  readonly lactationStatus: string | null;
  readonly parity: number;
  readonly status: string;
  readonly traceId?: string | null;
}

interface SensorLatest {
  readonly temperature: number | null;      // 마지막 순간 체온 (보조용)
  readonly baselineTemp: number | null;     // 정상체온 — 음수 피크 제외 24h 평균 (KPI 표시용)
  readonly rumination: number | null;       // 마지막 순간 반추
  readonly rumAvg: number | null;           // 24h 평균 반추시간 (KPI 표시용)
  readonly activity: number | null;
  readonly drinking: number | null;         // 마지막 음수량 (l/24h)
  readonly drinkingCount: number;           // 24h 음수횟수 — 체온 급강하 피크 카운팅
}

// ── 센서 분석 헬퍼 ──

/**
 * 정상체온 = 음수 피크(37.5°C 미만) 제외 후 24h 평균
 * 소의 위내 체온은 물 섭취 시 급강하했다가 회복됨.
 * smaXtec 차트의 흰 직선(정상체온 라인)과 동일한 계산.
 *
 * ⚠️ pts.ts는 Unix 초(seconds) 단위 → Date.now() / 1000으로 비교
 */
function computeBaselineTemp(pts: readonly { ts: number; value: number }[]): number | null {
  if (pts.length === 0) return null;
  const cutoff = Date.now() / 1000 - 24 * 60 * 60; // seconds
  const recent = pts.filter((p) => p.ts >= cutoff);
  const src = recent.length > 0 ? recent : pts.slice(-48);
  const valid = src.filter((p) => p.value >= 37.5);
  if (valid.length === 0) return src[src.length - 1]!.value;
  return valid.reduce((s, p) => s + p.value, 0) / valid.length;
}

/**
 * 24h 음수횟수 — 체온 급강하-회복 사이클 카운팅
 *
 * 소가 물을 마시면 위내 온도가 급격히 낮아졌다가 40분~2시간에 걸쳐 정상 회복됨.
 * → 회복 완료 시점을 "음수 1회"로 카운트 (복구 피크 = 1 이벤트)
 *
 * 알고리즘:
 * 1. 베이스라인 = 37.5°C 이상 포인트의 평균
 * 2. 기준 - 1.5°C 이하 → 음수 시작 (DIP_START)
 * 3. 기준 - 0.5°C 이상 → 회복 완료 (DIP_END) → count++
 * 4. 최소 딥 지속시간: 20분 (노이즈 제거)
 * 5. 최소 이벤트 간격: 30분 (동일 음수 세션 중복 방지)
 *
 * ⚠️ pts.ts는 Unix 초(seconds) 단위
 */
function computeDrinkingCount(pts: readonly { ts: number; value: number }[]): number {
  if (pts.length < 5) return 0;
  const cutoff = Date.now() / 1000 - 24 * 60 * 60; // seconds
  const recent = pts.filter((p) => p.ts >= cutoff);
  if (recent.length < 5) return 0;

  const validForBaseline = recent.filter((p) => p.value >= 37.5);
  if (validForBaseline.length < 3) return 0;
  const baseline = validForBaseline.reduce((s, p) => s + p.value, 0) / validForBaseline.length;

  const DIP_THRESHOLD   = baseline - 1.5; // 음수 시작: 1.5°C 이상 낙하
  const RECOVERY_THRESH = baseline - 0.5; // 회복 완료: 0.5°C 이내 복귀
  const MIN_DIP_S       = 20 * 60;        // 최소 딥 지속 20분 (초)
  const MIN_GAP_S       = 30 * 60;        // 이벤트 간 최소 간격 30분 (초)

  let count = 0;
  let inDip = false;
  let dipStartTs = 0;
  let lastEventTs = -(MIN_GAP_S * 2); // 첫 이벤트 허용

  for (const pt of recent) {
    if (!inDip && pt.value < DIP_THRESHOLD) {
      // 음수 시작
      inDip = true;
      dipStartTs = pt.ts;
    } else if (inDip && pt.value >= RECOVERY_THRESH) {
      // 체온 회복 완료 — 음수 1회 카운트
      const dipDuration = pt.ts - dipStartTs;
      const gapSinceLast = dipStartTs - lastEventTs;
      if (dipDuration >= MIN_DIP_S && gapSinceLast >= MIN_GAP_S) {
        count++;
        lastEventTs = pt.ts;
      }
      inDip = false;
    }
  }
  return count;
}

/**
 * 반추 24h 평균 — 마지막 순간 값이 아닌 하루치 10분 단위 전체 평균
 * smaXtec은 10분 간격으로 반추시간을 측정하므로 하루 평균이 더 의미 있음.
 *
 * ⚠️ pts.ts는 Unix 초(seconds) 단위
 */
function computeRumAvg(pts: readonly { ts: number; value: number }[]): number | null {
  if (pts.length === 0) return null;
  const cutoff = Date.now() / 1000 - 24 * 60 * 60; // seconds
  const recent = pts.filter((p) => p.ts >= cutoff);
  const src = recent.length > 3 ? recent : pts.slice(-144); // 최소 144포인트(24h × 6/h)
  return src.reduce((s, p) => s + p.value, 0) / src.length;
}

interface EventItem {
  readonly eventId: string;
  readonly eventType: string;
  readonly severity: string;
  readonly detectedAt: string;
  readonly details: unknown;
}

interface BreedingEvent {
  readonly eventType: string;
  readonly eventDate: string;
  readonly notes: string | null;
}

const EVENT_LABELS: Record<string, string> = {
  estrus: '🔴 발정', insemination: '💉 수정', pregnancy_check: '🔍 임신감정',
  calving_detection: '🍼 분만징후', calving_confirmation: '🍼 분만확인',
  temperature_high: '🌡️ 고체온', rumination_decrease: '🌾 반추저하',
  clinical_condition: '🏥 임상이상', health_general: '💊 건강주의',
  activity_decrease: '🦶 활동저하', activity_increase: '🏃 활동증가',
  dry_off: '🥛 건유전환', fertility_warning: '⚠️ 재발정',
  temperature_low: '❄️ 저체온', no_insemination: '❌ 미수정',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
};

export default function CowProfilePage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [profile, setProfile] = useState<CowProfile | null>(null);
  const [sensor, setSensor] = useState<SensorLatest | null>(null);
  const [events, setEvents] = useState<readonly EventItem[]>([]);
  const [breeding, setBreeding] = useState<readonly BreedingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'timeout' | 'not_found' | null>(null);
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [healthPred, setHealthPred] = useState<{ riskScore: number; riskLevel: string; reasons: string[]; recommendation: string } | null>(null);
  const [estrusPred, setEstrusPred] = useState<{ hasData: boolean; avgCycleDays?: number; daysUntilNext?: number; nextEstrusDate?: string; isWithin3Days?: boolean; reasoning?: string; message?: string } | null>(null);
  const [calvingPred, setCalvingPred] = useState<{ calvingRisk: string; reasons: string[]; recommendation: string } | null>(null);
  const [showDryOff, setShowDryOff] = useState(false);
  const [showPregnancyCheck, setShowPregnancyCheck] = useState(false);
  const [tinkerbellTrigger, setTinkerbellTrigger] = useState<string | undefined>(undefined);

  // 소버린 AI 알람 — 이 개체에 해당하는 것만 필터
  const { data: sovereignData, isLoading: sovereignLoading } = useSovereignAlarms(profile?.farmId ?? null);
  const animalSovereignAlarms = (sovereignData?.alarms ?? []).filter((a) => a.animalId === id);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);

    const controller = new AbortController();
    const { signal } = controller;

    // 타임아웃 래퍼 — 5초 초과 시 null 반환
    function withTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T | null> {
      return Promise.race([
        promise,
        new Promise<null>((resolve) => { setTimeout(() => resolve(null), ms); }),
      ]);
    }

    // 핵심 데이터 (프로필 + 이벤트) — 프로필 우선 로드
    Promise.all([
      withTimeout(apiGet<CowProfile>(`/animals/${id}`), 12000).catch((err) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) return '__NOT_FOUND__';
        return null;
      }),
      withTimeout(apiGet<{ events: readonly EventItem[] }>(`/label-chat/events/${id}`), 10000).catch(() => ({ events: [] as readonly EventItem[] })),
    ]).then(([p, evts]) => {
      if (signal.aborted) return;

      if (p === '__NOT_FOUND__') {
        setLoadError('not_found');
        setLoading(false);
        return;
      }

      if (!p) {
        setLoadError('timeout');
        setLoading(false);
        return;
      }

      setProfile(p as unknown as CowProfile);
      setEvents(evts?.events ?? []);
      setAiScore(null);
      setLoading(false);
    });

    // 센서 데이터 — 별도 비동기 로드 (프로필 로딩 차단 안 함, 15초 여유)
    withTimeout(apiGet<{ metrics: Record<string, readonly { ts: number; value: number }[]> }>(
      `/unified-dashboard/animal/${id}/sensor-chart?days=7`
    ), 15000)
      .then((sensorData) => {
        if (signal.aborted || !sensorData?.metrics) return;
        const getLatest = (key: string): number | null => {
          const pts = sensorData.metrics[key];
          return pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
        };
        const tempPts = sensorData.metrics['temp'] ?? [];
        const rumPts = sensorData.metrics['rum'] ?? [];
        setSensor({
          temperature: getLatest('temp'),
          baselineTemp: computeBaselineTemp(tempPts),
          rumination: getLatest('rum'),
          rumAvg: computeRumAvg(rumPts),
          activity: getLatest('act'),
          // water_intake는 L/10min 실시간 → 24h 합산이 일일 음수량
          drinking: (() => {
            const drPts = sensorData.metrics['dr'] ?? [];
            if (drPts.length === 0) return null;
            const cutoff = Date.now() / 1000 - 86400;
            const sum = drPts.filter(p => p.ts >= cutoff).reduce((acc, p) => acc + p.value, 0);
            return Math.round(sum * 10) / 10;
          })(),
          drinkingCount: computeDrinkingCount(tempPts),
        });
      })
      .catch(() => {});

    // 보조 데이터 — 비동기 지연 로딩 (로딩 상태 차단 안 함)
    withTimeout(apiGet<unknown>(`/animals/${id}/breeding-history`), 10000)
      .then((raw) => {
        if (signal.aborted || !raw) return;
        // 배열이면 그대로, 객체면 flat 변환
        if (Array.isArray(raw)) {
          setBreeding(raw as BreedingEvent[]);
        } else {
          const obj = raw as { inseminations?: readonly Record<string, unknown>[]; pregnancyChecks?: readonly Record<string, unknown>[]; calvings?: readonly Record<string, unknown>[] };
          const flat: BreedingEvent[] = [];
          for (const e of obj.inseminations ?? []) flat.push({ eventType: 'insemination', eventDate: String(e.eventDate ?? ''), notes: e.notes as string | null });
          for (const e of obj.pregnancyChecks ?? []) flat.push({ eventType: 'pregnancy_check', eventDate: String(e.checkDate ?? ''), notes: e.notes as string | null });
          for (const e of obj.calvings ?? []) flat.push({ eventType: 'calving', eventDate: String(e.calvingDate ?? ''), notes: e.notes as string | null });
          flat.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
          setBreeding(flat);
        }
      })
      .catch(() => {});

    withTimeout(apiGet<{ riskScore: number; riskLevel: string; reasons: string[]; recommendation: string }>(`/predictions/health/${id}`), 10000)
      .then((data) => { if (!signal.aborted && data) setHealthPred(data); })
      .catch(() => {});

    withTimeout(apiGet<{ hasData: boolean; avgCycleDays?: number; daysUntilNext?: number; nextEstrusDate?: string; isWithin3Days?: boolean; reasoning?: string; message?: string }>(`/predictions/estrus/${id}`), 10000)
      .then((data) => { if (!signal.aborted && data) setEstrusPred(data); })
      .catch(() => {});

    withTimeout(apiGet<{ calvingRisk: string; reasons: string[]; recommendation: string }>(`/predictions/calving/${id}`), 10000)
      .then((data) => { if (!signal.aborted && data) setCalvingPred(data); })
      .catch(() => {});

    return () => { controller.abort(); };
  }, [id]);

  if (loading) {
    return (
      <div style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)', minHeight: '100vh', padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🐄</div>
          <div style={{ fontSize: 14, color: 'var(--ct-text-muted)' }}>개체 프로필 로딩 중...</div>
        </div>
      </div>
    );
  }

  if (!profile) {
    const isTimeout = loadError === 'timeout' || !loadError;
    return (
      <div style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)', minHeight: '100vh', padding: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{isTimeout ? '⏱️' : '❌'}</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          {isTimeout ? '서버 응답 대기 중' : '개체를 찾을 수 없습니다'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--ct-text-muted)', marginBottom: 16, maxWidth: 360 }}>
          {isTimeout
            ? '백엔드 서버가 응답하지 않습니다. 서버 실행 상태를 확인하거나 잠시 후 다시 시도하세요.'
            : '해당 ID의 개체가 데이터베이스에 존재하지 않습니다.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isTimeout && (
            <button type="button" onClick={() => window.location.reload()} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--ct-primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              다시 시도
            </button>
          )}
          <button type="button" onClick={() => navigate('/')} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--ct-card)', color: 'var(--ct-text)', border: '1px solid var(--ct-border)', cursor: 'pointer', fontSize: 13 }}>
            대시보드로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 정상체온 기준으로 KPI 상태 판단 (음수 피크 제외 후 베이스라인)
  const displayTemp = sensor?.baselineTemp ?? sensor?.temperature;
  const tempStatus = displayTemp ? (displayTemp >= 39.8 ? '🔴 발열' : displayTemp >= 39.4 ? '🟡 주의' : '🟢 정상') : '—';
  const rumDisplay = sensor?.rumAvg ?? sensor?.rumination;
  const rumStatus = rumDisplay ? (rumDisplay < 200 ? '🔴 감소' : rumDisplay < 300 ? '🟡 주의' : '🟢 정상') : '—';
  const healthScore = healthPred ? (100 - healthPred.riskScore) : aiScore;
  const scoreColor = healthScore !== null ? (healthScore >= 80 ? '#22c55e' : healthScore >= 50 ? '#eab308' : '#ef4444') : '#64748b';

  return (
    <div data-theme="dark" style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)', minHeight: '100vh', padding: isMobile ? '12px 10px' : '20px 24px' }}>
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button type="button" onClick={() => navigate(-1)} style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 8, padding: '6px 12px', color: 'var(--ct-text)', cursor: 'pointer', fontSize: 13 }}>
          ← 돌아가기
        </button>
        <button
          type="button"
          onClick={() => {
            // 개체의 모든 데이터를 컨텍스트로 수집
            const sensorCtx = sensor
              ? `[현재 센서] 정상체온 ${sensor.baselineTemp?.toFixed(2) ?? '—'}°C (음수 피크 제외 24h 평균), 반추 ${sensor.rumAvg?.toFixed(0) ?? '—'}분 (24h 평균), 음수 ${sensor.drinking?.toFixed(0) ?? '—'}L (하루), 음수횟수 ${sensor.drinkingCount}회, 활동량 ${sensor.activity?.toFixed(0) ?? '—'}`
              : '[센서 데이터 없음]';

            const healthCtx = healthPred
              ? `[AI 건강평가] 위험점수 ${healthPred.riskScore}/100 (${healthPred.riskLevel}), 사유: ${healthPred.reasons.join(', ')}, 권고: ${healthPred.recommendation}`
              : '';

            const estrusCtx = estrusPred?.hasData
              ? `[발정예측] 평균주기 ${estrusPred.avgCycleDays ?? '—'}일, 다음발정까지 ${estrusPred.daysUntilNext ?? '—'}일 (${estrusPred.nextEstrusDate ?? '—'}), 3일이내: ${estrusPred.isWithin3Days ? '예' : '아니오'}`
              : '';

            const calvingCtx = calvingPred
              ? `[분만예측] 위험도 ${calvingPred.calvingRisk}, 사유: ${calvingPred.reasons.join(', ')}`
              : '';

            const alarmCtx = events.length > 0
              ? `[최근 알람 ${events.length}건] ${events.slice(0, 5).map((e) => `${e.eventType}(${e.severity})`).join(', ')}`
              : '[최근 알람 없음]';

            const breedCtx = breeding.length > 0
              ? `[번식이력] ${breeding.slice(0, 3).map((b) => `${b.eventType}(${b.eventDate})`).join(', ')}`
              : '';

            const animalCtx = `[개체정보] #${profile.earTag} ${profile.name || ''}, ${profile.farmName}, ${profile.breed}, ${profile.sex === 'female' ? '암소' : '수소'}, ${profile.parity}산차, ${profile.lactationStatus ?? '—'}, 상태: ${profile.status}`;

            const fullContext = [
              animalCtx,
              sensorCtx,
              alarmCtx,
              healthCtx,
              estrusCtx,
              calvingCtx,
              breedCtx,
            ].filter(Boolean).join('\n');

            setTinkerbellTrigger(`[팅커벨 AI — 개체 정밀 분석]\n[개체ID] ${profile.animalId}\n[농장ID] ${profile.farmId}\n${fullContext}\n\n(${Date.now()})`);
          }}
          style={{ background: '#7c3aed', border: 'none', borderRadius: 8, padding: '6px 14px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          🧚 팅커벨 AI
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
            🐄 #{profile.earTag} {profile.name ? `(${profile.name})` : ''}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>
            {profile.farmName} · {profile.breed} · {profile.sex === 'female' ? '♀' : '♂'} · {profile.lactationStatus ?? '—'} · {profile.parity}산차
          </div>
        </div>
      </div>

      {/* ── KPI 바이탈 카드 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {/* 체온 — 정상체온(베이스라인) 표시, 음수 피크 제외 24h 평균 */}
        <div style={{
          background: 'var(--ct-card)',
          border: `1px solid ${displayTemp && displayTemp >= 39.4 ? '#ef444425' : '#4A90D925'}`,
          borderRadius: 10,
          padding: '12px 14px',
          borderLeft: `3px solid ${displayTemp && displayTemp >= 39.8 ? '#ef4444' : displayTemp && displayTemp >= 39.4 ? '#f97316' : '#4A90D9'}`,
        }}>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>체온</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 2 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: displayTemp && displayTemp >= 39.8 ? '#ef4444' : displayTemp && displayTemp >= 39.4 ? '#f97316' : '#4A90D9' }}>
              {displayTemp?.toFixed(2) ?? '—'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>°C</span>
          </div>
          <div style={{ fontSize: 9, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
            <span>{tempStatus}</span>
            {sensor && (
              <span style={{ color: sensor.drinkingCount > 0 ? '#81D4FA' : '#64748b', fontWeight: sensor.drinkingCount > 0 ? 600 : 400 }}>
                음수 {sensor.drinkingCount}회
              </span>
            )}
          </div>
        </div>

        {/* 반추 — 24h 평균 */}
        <div style={{
          background: 'var(--ct-card)',
          border: `1px solid #22c55e25`,
          borderRadius: 10,
          padding: '12px 14px',
          borderLeft: `3px solid ${rumDisplay && rumDisplay < 200 ? '#ef4444' : rumDisplay && rumDisplay < 300 ? '#f97316' : '#22c55e'}`,
        }}>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>반추</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 2 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: rumDisplay && rumDisplay < 200 ? '#ef4444' : rumDisplay && rumDisplay < 300 ? '#f97316' : '#22c55e' }}>
              {rumDisplay?.toFixed(0) ?? '—'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>분</span>
          </div>
          <div style={{ fontSize: 9, marginTop: 2 }}>{rumStatus} <span style={{ color: '#64748b' }}>24h 평균</span></div>
        </div>

        {/* 음수 — 하루 음수량 + 음수횟수 */}
        <div style={{
          background: 'var(--ct-card)',
          border: `1px solid #06b6d425`,
          borderRadius: 10,
          padding: '12px 14px',
          borderLeft: `3px solid #06b6d4`,
        }}>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>음수</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 2 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#06b6d4' }}>
              {sensor?.drinking?.toFixed(0) ?? '—'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>L</span>
          </div>
          <div style={{ fontSize: 9, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ct-text-muted)' }}>음수량</span>
            {sensor && (
              <span style={{ color: '#06b6d4', fontWeight: 600 }}>{sensor.drinkingCount}회</span>
            )}
          </div>
        </div>

        {/* AI 건강 */}
        <div style={{
          background: 'var(--ct-card)',
          border: `1px solid ${scoreColor}25`,
          borderRadius: 10,
          padding: '12px 14px',
          borderLeft: `3px solid ${scoreColor}`,
        }}>
          <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>AI 건강</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 2 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: scoreColor }}>{String(healthScore ?? '—')}</span>
            <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>/100</span>
          </div>
          {healthPred && <div style={{ fontSize: 9, marginTop: 2 }}>{healthPred.riskLevel}</div>}
        </div>
      </div>

      {/* ── 센서 차트 (최상단 — 가장 중요) ── */}
      <div style={{ marginBottom: 16 }}>
        <SectionErrorBoundary label="센서 데이터">
          <SensorChartInline animalId={id!} />
        </SectionErrorBoundary>
      </div>

      {/* ── 2단 레이아웃: 좌측 핵심정보 + 우측 AI/이력 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '7fr 5fr', gap: 14, marginBottom: 16 }}>

        {/* 좌측: 이벤트 기록 + 이력추적 + 백신/방역 + 번식 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 10, padding: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--ct-text)' }}>🏛️ 축산물이력추적</h3>
            <SectionErrorBoundary label="이력추적">
              <TraceSection animalId={profile.animalId} />
            </SectionErrorBoundary>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 10, padding: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--ct-text)' }}>💉 백신 접종</h3>
              <SectionErrorBoundary label="백신"><VaccinationHistory animalId={profile.animalId} /></SectionErrorBoundary>
            </div>
            <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 10, padding: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--ct-text)' }}>🛡️ 방역검사</h3>
              <SectionErrorBoundary label="방역"><InspectionResults animalId={profile.animalId} /></SectionErrorBoundary>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 10, padding: 14 }}>
              <SectionErrorBoundary label="수정 추천"><InseminationPanel animalId={profile.animalId} /></SectionErrorBoundary>
            </div>
            <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 10, padding: 14 }}>
              <SectionErrorBoundary label="보유 정액"><FarmSemenInventory farmId={profile.farmId} /></SectionErrorBoundary>
            </div>
          </div>

          <SectionErrorBoundary label="체중 측정">
            <WeightDataCollector animalId={profile.animalId} farmId={profile.farmId} />
          </SectionErrorBoundary>
        </div>

        {/* 우측: 알림 + AI 예측 + 번식이력 + 개체정보 */}

        {/* 우측 패널 내용 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 알림 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 10, padding: 14 }}>
            <h2 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 8px' }}>⚠️ 알림 ({events.length})</h2>
            {events.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 12, color: 'var(--ct-text-muted)', fontSize: 12 }}>✅ 활성 알림 없음</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {events.map((e) => (
                  <div key={e.eventId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, background: `${SEVERITY_COLORS[e.severity] ?? '#64748b'}10`, fontSize: 11 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: SEVERITY_COLORS[e.severity] ?? '#64748b' }} />
                    <span style={{ fontWeight: 600, flex: 1 }}>{EVENT_LABELS[e.eventType] ?? e.eventType}</span>
                    <span style={{ fontSize: 9, color: 'var(--ct-text-muted)' }}>
                      {new Date(e.detectedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* 소버린 AI 알람 */}
          {(animalSovereignAlarms.length > 0 || sovereignLoading) && (
            <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 10, padding: 14 }}>
              <h2 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 8px' }}>🧠 소버린 AI 알람</h2>
              <SovereignAlarmFeed
                alarms={animalSovereignAlarms}
                isLoading={sovereignLoading}
                farmId={profile?.farmId ?? null}
              />
            </div>
          )}

          {/* AI 예측 3종 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px' }}>🤖 AI 예측</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* 질병 예측 */}
              {healthPred && (
                <div style={{ padding: '8px 10px', borderRadius: 8, background: healthPred.riskLevel === 'critical' ? 'rgba(239,68,68,0.1)' : healthPred.riskLevel === 'warning' ? 'rgba(249,115,22,0.1)' : 'rgba(34,197,94,0.1)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    🏥 72시간 건강 예측: <span style={{ color: healthPred.riskLevel === 'critical' ? '#ef4444' : healthPred.riskLevel === 'warning' ? '#f97316' : '#22c55e' }}>{healthPred.riskLevel}</span>
                  </div>
                  {healthPred.reasons.map((r, i) => (
                    <div key={i} style={{ fontSize: 10, color: 'var(--ct-text-secondary)', paddingLeft: 8 }}>• {r}</div>
                  ))}
                  <div style={{ fontSize: 10, color: 'var(--ct-text-muted)', marginTop: 4, fontStyle: 'italic' }}>{healthPred.recommendation}</div>
                </div>
              )}

              {/* 발정 예측 */}
              {estrusPred && (
                <div style={{ padding: '8px 10px', borderRadius: 8, background: estrusPred.isWithin3Days ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.05)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    🔴 발정 주기 예측
                    {estrusPred.isWithin3Days && <span style={{ color: '#ef4444', marginLeft: 8 }}>3일 이내!</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ct-text-secondary)' }}>
                    {estrusPred.hasData ? estrusPred.reasoning : estrusPred.message}
                  </div>
                </div>
              )}

              {/* 분만 예측 */}
              {calvingPred && calvingPred.calvingRisk !== 'low' && (
                <div style={{ padding: '8px 10px', borderRadius: 8, background: calvingPred.calvingRisk === 'imminent' ? 'rgba(239,68,68,0.15)' : 'rgba(249,115,22,0.1)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: calvingPred.calvingRisk === 'imminent' ? '#ef4444' : '#f97316' }}>
                    🍼 분만 예측: {calvingPred.calvingRisk}
                  </div>
                  {calvingPred.reasons.map((r, i) => (
                    <div key={i} style={{ fontSize: 10, color: 'var(--ct-text-secondary)', paddingLeft: 8 }}>• {r}</div>
                  ))}
                  <div style={{ fontSize: 10, fontStyle: 'italic', color: 'var(--ct-text-muted)', marginTop: 4 }}>{calvingPred.recommendation}</div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 8, fontSize: 9, color: 'var(--ct-text-muted)', fontStyle: 'italic' }}>
              이 정보는 수의사의 임상적 판단을 보조하기 위한 참고 자료입니다.
            </div>
          </div>

          {/* 번식 이력 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px' }}>🐄 번식 이력</h2>
            {breeding.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--ct-text-muted)', fontSize: 13 }}>번식 기록 없음</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 250, overflowY: 'auto' }}>
                {breeding.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, fontSize: 12 }}>
                    <span style={{ fontWeight: 600 }}>{EVENT_LABELS[b.eventType] ?? b.eventType}</span>
                    <span style={{ color: 'var(--ct-text-muted)', flex: 1 }}>
                      {new Date(b.eventDate).toLocaleDateString('ko-KR')}
                    </span>
                    {b.notes && <span style={{ fontSize: 10, color: 'var(--ct-text-secondary)' }}>{b.notes}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 개체 정보 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px' }}>📋 개체 정보</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ct-text-muted)' }}>귀표번호</span>
                <span style={{ fontWeight: 600 }}>{profile.earTag}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ct-text-muted)' }}>농장</span>
                <span>{profile.farmName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ct-text-muted)' }}>품종</span>
                <span>{profile.breed}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ct-text-muted)' }}>산차</span>
                <span>{profile.parity}산차</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ct-text-muted)' }}>상태</span>
                <span>{profile.lactationStatus ?? profile.status}</span>
              </div>
              {profile.birthDate && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--ct-text-muted)' }}>생년월일</span>
                  <span>{new Date(profile.birthDate).toLocaleDateString('ko-KR')}</span>
                </div>
              )}
            </div>
          </div>

          {/* 임신 관리 타임라인 */}
          <SectionErrorBoundary label="임신 관리">
            <BreedingTimeline animalId={profile.animalId} />
          </SectionErrorBoundary>

          {/* ── 이벤트 기록 패널 ── */}
          <SectionErrorBoundary label="이벤트 기록">
            <AnimalEventPanel
              animalId={profile.animalId}
              farmId={profile.farmId}
              earTag={profile.earTag}
              onProfileChange={() => window.location.reload()}
            />
          </SectionErrorBoundary>
        </div>
      </div>

      {/* 팅커벨 AI */}
      <SectionErrorBoundary label="AI 어시스턴트">
        <TinkerbellAssistant openTrigger={tinkerbellTrigger} />
      </SectionErrorBoundary>

      {/* 임신감정 모달 */}
      {showPregnancyCheck && profile && (
        <PregnancyCheckModal
          animalId={profile.animalId}
          earTag={profile.earTag}
          onClose={() => setShowPregnancyCheck(false)}
          onSuccess={() => {
            setShowPregnancyCheck(false);
          }}
        />
      )}

    </div>{/* maxWidth container end */}

      {/* 건유 전환 모달 */}
      {showDryOff && profile && (
        <DryOffModal
          animalId={profile.animalId}
          earTag={profile.earTag}
          onClose={() => setShowDryOff(false)}
          onSuccess={() => {
            setShowDryOff(false);
            // 프로필 새로고침
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
