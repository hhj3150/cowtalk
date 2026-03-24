// 개체별 디지털 트윈 — /cow/:id
// 센서 30일 차트 + 질병/치료 타임라인 + 번식 이력 + AI 건강 점수 + 알람

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet } from '@web/api/client';
import { SensorDataPanel } from '@web/components/unified-dashboard/SensorDataPanel';
import { DryOffModal } from '@web/components/cow/DryOffModal';
import { BreedingTimeline } from '@web/components/cow/BreedingTimeline';
import { GeniVoiceAssistant } from '@web/components/unified-dashboard/GeniVoiceAssistant';
import { TraceSection } from '@web/components/trace/TraceSection';
import { InseminationPanel } from '@web/components/breeding/InseminationPanel';
import { FarmSemenInventory } from '@web/components/breeding/FarmSemenInventory';
import { useIsMobile } from '@web/hooks/useIsMobile';

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
  readonly temperature: number | null;
  readonly rumination: number | null;
  readonly activity: number | null;
  readonly drinking: number | null;
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
  calving_detection: '🍼 분만임박', calving_confirmation: '🍼 분만완료',
  temperature_high: '🌡️ 발열', rumination_decrease: '🌾 반추감소',
  clinical_condition: '🏥 질병의심', health_general: '💊 건강주의',
  activity_decrease: '🦶 활동감소', activity_increase: '🏃 활동증가',
  dry_off: '🥛 건유', fertility_warning: '⚠️ 번식주의',
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
  const [aiScore, setAiScore] = useState<number | null>(null);
  const [healthPred, setHealthPred] = useState<{ riskScore: number; riskLevel: string; reasons: string[]; recommendation: string } | null>(null);
  const [estrusPred, setEstrusPred] = useState<{ hasData: boolean; avgCycleDays?: number; daysUntilNext?: number; nextEstrusDate?: string; isWithin3Days?: boolean; reasoning?: string; message?: string } | null>(null);
  const [calvingPred, setCalvingPred] = useState<{ calvingRisk: string; reasons: string[]; recommendation: string } | null>(null);
  const [showDryOff, setShowDryOff] = useState(false);
  const [geniTrigger, setGeniTrigger] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    const controller = new AbortController();
    const { signal } = controller;

    // 타임아웃 래퍼 — 5초 초과 시 null 반환
    function withTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T | null> {
      return Promise.race([
        promise,
        new Promise<null>((resolve) => { setTimeout(() => resolve(null), ms); }),
      ]);
    }

    // 핵심 데이터 (프로필 + 이벤트 + 센서) — 병렬, 최대 8초
    Promise.all([
      withTimeout(apiGet<CowProfile>(`/animals/${id}`), 8000).catch(() => null),
      withTimeout(apiGet<{ events: readonly EventItem[] }>(`/label-chat/events/${id}`), 5000).catch(() => ({ events: [] as readonly EventItem[] })),
      withTimeout(apiGet<{ metrics: Record<string, readonly { ts: number; value: number }[]> }>(
        `/unified-dashboard/animal/${id}/sensor-chart?days=7`
      ), 5000).catch(() => null),
    ]).then(([p, evts, sensorData]) => {
      if (signal.aborted) return;
      if (p) setProfile(p as unknown as CowProfile);
      setEvents(evts?.events ?? []);

      if (sensorData?.metrics) {
        const getLatest = (key: string): number | null => {
          const pts = sensorData.metrics[key];
          return pts && pts.length > 0 ? pts[pts.length - 1]!.value : null;
        };
        setSensor({
          temperature: getLatest('temp'),
          rumination: getLatest('rum'),
          activity: getLatest('act'),
          drinking: getLatest('dr'),
        });
      }

      setAiScore(null);
      setLoading(false);
    });

    // 보조 데이터 — 비동기 지연 로딩 (로딩 상태 차단 안 함)
    withTimeout(apiGet<readonly BreedingEvent[]>(`/animals/${id}/breeding-history`), 5000)
      .then((data) => { if (!signal.aborted && data) setBreeding(data); })
      .catch(() => {});

    withTimeout(apiGet<{ riskScore: number; riskLevel: string; reasons: string[]; recommendation: string }>(`/predictions/health/${id}`), 5000)
      .then((data) => { if (!signal.aborted && data) setHealthPred(data); })
      .catch(() => {});

    withTimeout(apiGet<{ hasData: boolean; avgCycleDays?: number; daysUntilNext?: number; nextEstrusDate?: string; isWithin3Days?: boolean; reasoning?: string; message?: string }>(`/predictions/estrus/${id}`), 5000)
      .then((data) => { if (!signal.aborted && data) setEstrusPred(data); })
      .catch(() => {});

    withTimeout(apiGet<{ calvingRisk: string; reasons: string[]; recommendation: string }>(`/predictions/calving/${id}`), 5000)
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
    return (
      <div style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)', minHeight: '100vh', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
        <div>개체를 찾을 수 없습니다</div>
        <button type="button" onClick={() => navigate('/')} style={{ marginTop: 16, padding: '8px 16px', borderRadius: 8, background: 'var(--ct-primary)', color: '#fff', border: 'none', cursor: 'pointer' }}>
          대시보드로 돌아가기
        </button>
      </div>
    );
  }

  const tempStatus = sensor?.temperature ? (sensor.temperature >= 40 ? '🔴 발열' : sensor.temperature >= 39.5 ? '🟡 주의' : '🟢 정상') : '—';
  const rumStatus = sensor?.rumination ? (sensor.rumination < 200 ? '🔴 감소' : sensor.rumination < 300 ? '🟡 주의' : '🟢 정상') : '—';
  const healthScore = healthPred ? (100 - healthPred.riskScore) : aiScore;
  const scoreColor = healthScore !== null ? (healthScore >= 80 ? '#22c55e' : healthScore >= 50 ? '#eab308' : '#ef4444') : '#64748b';

  return (
    <div data-theme="dark" style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)', minHeight: '100vh', padding: isMobile ? '12px 10px' : '20px 24px' }}>
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
              ? `[현재 센서] 체온 ${sensor.temperature?.toFixed(1) ?? '—'}°C, 반추 ${sensor.rumination?.toFixed(0) ?? '—'}분, 활동량 ${sensor.activity?.toFixed(0) ?? '—'}, 음수 ${sensor.drinking?.toFixed(0) ?? '—'}L`
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

            setGeniTrigger(`[소버린 AI — 개체 정밀 분석]\n[개체ID] ${profile.animalId}\n${fullContext}\n\n(${Date.now()})`);
          }}
          style={{ background: '#16a34a', border: 'none', borderRadius: 8, padding: '6px 14px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          🧠 소버린 AI
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

      {/* KPI 카드 4개 */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>체온</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: sensor?.temperature && sensor.temperature >= 39.5 ? '#ef4444' : 'var(--ct-text)' }}>
            {sensor?.temperature?.toFixed(1) ?? '—'}°C
          </div>
          <div style={{ fontSize: 10 }}>{tempStatus}</div>
        </div>
        <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>반추</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{sensor?.rumination?.toFixed(0) ?? '—'}<span style={{ fontSize: 12 }}>분</span></div>
          <div style={{ fontSize: 10 }}>{rumStatus}</div>
        </div>
        <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>활동</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{sensor?.activity?.toFixed(0) ?? '—'}</div>
          <div style={{ fontSize: 10 }}>I/24h</div>
        </div>
        <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--ct-text-muted)' }}>AI 건강 점수</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: scoreColor }}>{healthScore ?? '—'}</div>
          <div style={{ fontSize: 10 }}>{healthPred ? healthPred.riskLevel : '/ 100점'}</div>
        </div>
      </div>

      {/* 🏛️ 축산물이력추적 — 이력번호 클릭 시 전체 공공데이터 */}
      <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--ct-text)' }}>🏛️ 축산물이력추적</h3>
        <TraceSection animalId={profile.animalId} />
      </div>

      {/* 💉 번식 관리 — 수정 추천 + 보유 정액 */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16 }}>
          <InseminationPanel animalId={profile.animalId} />
        </div>
        <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16 }}>
          <FarmSemenInventory farmId={profile.farmId} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 16 }}>
        {/* 왼쪽: 센서 차트 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 센서 데이터 패널 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px' }}>📊 센서 데이터 (7일)</h2>
            <SensorDataPanel animalId={id!} selectedEventId={null} />
          </div>

          {/* 알람 타임라인 */}
          <div style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px' }}>⚠️ 현재 알림 ({events.length}건)</h2>
            {events.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--ct-text-muted)', fontSize: 13 }}>✅ 활성 알림 없음</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                {events.map((e) => (
                  <div key={e.eventId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: `${SEVERITY_COLORS[e.severity] ?? '#64748b'}10` }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEVERITY_COLORS[e.severity] ?? '#64748b' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{EVENT_LABELS[e.eventType] ?? e.eventType}</span>
                    <span style={{ fontSize: 10, color: 'var(--ct-text-muted)' }}>
                      {new Date(e.detectedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽: AI 예측 + 번식 이력 + 개체 정보 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
          <BreedingTimeline animalId={profile.animalId} />

          {/* 건유 전환 버튼 */}
          {profile.lactationStatus !== 'dry' && (
            <button
              type="button"
              onClick={() => setShowDryOff(true)}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 10,
                background: 'linear-gradient(135deg, #eab308, #f59e0b)',
                color: '#000', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              🏖️ 건유 전환
            </button>
          )}
        </div>
      </div>

      {/* 소버린 AI */}
      <GeniVoiceAssistant openTrigger={geniTrigger} />

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
