// 현장 빠른 기록 바텀시트
// 3단계: 기록 유형 → 귀표번호 → 세부 입력 + 사진
// 오프라인 시 IndexedDB 큐에 저장

import React, { useState, useRef } from 'react';
import { apiPost } from '@web/api/client';
import { useAuthStore } from '@web/stores/auth.store';
import { enqueueRecord } from '@web/lib/offline-queue';

interface Props {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onQueued: () => void;  // 오프라인 저장 시 부모에 알림
}

type RecordType = '발정확인' | '수정기록' | '진료메모' | '분만기록' | '폐사기록';

const RECORD_TYPES: { type: RecordType; icon: string; desc: string }[] = [
  { type: '발정확인', icon: '🌡️', desc: '발정 징후 확인' },
  { type: '수정기록', icon: '💉', desc: '인공수정 실시' },
  { type: '진료메모', icon: '🩺', desc: '증상 및 처치' },
  { type: '분만기록', icon: '🐄', desc: '분만 확인' },
  { type: '폐사기록', icon: '⚠️', desc: '폐사 기록' },
];

export function QuickRecordSheet({ isOpen, onClose, onQueued }: Props): React.JSX.Element | null {
  const farmIds = useAuthStore((s) => s.user?.farmIds);
  const farmId = farmIds?.[0] ?? '';

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [recordType, setRecordType] = useState<RecordType | null>(null);
  const [earTag, setEarTag] = useState('');
  const [notes, setNotes] = useState('');
  const [subType, setSubType] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleClose() {
    setStep(1); setRecordType(null); setEarTag('');
    setNotes(''); setSubType(''); setPhotoUrl(null);
    onClose();
  }

  function selectType(type: RecordType) {
    setRecordType(type);
    setStep(2);
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!recordType || !earTag.trim()) return;
    setSaving(true);

    const payload = {
      farmId,
      eventType: typeToEventType(recordType),
      subType: subType || null,
      description: `[${recordType}] 귀표 ${earTag}${notes ? ' — ' + notes : ''}`,
      eventDate: new Date().toISOString(),
      metadata: {
        earTag: earTag.trim(),
        recordType,
        subType: subType || null,
        notes,
        photo: photoUrl ?? null,
      },
    };

    try {
      if (!navigator.onLine) throw new Error('offline');
      await apiPost('/events', payload);
    } catch {
      await enqueueRecord(payload);
      onQueued();
    } finally {
      setSaving(false);
    }
    handleClose();
  }

  if (!isOpen) return null;

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={handleClose}
      />

      {/* 바텀시트 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl flex flex-col"
        style={{ background: 'var(--ct-card)', maxHeight: '90vh' }}
      >
        {/* 핸들 + 헤더 */}
        <div className="flex flex-col items-center pt-3 pb-2 px-4">
          <div className="w-10 h-1 rounded-full bg-gray-500 mb-3" />
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                  className="text-sm"
                  style={{ color: 'var(--ct-text-secondary)' }}
                >
                  ←
                </button>
              )}
              <h3 className="font-semibold text-sm" style={{ color: 'var(--ct-text)' }}>
                {step === 1 ? '기록 유형 선택' : step === 2 ? '개체 확인' : `${recordType ?? ''} 입력`}
              </h3>
            </div>
            <button type="button" onClick={handleClose} className="text-lg" style={{ color: 'var(--ct-text-secondary)' }}>×</button>
          </div>
          {/* 진행 바 */}
          <div className="flex gap-1 mt-2 w-full">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className="h-1 flex-1 rounded-full transition-colors"
                style={{ background: s <= step ? '#10b981' : 'var(--ct-border)' }}
              />
            ))}
          </div>
        </div>

        {/* 콘텐츠 */}
        <div className="overflow-y-auto flex-1 px-4 pb-6">

          {/* STEP 1: 기록 유형 */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              {RECORD_TYPES.map(({ type, icon, desc }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => selectType(type)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center transition-colors active:scale-95"
                  style={{ borderColor: 'var(--ct-border)', background: 'var(--ct-bg)' }}
                >
                  <span className="text-2xl">{icon}</span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--ct-text)' }}>{type}</span>
                  <span className="text-[10px]" style={{ color: 'var(--ct-text-secondary)' }}>{desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* STEP 2: 귀표번호 */}
          {step === 2 && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--ct-text-secondary)' }}>
                  귀표번호 *
                </label>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  placeholder="예: 002123456789"
                  value={earTag}
                  onChange={(e) => setEarTag(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3 text-base"
                  style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
                />
              </div>
              <button
                type="button"
                disabled={!earTag.trim()}
                onClick={() => setStep(3)}
                className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: '#10b981' }}
              >
                다음
              </button>
            </div>
          )}

          {/* STEP 3: 세부 입력 + 사진 */}
          {step === 3 && (
            <div className="space-y-4 pt-2">
              {/* 기록 유형별 세부 필드 */}
              {recordType === '발정확인' && (
                <SubTypeSelect
                  label="발정 징후"
                  options={['승가 허용', '점액 분비', '활동 증가', '기타']}
                  value={subType}
                  onChange={setSubType}
                />
              )}
              {recordType === '수정기록' && (
                <SubTypeSelect
                  label="수정 방법"
                  options={['인공수정', '자연수정']}
                  value={subType}
                  onChange={setSubType}
                />
              )}
              {recordType === '진료메모' && (
                <SubTypeSelect
                  label="증상"
                  options={['발열', '유방염', '설사', '폐렴', '파행', '기타']}
                  value={subType}
                  onChange={setSubType}
                />
              )}
              {recordType === '분만기록' && (
                <SubTypeSelect
                  label="분만 형태"
                  options={['정상 분만', '난산(보조)', '제왕절개', '사산']}
                  value={subType}
                  onChange={setSubType}
                />
              )}
              {recordType === '폐사기록' && (
                <SubTypeSelect
                  label="폐사 원인"
                  options={['질병', '사고', '노령', '원인불명']}
                  value={subType}
                  onChange={setSubType}
                />
              )}

              {/* 메모 */}
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--ct-text-secondary)' }}>
                  메모 (선택)
                </label>
                <textarea
                  rows={2}
                  placeholder="추가 내용..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm resize-none"
                  style={{ background: 'var(--ct-bg)', borderColor: 'var(--ct-border)', color: 'var(--ct-text)' }}
                />
              </div>

              {/* 사진 첨부 */}
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--ct-text-secondary)' }}>
                  사진 첨부 (선택)
                </label>
                {photoUrl ? (
                  <div className="relative">
                    <img src={photoUrl} alt="첨부 사진" className="w-full h-32 object-cover rounded-xl" />
                    <button
                      type="button"
                      onClick={() => setPhotoUrl(null)}
                      className="absolute top-2 right-2 bg-black/60 rounded-full w-6 h-6 text-white text-xs flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed py-4 text-sm"
                    style={{ borderColor: 'var(--ct-border)', color: 'var(--ct-text-secondary)' }}
                  >
                    <span>📷</span> 카메라로 촬영
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhoto}
                />
              </div>

              {/* 저장 버튼 */}
              <button
                type="button"
                disabled={saving}
                onClick={handleSubmit}
                className="w-full rounded-xl py-3.5 font-semibold text-white"
                style={{ background: saving ? '#6b7280' : '#10b981' }}
              >
                {saving ? '저장 중...' : navigator.onLine ? '저장' : '📦 오프라인 저장'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ===========================
// 서브타입 선택 컴포넌트
// ===========================

function SubTypeSelect({
  label, options, value, onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ct-text-secondary)' }}>
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            style={{
              borderColor: value === o ? '#10b981' : 'var(--ct-border)',
              background: value === o ? '#10b981' : 'var(--ct-bg)',
              color: value === o ? '#fff' : 'var(--ct-text)',
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ===========================
// 유형 → eventType 매핑
// ===========================

function typeToEventType(type: RecordType): string {
  const map: Record<RecordType, string> = {
    '발정확인': 'estrus',
    '수정기록': 'insemination',
    '진료메모': 'health_treatment',
    '분만기록': 'calving',
    '폐사기록': 'death',
  };
  return map[type];
}
