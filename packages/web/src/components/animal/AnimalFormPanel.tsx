// 동물 등록/수정 폼 패널
// - 농장주/수의사가 새 소 등록 또는 기존 정보 수정
// - 이력번호 12자리 입력 시 EKAPE 실시간 조회 → 생년월일·성별 자동 채움
// - 이미 등록된 이력번호는 즉시 경고 (농장명 + 귀표번호 안내)

import React, { useState, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createAnimal,
  updateAnimal,
  checkTraceability,
  BREED_LABELS,
  SEX_LABELS,
  type AnimalRecord,
  type CreateAnimalInput,
  type UpdateAnimalInput,
  type BreedCode,
  type SexCode,
  type TraceabilityCheckResult,
} from '@web/api/animal-management.api';

interface Props {
  readonly farmId: string;                // 대상 농장 (생성 시 필수)
  readonly editAnimal: AnimalRecord | null; // null = 생성 모드
  readonly onClose: () => void;
  readonly onSaved: (animal: AnimalRecord) => void;
}

// 폼 상태 — 서버 스키마와 약간 다르게 string/빈값 허용
interface FormState {
  earTag: string;
  traceId: string;
  name: string;
  breed: BreedCode;
  sex: SexCode;
  birthDate: string;      // YYYY-MM-DD
  parity: string;         // input은 string
  currentDeviceId: string;
}

interface FormErrors {
  readonly earTag?: string;
  readonly traceId?: string;
  readonly parity?: string;
  readonly general?: string;
}

const INITIAL_FORM: FormState = {
  earTag: '',
  traceId: '',
  name: '',
  breed: 'holstein',
  sex: 'female',
  birthDate: '',
  parity: '0',
  currentDeviceId: '',
};

function toFormState(a: AnimalRecord): FormState {
  return {
    earTag: a.earTag,
    traceId: a.traceId ?? '',
    name: a.name ?? '',
    breed: a.breed,
    sex: a.sex,
    birthDate: a.birthDate ?? '',
    parity: String(a.parity),
    currentDeviceId: a.currentDeviceId ?? '',
  };
}

function fieldStyle(hasError: boolean): React.CSSProperties {
  return {
    background: 'var(--ct-bg)',
    borderColor: hasError ? 'var(--ct-danger, #ef4444)' : 'var(--ct-border)',
    color: 'var(--ct-text)',
    outline: 'none',
  };
}

export function AnimalFormPanel({ farmId, editAnimal, onClose, onSaved }: Props): React.JSX.Element {
  const queryClient = useQueryClient();
  const isEdit = editAnimal !== null;

  const [form, setForm] = useState<FormState>(
    isEdit ? toFormState(editAnimal) : INITIAL_FORM,
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [traceCheck, setTraceCheck] = useState<TraceabilityCheckResult | null>(null);
  const [traceChecking, setTraceChecking] = useState(false);

  // 이력번호 12자리 완성 시 debounce로 자동 조회 (수정 모드에서 traceId 변경 시도 동일)
  useEffect(() => {
    const trimmed = form.traceId.trim();
    if (!/^\d{12}$/.test(trimmed)) {
      setTraceCheck(null);
      return;
    }
    // 수정 중인데 기존 값과 동일하면 조회 안 함
    if (isEdit && editAnimal && trimmed === (editAnimal.traceId ?? '')) {
      setTraceCheck(null);
      return;
    }

    const t = setTimeout(() => {
      setTraceChecking(true);
      checkTraceability(trimmed)
        .then((result) => {
          setTraceCheck(result);
          // EKAPE 데이터로 자동 채움 (사용자가 기존에 입력한 값은 보존)
          if (!result.alreadyRegistered && result.ekapeData) {
            const ek = result.ekapeData;
            setForm((prev) => ({
              ...prev,
              birthDate: prev.birthDate || (typeof ek.birthDate === 'string' ? ek.birthDate : prev.birthDate),
              // sex는 EKAPE 응답 형식에 따라 매핑 필요 — 간단히 female 유지
            }));
          }
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[AnimalFormPanel] traceability check failed:', err);
          setTraceCheck(null);
        })
        .finally(() => setTraceChecking(false));
    }, 500);

    return () => clearTimeout(t);
  }, [form.traceId, isEdit, editAnimal]);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const validate = useCallback((f: FormState): FormErrors => {
    const e: Record<string, string> = {};
    if (!f.earTag || f.earTag.trim().length < 1) e.earTag = '귀표번호를 입력하세요';
    if (f.earTag.length > 50) e.earTag = '귀표번호는 50자 이내';
    if (f.traceId && !/^\d{12}$/.test(f.traceId.trim())) e.traceId = '이력번호는 12자리 숫자';
    const parityNum = Number(f.parity);
    if (Number.isNaN(parityNum) || parityNum < 0) e.parity = '산차는 0 이상';
    return e;
  }, []);

  const createMutation = useMutation({
    mutationFn: (input: CreateAnimalInput) => createAnimal(input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['animals'] });
      void queryClient.invalidateQueries({ queryKey: ['farm', farmId] });
      onSaved(created);
    },
    onError: (err: Error) => {
      setErrors({ general: err.message || '등록 실패' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; body: UpdateAnimalInput }) => updateAnimal(input.id, input.body),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['animals'] });
      void queryClient.invalidateQueries({ queryKey: ['animal', updated.animalId] });
      onSaved(updated);
    },
    onError: (err: Error) => {
      setErrors({ general: err.message || '수정 실패' });
    },
  });

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    // 이력번호 중복 차단 (alreadyRegistered)
    if (traceCheck?.alreadyRegistered && form.traceId) {
      setErrors({ traceId: traceCheck.message ?? '이미 등록된 이력번호입니다' });
      return;
    }

    if (isEdit && editAnimal) {
      const body: UpdateAnimalInput = {
        earTag: form.earTag !== editAnimal.earTag ? form.earTag : undefined,
        traceId: form.traceId !== (editAnimal.traceId ?? '') ? (form.traceId || null) : undefined,
        name: form.name !== (editAnimal.name ?? '') ? (form.name || null) : undefined,
        breed: form.breed !== editAnimal.breed ? form.breed : undefined,
        sex: form.sex !== editAnimal.sex ? form.sex : undefined,
        birthDate: form.birthDate !== (editAnimal.birthDate ?? '')
          ? (form.birthDate || null) : undefined,
        parity: Number(form.parity) !== editAnimal.parity ? Number(form.parity) : undefined,
        currentDeviceId: form.currentDeviceId !== (editAnimal.currentDeviceId ?? '')
          ? (form.currentDeviceId || null) : undefined,
      };
      // 변경이 없는 경우 — 그냥 닫기
      const hasChanges = Object.values(body).some((v) => v !== undefined);
      if (!hasChanges) {
        onClose();
        return;
      }
      updateMutation.mutate({ id: editAnimal.animalId, body });
    } else {
      const body: CreateAnimalInput = {
        farmId,
        earTag: form.earTag.trim(),
        traceId: form.traceId.trim() || undefined,
        name: form.name.trim() || undefined,
        breed: form.breed,
        sex: form.sex,
        birthDate: form.birthDate || undefined,
        parity: Number(form.parity),
        currentDeviceId: form.currentDeviceId.trim() || undefined,
      };
      createMutation.mutate(body);
    }
  }, [form, isEdit, editAnimal, farmId, validate, createMutation, updateMutation, traceCheck, onClose]);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div
      className="flex flex-col"
      style={{
        background: 'var(--ct-card)',
        color: 'var(--ct-text)',
        borderRadius: 12,
        padding: 20,
        maxHeight: '90vh',
        width: '100%',
        maxWidth: 480,
        overflowY: 'auto',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{isEdit ? '개체 수정' : '새 개체 등록'}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm"
          style={{ color: 'var(--ct-text-secondary)' }}
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {/* 귀표번호 */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
            귀표번호 *
          </label>
          <input
            type="text"
            value={form.earTag}
            onChange={(e) => updateField('earTag', e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={fieldStyle(submitted && !!errors.earTag)}
            placeholder="예: 580"
            inputMode="numeric"
            autoFocus={!isEdit}
          />
          {submitted && errors.earTag && <p className="text-xs text-red-400 mt-1">{errors.earTag}</p>}
        </div>

        {/* 이력제번호 (12자리) + EKAPE 실시간 조회 */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
            이력제번호 (12자리 숫자, 선택)
          </label>
          <div className="relative">
            <input
              type="text"
              value={form.traceId}
              onChange={(e) => updateField('traceId', e.target.value.replace(/\D/g, '').slice(0, 12))}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={fieldStyle(submitted && !!errors.traceId)}
              placeholder="002132665191"
              inputMode="numeric"
              maxLength={12}
            />
            {traceChecking && (
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                style={{ color: 'var(--ct-text-secondary)' }}
              >
                조회 중...
              </span>
            )}
          </div>
          {submitted && errors.traceId && <p className="text-xs text-red-400 mt-1">{errors.traceId}</p>}
          {traceCheck?.alreadyRegistered && (
            <p className="text-xs text-red-400 mt-1">
              ⚠️ {traceCheck.message ?? '이미 등록된 이력번호'}
            </p>
          )}
          {traceCheck?.ekapeData && !traceCheck.alreadyRegistered && (
            <p className="text-xs mt-1" style={{ color: 'var(--ct-success, #10b981)' }}>
              ✓ 이력제 조회 완료 {traceCheck.ekapeData.birthDate ? `· 생년월일 자동 채움` : ''}
            </p>
          )}
          {traceCheck?.ekapeError && (
            <p className="text-xs mt-1" style={{ color: 'var(--ct-text-secondary)' }}>
              (이력제 서버 응답 없음 — 수동 입력 가능)
            </p>
          )}
        </div>

        {/* 이름 (선택) */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
            이름 (선택)
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={fieldStyle(false)}
            placeholder="예: 큰봉이"
          />
        </div>

        {/* 품종 + 성별 (2열) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
              품종 *
            </label>
            <select
              value={form.breed}
              onChange={(e) => updateField('breed', e.target.value as BreedCode)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={fieldStyle(false)}
            >
              {(Object.keys(BREED_LABELS) as BreedCode[]).map((b) => (
                <option key={b} value={b}>{BREED_LABELS[b]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
              성별 *
            </label>
            <select
              value={form.sex}
              onChange={(e) => updateField('sex', e.target.value as SexCode)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={fieldStyle(false)}
            >
              {(Object.keys(SEX_LABELS) as SexCode[]).map((s) => (
                <option key={s} value={s}>{SEX_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 생년월일 + 산차 (2열) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
              생년월일
            </label>
            <input
              type="date"
              value={form.birthDate}
              onChange={(e) => updateField('birthDate', e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={fieldStyle(false)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
              산차
            </label>
            <input
              type="number"
              value={form.parity}
              onChange={(e) => updateField('parity', e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={fieldStyle(submitted && !!errors.parity)}
              min={0}
              max={15}
            />
            {submitted && errors.parity && <p className="text-xs text-red-400 mt-1">{errors.parity}</p>}
          </div>
        </div>

        {/* smaXtec 센서 serial (선택) */}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--ct-text-secondary)' }}>
            smaXtec 센서 시리얼 (선택)
          </label>
          <input
            type="text"
            value={form.currentDeviceId}
            onChange={(e) => updateField('currentDeviceId', e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={fieldStyle(false)}
            placeholder="예: 5e462f46..."
          />
          <p className="text-xs mt-1" style={{ color: 'var(--ct-text-secondary)' }}>
            센서를 장착한 후에 나중에 추가해도 됩니다
          </p>
        </div>

        {/* 에러 메시지 */}
        {errors.general && (
          <div
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--ct-danger, #ef4444)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            {errors.general}
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium"
            style={{
              borderColor: 'var(--ct-border)',
              background: 'var(--ct-bg)',
              color: 'var(--ct-text)',
            }}
            disabled={isSubmitting}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 rounded-lg px-4 py-2 text-sm font-medium"
            style={{
              background: 'var(--ct-primary)',
              color: '#ffffff',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.6 : 1,
            }}
            disabled={isSubmitting}
          >
            {isSubmitting ? '저장 중...' : isEdit ? '수정' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
