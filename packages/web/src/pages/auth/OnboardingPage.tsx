// 농장주 온보딩 위자드 — 3분 안에 CowTalk 시작
// 역할 선택 → 계정 정보 → 농장 정보 → 완료

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { apiPost } from '@web/api/client';
import { useAuthStore } from '@web/stores/auth.store';
import type { Role } from '@cowtalk/shared';

// ===========================
// 타입
// ===========================

interface OnboardingData {
  role: Role | '';
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
  farmName: string;
  farmAddress: string;
  farmPhone: string;
  farmCapacity: string;
}

interface OnboardingResult {
  accessToken: string;
  refreshToken: string;
  user: { userId: string; name: string; email: string; role: Role };
  farmId: string | null;
}

// ===========================
// 역할 메타
// ===========================

interface RoleMeta {
  readonly role: Role;
  readonly icon: string;
  readonly label: string;
  readonly description: string;
  readonly needsFarm: boolean;
}

const ROLE_LIST: readonly RoleMeta[] = [
  { role: 'farmer',            icon: '🐄', label: '농장주',   description: '내 목장 개체 모니터링·번식·질병 관리', needsFarm: true },
  { role: 'veterinarian',      icon: '🩺', label: '수의사',   description: '담당 목장 건강 관리·진단 보조',          needsFarm: false },
  { role: 'quarantine_officer',icon: '🛡️', label: '방역관',   description: '지역·전국 단위 방역 모니터링',            needsFarm: false },
  { role: 'government_admin',  icon: '🏛️', label: '정부',    description: '수급 조절·축산 행정 디지털 전환',         needsFarm: false },
];

// ===========================
// 유효성 검사
// ===========================

interface Errors { [key: string]: string }

function validateStep2(data: OnboardingData): Errors {
  const e: Errors = {};
  if (data.name.trim().length < 2) e.name = '이름 2자 이상 입력';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = '이메일 형식 확인';
  if (data.password.length < 8) e.password = '비밀번호 8자 이상';
  if (data.password !== data.passwordConfirm) e.passwordConfirm = '비밀번호가 일치하지 않습니다';
  return e;
}

function validateStep3(data: OnboardingData): Errors {
  const e: Errors = {};
  if (data.farmName.trim().length < 2) e.farmName = '목장명 2자 이상 입력';
  return e;
}

// ===========================
// 진행 표시 바
// ===========================

function ProgressBar({ step, total }: { step: number; total: number }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <React.Fragment key={i}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all"
            style={{
              background: i < step ? 'var(--ct-primary)' : i === step ? 'rgba(59,130,246,0.15)' : 'var(--ct-border)',
              color: i < step ? '#fff' : i === step ? 'var(--ct-primary)' : 'var(--ct-text-secondary)',
              border: i === step ? '2px solid var(--ct-primary)' : '2px solid transparent',
            }}
          >
            {i < step ? '✓' : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className="flex-1 h-0.5 rounded"
              style={{ background: i < step ? 'var(--ct-primary)' : 'var(--ct-border)' }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ===========================
// 입력 필드
// ===========================

interface FieldProps {
  readonly label: string;
  readonly type?: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly error?: string;
  readonly placeholder?: string;
  readonly autoComplete?: string;
  readonly required?: boolean;
}

function Field({ label, type = 'text', value, onChange, error, placeholder, autoComplete, required }: FieldProps): React.JSX.Element {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium" style={{ color: 'var(--ct-text)' }}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-required={required}
        className="w-full rounded-xl border px-4 py-3 text-sm transition-colors focus:outline-none focus:ring-2"
        style={{
          background: 'var(--ct-bg)',
          borderColor: error ? '#dc2626' : 'var(--ct-border)',
          color: 'var(--ct-text)',
        }}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ===========================
// 메인 온보딩 페이지
// ===========================

const TOTAL_STEPS = 4;

const INITIAL: OnboardingData = {
  role: '', name: '', email: '', password: '', passwordConfirm: '',
  farmName: '', farmAddress: '', farmPhone: '', farmCapacity: '',
};

export default function OnboardingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const loginStore = useAuthStore((s) => s.login);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(INITIAL);
  const [errors, setErrors] = useState<Errors>({});

  const set = (key: keyof OnboardingData) => (value: string) => {
    setData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  const selectedRole = ROLE_LIST.find((r) => r.role === data.role);
  const needsFarm = selectedRole?.needsFarm ?? false;

  const mutation = useMutation({
    mutationFn: () => apiPost<{ data: OnboardingResult }>('/auth/onboarding', {
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role,
      ...(needsFarm && data.farmName ? {
        farm: {
          name: data.farmName,
          address: data.farmAddress || undefined,
          ownerName: data.name,
          phone: data.farmPhone || undefined,
          capacity: data.farmCapacity ? parseInt(data.farmCapacity, 10) : undefined,
        },
      } : {}),
    }),
    onSuccess: (res) => {
      const { accessToken, refreshToken, user, farmId: createdFarmId } = res.data;
      loginStore(
        {
          userId: user.userId,
          name: user.name,
          email: user.email,
          role: user.role,
          farmIds: createdFarmId ? [createdFarmId] : [],
          tenantId: null,
          tenantName: null,
        },
        accessToken,
        refreshToken,
      );
      setStep(TOTAL_STEPS - 1); // 완료 화면
    },
  });

  // ── Step 0: 역할 선택
  if (step === 0) {
    return (
      <OnboardingShell title="어떤 역할로 시작하시나요?" subtitle="역할에 맞는 대시보드와 기능이 자동으로 설정됩니다">
        <ProgressBar step={0} total={TOTAL_STEPS} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ROLE_LIST.map((r) => (
            <button
              key={r.role}
              type="button"
              onClick={() => { set('role')(r.role); setStep(1); }}
              className="flex flex-col items-center gap-2 rounded-xl p-4 text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: data.role === r.role ? 'rgba(59,130,246,0.08)' : 'var(--ct-surface)',
                border: data.role === r.role ? '2px solid var(--ct-primary)' : '1px solid var(--ct-border)',
              }}
            >
              <span className="text-3xl">{r.icon}</span>
              <p className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>{r.label}</p>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--ct-text-secondary)' }}>{r.description}</p>
            </button>
          ))}
        </div>
        <p className="text-center text-xs mt-4" style={{ color: 'var(--ct-text-secondary)' }}>
          이미 계정이 있으신가요?{' '}
          <button type="button" onClick={() => navigate('/login')} className="font-semibold" style={{ color: 'var(--ct-primary)' }}>
            로그인
          </button>
        </p>
      </OnboardingShell>
    );
  }

  // ── Step 1: 계정 정보
  if (step === 1) {
    const handleNext = (): void => {
      const e = validateStep2(data);
      if (Object.keys(e).length > 0) { setErrors(e); return; }
      setStep(needsFarm ? 2 : 3);
      mutation.reset();
    };

    return (
      <OnboardingShell
        title="계정 정보를 입력하세요"
        subtitle={`${selectedRole?.icon} ${selectedRole?.label}로 가입합니다`}
      >
        <ProgressBar step={1} total={TOTAL_STEPS} />
        <div className="space-y-4">
          <Field label="이름" value={data.name} onChange={set('name')} error={errors.name} placeholder="홍길동" autoComplete="name" required />
          <Field label="이메일" type="email" value={data.email} onChange={set('email')} error={errors.email} placeholder="farm@example.com" autoComplete="email" required />
          <Field label="비밀번호" type="password" value={data.password} onChange={set('password')} error={errors.password} placeholder="8자 이상" autoComplete="new-password" required />
          <Field label="비밀번호 확인" type="password" value={data.passwordConfirm} onChange={set('passwordConfirm')} error={errors.passwordConfirm} placeholder="비밀번호 재입력" autoComplete="new-password" required />
        </div>
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={() => setStep(0)} className="flex-1 rounded-xl py-3 text-sm font-medium" style={{ background: 'var(--ct-surface)', color: 'var(--ct-text)', border: '1px solid var(--ct-border)' }}>
            ← 이전
          </button>
          <button type="button" onClick={handleNext} className="flex-1 rounded-xl py-3 text-sm font-semibold text-white" style={{ background: 'var(--ct-primary)' }}>
            다음 →
          </button>
        </div>
      </OnboardingShell>
    );
  }

  // ── Step 2: 농장 정보 (farmer 역할만)
  if (step === 2) {
    const handleNext = (): void => {
      const e = validateStep3(data);
      if (Object.keys(e).length > 0) { setErrors(e); return; }
      mutation.mutate();
    };

    return (
      <OnboardingShell title="목장 정보를 입력하세요" subtitle="나중에 설정에서 수정할 수 있습니다">
        <ProgressBar step={2} total={TOTAL_STEPS} />
        <div className="space-y-4">
          <Field label="목장명" value={data.farmName} onChange={set('farmName')} error={errors.farmName} placeholder="예: 해돋이목장" required />
          <Field label="주소" value={data.farmAddress} onChange={set('farmAddress')} placeholder="경기도 포천시 ..." />
          <Field label="전화번호" type="tel" value={data.farmPhone} onChange={set('farmPhone')} placeholder="010-0000-0000" autoComplete="tel" />
          <Field label="사육두수 (마리)" type="number" value={data.farmCapacity} onChange={set('farmCapacity')} placeholder="예: 87" />
        </div>
        {mutation.isError && (
          <div className="mt-3 rounded-xl p-3 text-xs text-red-600" style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
            {mutation.error instanceof Error ? mutation.error.message : '가입 중 오류가 발생했습니다. 다시 시도해주세요.'}
          </div>
        )}
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={() => setStep(1)} className="flex-1 rounded-xl py-3 text-sm font-medium" style={{ background: 'var(--ct-surface)', color: 'var(--ct-text)', border: '1px solid var(--ct-border)' }}>
            ← 이전
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={mutation.isPending}
            className="flex-1 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--ct-primary)' }}
          >
            {mutation.isPending ? '가입 중...' : '시작하기 🚀'}
          </button>
        </div>
      </OnboardingShell>
    );
  }

  // ── Step 3 (비농장주 역할): 계정만 생성 후 바로 완료
  if (step === 3 && !mutation.isSuccess && !mutation.isPending) {
    mutation.mutate();
  }

  // ── 완료 화면
  return (
    <OnboardingShell title="" subtitle="">
      <div className="flex flex-col items-center text-center gap-5 py-4">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl" style={{ background: 'rgba(22,163,74,0.1)' }}>
          🎉
        </div>
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--ct-text)' }}>CowTalk 시작!</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ct-text-secondary)' }}>
            {data.name}님, 환영합니다. 계정이 생성됐습니다.
          </p>
        </div>

        {/* smaXtec 연동 안내 */}
        <div
          className="rounded-xl p-4 text-left w-full"
          style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}
        >
          <p className="text-sm font-bold mb-1" style={{ color: '#2563eb' }}>📡 smaXtec 센서 연동</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--ct-text-secondary)' }}>
            이미 smaXtec 위내센서를 사용 중이시면, <strong>D2O 담당자</strong>에게 연락해 주세요.
            목장 데이터가 즉시 CowTalk에 연동됩니다.
          </p>
          <p className="text-xs mt-2 font-semibold" style={{ color: '#2563eb' }}>📞 D2O Corp. — 1588-XXXX</p>
        </div>

        {/* 다음 단계 */}
        <div className="w-full space-y-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white"
            style={{ background: 'var(--ct-primary)' }}
          >
            대시보드 바로가기 →
          </button>
          {needsFarm && (
            <button
              type="button"
              onClick={() => navigate('/breeding')}
              className="w-full rounded-xl py-3 text-sm font-medium"
              style={{ background: 'var(--ct-surface)', color: 'var(--ct-text)', border: '1px solid var(--ct-border)' }}
            >
              번식 커맨드센터 보기
            </button>
          )}
        </div>
      </div>
    </OnboardingShell>
  );
}

// ===========================
// 레이아웃 래퍼
// ===========================

function OnboardingShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--ct-bg)' }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 sm:p-8 shadow-xl"
        style={{ background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
      >
        {/* 로고 */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl">🐄</span>
          <span className="text-lg font-bold" style={{ color: 'var(--ct-primary)' }}>CowTalk</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(59,130,246,0.1)', color: '#2563eb' }}>v5.0</span>
        </div>

        {title && (
          <div className="mb-6">
            <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>{title}</h1>
            {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--ct-text-secondary)' }}>{subtitle}</p>}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
