// 체중 데이터 수집기 — AI 체중 추정 Phase 1
// 측면/후면 사진 촬영 + 실제 체중 입력 → paired data 축적

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { submitWeightMeasurement, getWeightHistory } from '@web/api/weight.api';
import type { WeightMeasurementRecord } from '@cowtalk/shared';

interface Props {
  readonly animalId: string;
  readonly farmId: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function WeightDataCollector({ animalId, farmId }: Props): React.JSX.Element {
  const [sidePhoto, setSidePhoto] = useState<string | null>(null);
  const [rearPhoto, setRearPhoto] = useState<string | null>(null);
  const [sidePreview, setSidePreview] = useState<string | null>(null);
  const [rearPreview, setRearPreview] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [history, setHistory] = useState<readonly WeightMeasurementRecord[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const sideInputRef = useRef<HTMLInputElement>(null);
  const rearInputRef = useRef<HTMLInputElement>(null);

  // 체중 이력 로드
  const loadHistory = useCallback(async () => {
    try {
      const res = await getWeightHistory(animalId, 5);
      setHistory(res.data);
    } catch {
      // 이력 로드 실패는 무시
    }
  }, [animalId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 사진 촬영 핸들러
  const handlePhotoCapture = useCallback(async (
    file: File,
    side: 'side' | 'rear',
  ) => {
    try {
      const base64 = await fileToBase64(file);
      const preview = URL.createObjectURL(file);

      if (side === 'side') {
        setSidePhoto(base64);
        setSidePreview(preview);
      } else {
        setRearPhoto(base64);
        setRearPreview(preview);
      }
    } catch {
      setMessage({ type: 'error', text: '사진 처리에 실패했습니다' });
    }
  }, []);

  // 저장
  const handleSubmit = useCallback(async () => {
    const kg = parseFloat(weight);
    if (isNaN(kg) || kg < 50 || kg > 1500) {
      setMessage({ type: 'error', text: '체중을 50~1500kg 범위로 입력하세요' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await submitWeightMeasurement({
        animalId,
        farmId,
        actualWeightKg: kg,
        sidePhotoBase64: sidePhoto ?? undefined,
        rearPhotoBase64: rearPhoto ?? undefined,
        notes: notes.trim() || undefined,
      });

      setMessage({ type: 'success', text: `${kg}kg 기록 완료` });
      // 입력 초기화
      setSidePhoto(null);
      setRearPhoto(null);
      setSidePreview(null);
      setRearPreview(null);
      setWeight('');
      setNotes('');
      // 이력 새로고침
      loadHistory();
    } catch {
      setMessage({ type: 'error', text: '저장에 실패했습니다. 다시 시도하세요.' });
    } finally {
      setSubmitting(false);
    }
  }, [animalId, farmId, weight, notes, sidePhoto, rearPhoto, loadHistory]);

  const cardStyle: React.CSSProperties = {
    background: 'var(--ct-card, #1e293b)',
    border: '1px solid var(--ct-border, #334155)',
    borderRadius: 12,
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    background: 'linear-gradient(135deg, rgba(245,158,11,0.08), transparent)',
  };

  return (
    <div style={cardStyle}>
      {/* 헤더 — 접기/펼치기 */}
      <div style={headerStyle} onClick={() => setIsExpanded((v) => !v)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🐄</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ct-text, #f1f5f9)' }}>
              체중 측정 (AI 학습 데이터)
            </div>
            <div style={{ fontSize: 10, color: 'var(--ct-text-muted, #94a3b8)' }}>
              측면·후면 사진 + 실제 체중 → AI 모델 학습용
              {history.length > 0 && ` · 최근 ${history[0]!.actualWeightKg}kg`}
            </div>
          </div>
        </div>
        <span style={{ color: 'var(--ct-text-muted, #94a3b8)', fontSize: 16, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
          ▼
        </span>
      </div>

      {isExpanded && (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 사진 촬영 영역 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* 측면 사진 */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text-secondary, #cbd5e1)', marginBottom: 6, display: 'block' }}>
                📸 측면 사진
              </label>
              <input
                ref={sideInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoCapture(file, 'side');
                  e.target.value = '';
                }}
              />
              {sidePreview ? (
                <div style={{ position: 'relative' }}>
                  <img
                    src={sidePreview}
                    alt="측면"
                    style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, border: '2px solid #f59e0b' }}
                  />
                  <button
                    onClick={() => { setSidePhoto(null); setSidePreview(null); }}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 12 }}
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => sideInputRef.current?.click()}
                  style={{
                    width: '100%',
                    height: 120,
                    borderRadius: 8,
                    border: '2px dashed var(--ct-border, #475569)',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'var(--ct-text-muted, #94a3b8)',
                    cursor: 'pointer',
                    fontSize: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 24 }}>📷</span>
                  측면 촬영
                </button>
              )}
            </div>

            {/* 후면 사진 */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text-secondary, #cbd5e1)', marginBottom: 6, display: 'block' }}>
                📸 후면 사진
              </label>
              <input
                ref={rearInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoCapture(file, 'rear');
                  e.target.value = '';
                }}
              />
              {rearPreview ? (
                <div style={{ position: 'relative' }}>
                  <img
                    src={rearPreview}
                    alt="후면"
                    style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, border: '2px solid #f59e0b' }}
                  />
                  <button
                    onClick={() => { setRearPhoto(null); setRearPreview(null); }}
                    style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', fontSize: 12 }}
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => rearInputRef.current?.click()}
                  style={{
                    width: '100%',
                    height: 120,
                    borderRadius: 8,
                    border: '2px dashed var(--ct-border, #475569)',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'var(--ct-text-muted, #94a3b8)',
                    cursor: 'pointer',
                    fontSize: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 24 }}>📷</span>
                  후면 촬영
                </button>
              )}
            </div>
          </div>

          {/* 체중 입력 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text-secondary, #cbd5e1)', marginBottom: 6, display: 'block' }}>
                ⚖️ 실측 체중 (kg)
              </label>
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="예: 650"
                min={50}
                max={1500}
                step={0.1}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--ct-border, #475569)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--ct-text, #f1f5f9)',
                  fontSize: 14,
                  fontWeight: 700,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text-secondary, #cbd5e1)', marginBottom: 6, display: 'block' }}>
                📝 메모 (선택)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="예: 렐리 로봇 측정"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--ct-border, #475569)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--ct-text, #f1f5f9)',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* 메시지 */}
          {message && (
            <div style={{
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              background: message.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: message.type === 'success' ? '#22c55e' : '#ef4444',
              border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            }}>
              {message.text}
            </div>
          )}

          {/* 저장 버튼 */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !weight.trim()}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: submitting || !weight.trim() ? '#475569' : '#f59e0b',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: submitting || !weight.trim() ? 'not-allowed' : 'pointer',
              transition: '0.2s',
            }}
          >
            {submitting ? '저장 중...' : '💾 체중 기록 저장'}
          </button>

          {/* 최근 이력 */}
          {history.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ct-text-secondary, #cbd5e1)', marginBottom: 8 }}>
                📊 최근 기록 ({history.length}건)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {history.map((r) => {
                  const d = new Date(r.measuredAt);
                  const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                  return (
                    <div key={r.measurementId} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.03)',
                      fontSize: 12,
                    }}>
                      <span style={{ color: 'var(--ct-text-muted, #94a3b8)' }}>{dateStr}</span>
                      <span style={{ fontWeight: 700, color: '#f59e0b' }}>{r.actualWeightKg}kg</span>
                      <span style={{ color: 'var(--ct-text-muted, #64748b)', fontSize: 10 }}>
                        {r.hasSidePhoto ? '📷' : ''}
                        {r.hasRearPhoto ? '📷' : ''}
                        {!r.hasSidePhoto && !r.hasRearPhoto ? '—' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
