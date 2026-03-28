// 이벤트 기록 모달 — 2단계: 이벤트 타입 선택 → 폼 입력
import React, { useState, useCallback } from 'react';
import type { AnimalEventType, AnimalEventCreateInput } from '@web/api/animal-events.api';
import { createAnimalEvent } from '@web/api/animal-events.api';

// ── 이벤트 타입 메타 ──

const EVENT_TYPES: readonly { type: AnimalEventType; icon: string; label: string; desc: string; color: string }[] = [
  { type: 'calving',         icon: '🐣', label: '분만',       desc: '송아지 출산 기록',       color: '#f59e0b' },
  { type: 'insemination',    icon: '💉', label: '수정(AI)',    desc: '인공수정 기록',           color: '#3b82f6' },
  { type: 'pregnancy_check', icon: '🔍', label: '임신감정',    desc: '직장검사/초음파 결과',    color: '#8b5cf6' },
  { type: 'treatment',       icon: '💊', label: '치료/투약',   desc: '질병 치료 및 약물 투여',  color: '#ef4444' },
  { type: 'dry_off',         icon: '🏖️', label: '건유',        desc: '건유 전환',               color: '#eab308' },
  { type: 'dhi',             icon: '📊', label: '검정측정',    desc: 'DHI 유성분 검정',         color: '#06b6d4' },
  { type: 'cull',            icon: '❌', label: '도태',        desc: '폐사·출하·도축 처리',     color: '#6b7280' },
  { type: 'vaccination',     icon: '💉', label: '예방접종',    desc: '백신 접종 기록',          color: '#22c55e' },
  { type: 'herd_move',       icon: '🚚', label: '우군이동',    desc: '군 또는 축사 이동',       color: '#94a3b8' },
];

// ── 공통 input 스타일 ──

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 6,
  background: '#0f172a', border: '1px solid #334155',
  color: '#f1f5f9', fontSize: 12, boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 3, display: 'block',
};

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

// ── 개별 폼 컴포넌트 ──

function CalvingForm({ details, onChange }: { details: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }): React.JSX.Element {
  const set = (k: string, v: unknown) => onChange({ ...details, [k]: v });
  return (
    <>
      <Field label="송아지 성별">
        <select value={(details.calfSex as string) ?? 'unknown'} onChange={(e) => set('calfSex', e.target.value)} style={inputStyle}>
          <option value="female">암</option>
          <option value="male">수</option>
          <option value="unknown">미상</option>
        </select>
      </Field>
      <Field label="송아지 상태">
        <select value={(details.calfStatus as string) ?? 'alive'} onChange={(e) => set('calfStatus', e.target.value)} style={inputStyle}>
          <option value="alive">생존</option>
          <option value="weak">허약</option>
          <option value="stillborn">사산</option>
        </select>
      </Field>
      <Field label="송아지 귀표번호 (선택)">
        <input type="text" value={(details.calfEarTag as string) ?? ''} onChange={(e) => set('calfEarTag', e.target.value)} placeholder="귀표번호" style={inputStyle} />
      </Field>
      <Field label="분만 난이도 (1=쉬움, 5=난산)">
        <select value={(details.calvingEase as number) ?? 1} onChange={(e) => set('calvingEase', Number(e.target.value))} style={inputStyle}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
    </>
  );
}

function InseminationForm({ details, onChange }: { details: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }): React.JSX.Element {
  const set = (k: string, v: unknown) => onChange({ ...details, [k]: v });
  return (
    <>
      <Field label="종모우 / 정액 번호">
        <input type="text" value={(details.semenBull as string) ?? ''} onChange={(e) => set('semenBull', e.target.value)} placeholder="KPN1234 또는 종모우명" style={inputStyle} />
      </Field>
      <Field label="수정사 이름">
        <input type="text" value={(details.technicianName as string) ?? ''} onChange={(e) => set('technicianName', e.target.value)} placeholder="수정사 이름" style={inputStyle} />
      </Field>
      <Field label="정액 종류">
        <select value={(details.method as string) ?? 'frozen'} onChange={(e) => set('method', e.target.value)} style={inputStyle}>
          <option value="frozen">동결 정액</option>
          <option value="sexed">성감별 정액</option>
          <option value="fresh">신선 정액</option>
        </select>
      </Field>
      <Field label="발정 강도 (0=미약, 3=강)">
        <select value={(details.heatScore as number) ?? 1} onChange={(e) => set('heatScore', Number(e.target.value))} style={inputStyle}>
          {[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
    </>
  );
}

function PregnancyCheckForm({ details, onChange }: { details: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }): React.JSX.Element {
  const set = (k: string, v: unknown) => onChange({ ...details, [k]: v });
  return (
    <>
      <Field label="임신감정 결과 *">
        <select value={(details.result as string) ?? ''} onChange={(e) => set('result', e.target.value)} style={inputStyle}>
          <option value="">선택</option>
          <option value="pregnant">임신 ✅</option>
          <option value="open">미임신 ❌</option>
          <option value="uncertain">불확실</option>
        </select>
      </Field>
      <Field label="검사 방법">
        <select value={(details.method as string) ?? 'rectal'} onChange={(e) => set('method', e.target.value)} style={inputStyle}>
          <option value="rectal">직장검사</option>
          <option value="ultrasound">초음파</option>
        </select>
      </Field>
      <Field label="수정 후 경과일">
        <input type="number" min={0} value={(details.daysPostInsemination as number) ?? ''} onChange={(e) => set('daysPostInsemination', Number(e.target.value))} placeholder="예: 28" style={inputStyle} />
      </Field>
    </>
  );
}

function TreatmentForm({ details, onChange }: { details: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }): React.JSX.Element {
  const set = (k: string, v: unknown) => onChange({ ...details, [k]: v });
  const meds = (details.medications as Array<Record<string, string>>) ?? [];
  const addMed = () => set('medications', [...meds, { name: '', dose: '', route: '근육주사' }]);
  const updateMed = (i: number, field: string, val: string) => {
    const next = meds.map((m, idx) => idx === i ? { ...m, [field]: val } : m);
    set('medications', next);
  };
  return (
    <>
      <Field label="진단명 *">
        <input type="text" value={(details.diagnosis as string) ?? ''} onChange={(e) => set('diagnosis', e.target.value)} placeholder="케토시스, 유방염 등" style={inputStyle} />
      </Field>
      <Field label="체온 (°C)">
        <input type="number" step="0.1" value={(details.bodyTemp as number) ?? ''} onChange={(e) => set('bodyTemp', parseFloat(e.target.value))} placeholder="38.5" style={inputStyle} />
      </Field>
      <div style={{ marginBottom: 10 }}>
        <div style={{ ...labelStyle, marginBottom: 6 }}>
          투약 내역
          <button type="button" onClick={addMed} style={{ marginLeft: 8, fontSize: 10, background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>+ 추가</button>
        </div>
        {meds.map((med, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
            <input type="text" value={med.name ?? ''} onChange={(e) => updateMed(i, 'name', e.target.value)} placeholder="약품명" style={{ ...inputStyle, marginBottom: 0 }} />
            <input type="text" value={med.dose ?? ''} onChange={(e) => updateMed(i, 'dose', e.target.value)} placeholder="용량" style={{ ...inputStyle, marginBottom: 0 }} />
            <input type="text" value={med.route ?? ''} onChange={(e) => updateMed(i, 'route', e.target.value)} placeholder="투여경로" style={{ ...inputStyle, marginBottom: 0 }} />
          </div>
        ))}
      </div>
      <Field label="수의사 이름">
        <input type="text" value={(details.vetName as string) ?? ''} onChange={(e) => set('vetName', e.target.value)} placeholder="담당 수의사" style={inputStyle} />
      </Field>
      <Field label="휴약기간 (일)">
        <input type="number" min={0} value={(details.withdrawalDays as number) ?? 0} onChange={(e) => set('withdrawalDays', Number(e.target.value))} style={inputStyle} />
      </Field>
    </>
  );
}

function DryOffForm({ details, onChange }: { details: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }): React.JSX.Element {
  const set = (k: string, v: unknown) => onChange({ ...details, [k]: v });
  return (
    <>
      <Field label="예정 분만일">
        <input type="date" value={(details.expectedCalvingDate as string) ?? ''} onChange={(e) => set('expectedCalvingDate', e.target.value)} style={inputStyle} />
      </Field>
      <Field label="건유 직전 유량 (L/일)">
        <input type="number" step="0.1" value={(details.milkYieldAtDryOff as number) ?? ''} onChange={(e) => set('milkYieldAtDryOff', parseFloat(e.target.value))} placeholder="예: 8.5" style={inputStyle} />
      </Field>
      <Field label="건유 사유">
        <input type="text" value={(details.dryOffReason as string) ?? ''} onChange={(e) => set('dryOffReason', e.target.value)} placeholder="자연건유, 조기건유 등" style={inputStyle} />
      </Field>
    </>
  );
}

function DhiForm({ details, onChange }: { details: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }): React.JSX.Element {
  const set = (k: string, v: unknown) => onChange({ ...details, [k]: v });
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="유량 (kg)">
          <input type="number" step="0.1" value={(details.milkKg as number) ?? ''} onChange={(e) => set('milkKg', parseFloat(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="DIM">
          <input type="number" min={0} value={(details.dim as number) ?? ''} onChange={(e) => set('dim', Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="유지방 (%)">
          <input type="number" step="0.01" value={(details.fatPct as number) ?? ''} onChange={(e) => set('fatPct', parseFloat(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="유단백 (%)">
          <input type="number" step="0.01" value={(details.proteinPct as number) ?? ''} onChange={(e) => set('proteinPct', parseFloat(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="체세포수 (천개/mL)">
          <input type="number" min={0} value={(details.scc as number) ?? ''} onChange={(e) => set('scc', Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="요소태질소 (mg/dL)">
          <input type="number" step="0.1" value={(details.urea as number) ?? ''} onChange={(e) => set('urea', parseFloat(e.target.value))} style={inputStyle} />
        </Field>
      </div>
    </>
  );
}

function CullForm({ details, onChange }: { details: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }): React.JSX.Element {
  const set = (k: string, v: unknown) => onChange({ ...details, [k]: v });
  return (
    <>
      <Field label="도태 사유 *">
        <select value={(details.reason as string) ?? ''} onChange={(e) => set('reason', e.target.value)} style={inputStyle}>
          <option value="">선택</option>
          <option value="disease">질병</option>
          <option value="injury">부상</option>
          <option value="low_production">저생산</option>
          <option value="age">노령</option>
          <option value="reproductive">번식장애</option>
          <option value="other">기타</option>
        </select>
      </Field>
      <Field label="처리 방법">
        <select value={(details.destination as string) ?? 'slaughter'} onChange={(e) => set('destination', e.target.value)} style={inputStyle}>
          <option value="slaughter">도축</option>
          <option value="sold">판매</option>
          <option value="euthanasia">안락사</option>
          <option value="death">폐사</option>
        </select>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="체중 (kg)">
          <input type="number" min={0} value={(details.weight as number) ?? ''} onChange={(e) => set('weight', Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="경락/판매가 (원)">
          <input type="number" min={0} value={(details.price as number) ?? ''} onChange={(e) => set('price', Number(e.target.value))} style={inputStyle} />
        </Field>
      </div>
    </>
  );
}

function VaccinationForm({ details, onChange }: { details: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }): React.JSX.Element {
  const set = (k: string, v: unknown) => onChange({ ...details, [k]: v });
  return (
    <>
      <Field label="백신명 *">
        <input type="text" value={(details.vaccineName as string) ?? ''} onChange={(e) => set('vaccineName', e.target.value)} placeholder="백신 제품명" style={inputStyle} />
      </Field>
      <Field label="백신 종류">
        <input type="text" value={(details.vaccineType as string) ?? ''} onChange={(e) => set('vaccineType', e.target.value)} placeholder="구제역, 브루셀라 등" style={inputStyle} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="로트번호">
          <input type="text" value={(details.batchNo as string) ?? ''} onChange={(e) => set('batchNo', e.target.value)} placeholder="배치번호" style={inputStyle} />
        </Field>
        <Field label="접종 횟수">
          <input type="number" min={1} value={(details.doseCount as number) ?? 1} onChange={(e) => set('doseCount', Number(e.target.value))} style={inputStyle} />
        </Field>
      </div>
      <Field label="다음 접종 예정일">
        <input type="date" value={(details.nextDueDate as string) ?? ''} onChange={(e) => set('nextDueDate', e.target.value)} style={inputStyle} />
      </Field>
    </>
  );
}

function HerdMoveForm({ details, onChange }: { details: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }): React.JSX.Element {
  const set = (k: string, v: unknown) => onChange({ ...details, [k]: v });
  return (
    <>
      <Field label="이동 전 우군 (선택)">
        <input type="text" value={(details.fromGroup as string) ?? ''} onChange={(e) => set('fromGroup', e.target.value)} placeholder="착유우 1군" style={inputStyle} />
      </Field>
      <Field label="이동 후 우군 *">
        <input type="text" value={(details.toGroup as string) ?? ''} onChange={(e) => set('toGroup', e.target.value)} placeholder="건유우 군" style={inputStyle} />
      </Field>
      <Field label="이동 사유">
        <input type="text" value={(details.reason as string) ?? ''} onChange={(e) => set('reason', e.target.value)} placeholder="건유 전환, 임신우 이동 등" style={inputStyle} />
      </Field>
    </>
  );
}

const FORM_COMPONENTS: Record<AnimalEventType, React.ComponentType<{ details: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }>> = {
  calving:         CalvingForm,
  insemination:    InseminationForm,
  pregnancy_check: PregnancyCheckForm,
  treatment:       TreatmentForm,
  dry_off:         DryOffForm,
  dhi:             DhiForm,
  cull:            CullForm,
  vaccination:     VaccinationForm,
  herd_move:       HerdMoveForm,
};

// ── 메인 모달 컴포넌트 ──

interface Props {
  readonly animalId: string;
  readonly farmId: string;
  readonly earTag: string;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

export function EventFormModal({ animalId, earTag, onClose, onSuccess }: Props): React.JSX.Element {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<AnimalEventType | null>(null);
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [recordedByName, setRecordedByName] = useState('');
  const [details, setDetails] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTypeSelect = useCallback((type: AnimalEventType) => {
    setSelectedType(type);
    setDetails({});
    setStep(2);
  }, []);

  const handleBack = useCallback(() => {
    setStep(1);
    setSelectedType(null);
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedType) return;
    setSaving(true);
    setError(null);
    try {
      const input: AnimalEventCreateInput = {
        eventType: selectedType,
        eventDate: new Date(eventDate).toISOString(),
        notes: notes.trim() || undefined,
        recordedByName: recordedByName.trim() || undefined,
        details,
      };
      await createAnimalEvent(animalId, input);
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '저장 실패';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [selectedType, eventDate, notes, recordedByName, details, animalId, onSuccess]);

  const meta = selectedType ? EVENT_TYPES.find((e) => e.type === selectedType) : null;
  const FormComponent = selectedType ? FORM_COMPONENTS[selectedType] : null;

  return (
    <>
      {/* 배경 오버레이 */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)' }}
      />

      {/* 모달 */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', zIndex: 301,
        transform: 'translate(-50%, -50%)',
        width: Math.min(480, window.innerWidth - 32),
        maxHeight: '90vh', overflowY: 'auto',
        background: '#1a1f2e', borderRadius: 14,
        border: '1px solid #334155',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        padding: 20,
      }}>

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9' }}>
              {step === 1 ? '이벤트 기록' : `${meta?.icon} ${meta?.label}`}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {earTag} · {step === 1 ? '이벤트 종류 선택' : '상세 정보 입력'}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {/* 단계 1: 이벤트 타입 선택 */}
        {step === 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {EVENT_TYPES.map((et) => (
              <button
                key={et.type}
                type="button"
                onClick={() => handleTypeSelect(et.type)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '12px 8px', borderRadius: 10, cursor: 'pointer',
                  background: `${et.color}10`,
                  border: `1px solid ${et.color}30`,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${et.color}20`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${et.color}10`; }}
              >
                <span style={{ fontSize: 20, marginBottom: 4 }}>{et.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: et.color }}>{et.label}</span>
                <span style={{ fontSize: 9, color: '#64748b', textAlign: 'center', marginTop: 2, lineHeight: 1.3 }}>{et.desc}</span>
              </button>
            ))}
          </div>
        )}

        {/* 단계 2: 폼 입력 */}
        {step === 2 && FormComponent && (
          <div>
            {/* 공통 필드 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Field label="이벤트 날짜 *">
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="기록자">
                <input type="text" value={recordedByName} onChange={(e) => setRecordedByName(e.target.value)} placeholder="이름 (선택)" style={inputStyle} />
              </Field>
            </div>

            <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, marginBottom: 10 }}>
              <FormComponent details={details} onChange={setDetails} />
            </div>

            <Field label="메모">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="추가 메모 (선택)"
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </Field>

            {error && (
              <div style={{ padding: '8px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, fontSize: 11, color: '#ef4444', marginBottom: 10 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleBack}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  background: 'none', border: '1px solid #334155',
                  color: '#94a3b8', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                ← 뒤로
              </button>
              <button
                type="button"
                onClick={() => { void handleSubmit(); }}
                disabled={saving}
                style={{
                  flex: 2, padding: '10px 0', borderRadius: 8,
                  background: saving ? '#334155' : `linear-gradient(135deg, ${meta?.color ?? '#2563eb'}, ${meta?.color ?? '#3b82f6'})`,
                  color: saving ? '#64748b' : '#fff',
                  border: 'none', cursor: saving ? 'wait' : 'pointer',
                  fontSize: 13, fontWeight: 700,
                }}
              >
                {saving ? '저장 중...' : `${meta?.icon} 기록 저장`}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
