// 소버린 AI 자체 생성 알람 피드
// smaXtec이 주지 않는 CowTalk AI 독자 수의학 알람

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SovereignAlarm, SovereignAlarmLabelRequest } from '@web/api/unified-dashboard.api';
import { labelSovereignAlarm } from '@web/api/unified-dashboard.api';

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  warning:  '#f97316',
  caution:  '#eab308',
  info:     '#60a5fa',
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: '위험',
  warning:  '경고',
  caution:  '주의',
  info:     '정보',
};

const TYPE_ICONS: Record<string, string> = {
  ketosis_risk:    '🔴',
  mastitis_risk:   '🩺',
  acidosis_risk:   '⚠️',
  laminitis_risk:  '🦶',
  water_decrease:  '💧',
  water_increase:  '💦',
  heat_stress:     '🌡️',
};

interface Props {
  readonly alarms: readonly SovereignAlarm[];
  readonly isLoading?: boolean;
  readonly farmId?: string | null;
  readonly onLabelChange?: () => void; // callback to re-fetch after labeling
}

export function SovereignAlarmFeed({ alarms, isLoading, farmId, onLabelChange }: Props): React.JSX.Element {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [labeling, setLabeling] = useState<string | null>(null); // alarmSignature being labeled
  const [localVerdicts, setLocalVerdicts] = useState<Record<string, 'confirmed' | 'false_positive' | 'modified'>>({}); // optimistic

  const handleLabel = useCallback(async (
    alarm: SovereignAlarm,
    verdict: 'confirmed' | 'false_positive' | 'modified',
  ) => {
    if (labeling) return;
    setLabeling(alarm.alarmSignature);
    setLocalVerdicts(prev => ({ ...prev, [alarm.alarmSignature]: verdict }));
    try {
      const req: SovereignAlarmLabelRequest = {
        alarmSignature:    alarm.alarmSignature,
        animalId:          alarm.animalId,
        farmId:            alarm.farmId,
        alarmType:         alarm.type,
        predictedSeverity: alarm.severity,
        verdict,
      };
      await labelSovereignAlarm(req);
      onLabelChange?.();
    } catch {
      // revert optimistic
      setLocalVerdicts(prev => {
        const next = { ...prev };
        delete next[alarm.alarmSignature];
        return next;
      });
    } finally {
      setLabeling(null);
    }
  }, [labeling, onLabelChange]);

  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 12 }}>
        소버린 AI 분석 중...
      </div>
    );
  }

  if (!farmId) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 12 }}>
        목장을 선택하면 AI 알람이 생성됩니다
      </div>
    );
  }

  if (alarms.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
        <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>이상 없음</div>
        <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>소버린 AI가 분석한 결과 특이사항 없음</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {alarms.map((alarm) => {
        const color = SEVERITY_COLORS[alarm.severity] ?? '#60a5fa';
        const isOpen = expanded === alarm.alarmId;
        return (
          <div
            key={alarm.alarmId}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${color}30`,
              borderLeft: `3px solid ${color}`,
              borderRadius: 8,
              padding: '10px 12px',
              cursor: 'pointer',
            }}
            onClick={() => setExpanded(isOpen ? null : alarm.alarmId)}
          >
            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>{TYPE_ICONS[alarm.type] ?? '🔔'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 5px',
                    borderRadius: 3, background: `${color}20`, color,
                  }}>
                    {SEVERITY_LABELS[alarm.severity]}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); navigate(`/animals/${alarm.animalId}`); }}
                    style={{
                      fontSize: 11, fontWeight: 700, color: '#94a3b8',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >
                    {alarm.earTag}{alarm.animalName ? ` (${alarm.animalName})` : ''}
                  </button>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#f1f5f9', marginTop: 2 }}>
                  {alarm.title}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 10, color, fontWeight: 700 }}>{alarm.confidence}%</div>
                <div style={{ fontSize: 8, color: '#475569' }}>신뢰도</div>
              </div>
              <span style={{ color: '#475569', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {/* 펼쳐진 상세 */}
            {isOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1e293b' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, lineHeight: 1.6 }}>
                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>🧚 팅커벨 AI 분석</span><br />
                  {alarm.reasoning}
                </div>
                <div style={{
                  background: 'rgba(34,197,94,0.05)',
                  border: '1px solid rgba(34,197,94,0.2)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 11,
                  color: '#86efac',
                  lineHeight: 1.7,
                }}>
                  <span style={{ fontWeight: 700 }}>📋 권장 조치</span><br />
                  {alarm.actionPlan}
                </div>
                {/* 데이터 포인트 */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {Object.entries(alarm.dataPoints).map(([k, v]) => (
                    <span key={k} style={{
                      fontSize: 9, padding: '2px 6px',
                      borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: '#94a3b8',
                    }}>
                      {k}: {v}
                    </span>
                  ))}
                </div>
                {/* 레이블 버튼 */}
                {(() => {
                  const currentVerdict = localVerdicts[alarm.alarmSignature] ?? alarm.verdict;
                  return (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #1e293b' }}>
                      <div style={{ fontSize: 10, color: '#475569', marginBottom: 6 }}>
                        🧠 이 알람이 실제로 맞았나요? 레이블을 달면 AI가 점점 강화됩니다
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['confirmed', 'false_positive', 'modified'] as const).map((v) => {
                          const active = currentVerdict === v;
                          const cfg = {
                            confirmed:      { label: '✅ 실제 발생', color: '#22c55e' },
                            false_positive: { label: '❌ 오탐 (틀림)', color: '#ef4444' },
                            modified:       { label: '⚠️ 부분 정확', color: '#f97316' },
                          }[v];
                          return (
                            <button
                              key={v}
                              type="button"
                              disabled={labeling === alarm.alarmSignature}
                              onClick={(e) => { e.stopPropagation(); void handleLabel(alarm, v); }}
                              style={{
                                flex: 1,
                                padding: '5px 4px',
                                borderRadius: 5,
                                border: `1px solid ${active ? cfg.color : 'rgba(255,255,255,0.1)'}`,
                                background: active ? `${cfg.color}20` : 'rgba(255,255,255,0.03)',
                                color: active ? cfg.color : '#64748b',
                                fontSize: 10,
                                fontWeight: active ? 700 : 400,
                                cursor: labeling ? 'wait' : 'pointer',
                                transition: 'all 0.15s',
                              }}
                            >
                              {cfg.label}
                            </button>
                          );
                        })}
                      </div>
                      {currentVerdict && (
                        <div style={{ fontSize: 9, color: '#475569', marginTop: 4, textAlign: 'right' }}>
                          레이블 저장됨 ✓
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
