// 개체별 디지털 트윈 — /cow/:id
// 센서 30일 차트 + 질병/치료 타임라인 + 번식 이력 + AI 건강 점수 + 알람

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet } from '@web/api/client';
import { SensorDataPanel } from '@web/components/unified-dashboard/SensorDataPanel';
import { useIsMobile } from '@web/hooks/useIsMobile';

interface CowProfile {
  readonly animalId: string;
  readonly earTag: string;
  readonly name: string;
  readonly farmId: string;
  readonly farmName: string;
  readonly breed: string;
  readonly gender: string;
  readonly birthDate: string | null;
  readonly lactationStatus: string | null;
  readonly parity: number;
  readonly status: string;
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

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.all([
      apiGet<CowProfile>(`/animals/${id}`).catch(() => null),
      apiGet<{ events: readonly EventItem[] }>(`/label-chat/events/${id}`).catch(() => ({ events: [] })),
      apiGet<{ metrics: Record<string, readonly { ts: number; value: number }[]> }>(
        `/unified-dashboard/animal/${id}/sensor-chart?days=7`
      ).catch(() => null),
    ]).then(([p, evts, sensorData]) => {
      if (p) setProfile(p);
      setEvents(evts?.events ?? []);

      // 센서 최신값 추출
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

      // AI 건강 점수 (이벤트 기반 간이 계산)
      const recentEvents = evts?.events ?? [];
      const critCount = recentEvents.filter((e) => e.severity === 'critical' || e.severity === 'high').length;
      const score = Math.max(0, 100 - critCount * 15);
      setAiScore(score);

      setLoading(false);
    });

    // 번식 이력
    apiGet<readonly BreedingEvent[]>(`/animals/${id}/breeding-history`).then(setBreeding).catch(() => {});
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
  const scoreColor = aiScore !== null ? (aiScore >= 80 ? '#22c55e' : aiScore >= 50 ? '#eab308' : '#ef4444') : '#64748b';

  return (
    <div data-theme="dark" style={{ background: 'var(--ct-bg)', color: 'var(--ct-text)', minHeight: '100vh', padding: isMobile ? '12px 10px' : '20px 24px' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button type="button" onClick={() => navigate(-1)} style={{ background: 'var(--ct-card)', border: '1px solid var(--ct-border)', borderRadius: 8, padding: '6px 12px', color: 'var(--ct-text)', cursor: 'pointer', fontSize: 13 }}>
          ← 돌아가기
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
            🐄 #{profile.earTag} {profile.name ? `(${profile.name})` : ''}
          </h1>
          <div style={{ fontSize: 12, color: 'var(--ct-text-muted)' }}>
            {profile.farmName} · {profile.breed} · {profile.gender === 'female' ? '♀' : '♂'} · {profile.lactationStatus ?? '—'} · {profile.parity}산차
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
          <div style={{ fontSize: 24, fontWeight: 800, color: scoreColor }}>{aiScore ?? '—'}</div>
          <div style={{ fontSize: 10 }}>/ 100점</div>
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

        {/* 오른쪽: 번식 이력 + 진단 레이블 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
        </div>
      </div>
    </div>
  );
}
