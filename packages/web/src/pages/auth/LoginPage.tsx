// 로그인 페이지 — CowTalk 2-panel 레이아웃 (좌: 로그인폼, 우: 히어로)
// 히어로 섹션 수치는 /api/public/stats에서 실시간 조회
// 역할 카드 클릭 → 비밀번호 없이 즉시 로그인 (quick-login)

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@web/hooks/useAuth';
import axios from 'axios';

// ── 모바일 감지 훅 ──

function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

// ── 공개 통계 타입 ──

interface PublicStats {
  readonly totalFarms: number;
  readonly totalCattle: number;
  readonly totalSensors: number;
  readonly detectionAccuracy: string;
  readonly aiEngines: number;
  readonly monitoring: string;
  readonly todayAlerts: number;
}

// ── 역할별 프리셋 ──

interface RolePreset {
  readonly email: string;
  readonly name: string;
  readonly title: string;
  readonly badge: string;
  readonly access: string;
  readonly scope: 'all' | 'partial' | 'single';
}

const ROLE_PRESETS: readonly RolePreset[] = [
  {
    email: 'ha@d2o.kr',
    name: 'Ha Hyun-Jae, DVM',
    title: 'MASTER ADMIN',
    badge: '#16a34a',
    access: 'full access',
    scope: 'all',
  },
  {
    email: 'vet@test.kr',
    name: '고려동물병원',
    title: 'VETERINARIAN',
    badge: '#2563eb',
    access: 'clinical access',
    scope: 'all',
  },
  {
    email: 'farmer@test.kr',
    name: '김농장주',
    title: 'FARMER',
    badge: '#ca8a04',
    access: 'farm management',
    scope: 'all',
  },
  {
    email: 'inseminator@test.kr',
    name: '이수정사',
    title: 'INSEMINATOR',
    badge: '#db2777',
    access: 'breeding access',
    scope: 'all',
  },
  {
    email: 'admin@gyeonggi.kr',
    name: '최경기행정',
    title: 'GOVERNMENT',
    badge: '#7c3aed',
    access: 'full access',
    scope: 'all',
  },
  {
    email: 'quarantine@test.kr',
    name: '정방역관',
    title: 'QUARANTINE',
    badge: '#dc2626',
    access: 'surveillance',
    scope: 'all',
  },
  {
    email: 'feed@test.kr',
    name: '한사료',
    title: 'FEED COMPANY',
    badge: '#ea580c',
    access: 'nutrition access',
    scope: 'all',
  },
];

// ── 피처 카드 ──

interface FeatureCard {
  readonly title: string;
  readonly description: string;
}

// 히어로 하단 역할 뱃지 — 클릭 시 quick login
const ROLE_BADGES: readonly { readonly label: string; readonly email: string }[] = [
  { label: '수의사', email: 'vet@test.kr' },
  { label: '수정사', email: 'inseminator@test.kr' },
  { label: '목장주', email: 'farmer@test.kr' },
  { label: '행정관', email: 'admin@gyeonggi.kr' },
  { label: '방역관', email: 'quarantine@test.kr' },
  { label: '사료회사', email: 'feed@test.kr' },
];

// ── 메인 컴포넌트 ──

export default function LoginPage(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [quickLoggingEmail, setQuickLoggingEmail] = useState<string | null>(null);
  const { login, quickLogin, isLoggingIn, loginError, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // 실제 통계 조회
  useEffect(() => {
    axios.get<{ success: boolean; data: PublicStats }>('/api/public/stats')
      .then((res) => { setStats(res.data.data); })
      .catch(() => {
        setStats({
          totalFarms: 146,
          totalCattle: 7124,
          totalSensors: 6800,
          detectionAccuracy: '95%+',
          aiEngines: 6,
          monitoring: '24/7',
          todayAlerts: 0,
        });
      });
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // 역할 카드 클릭 → 즉시 로그인
  async function handleQuickLogin(preset: RolePreset): Promise<void> {
    setQuickLoggingEmail(preset.email);
    try {
      await quickLogin({ email: preset.email });
      navigate('/', { replace: true });
    } catch {
      // 에러 시 폼으로 fallback
      setEmail(preset.email);
      setQuickLoggingEmail(null);
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await login({ email, password });
      navigate('/', { replace: true });
    } catch {
      // loginError 상태에서 처리
    }
  }

  function handleDemoClick(): void {
    navigate('/demo');
  }

  // 히어로 수치
  const heroFarms = stats?.totalFarms?.toLocaleString() ?? '...';
  const heroCattle = stats?.totalCattle?.toLocaleString() ?? '...';
  const heroMonitoring = stats?.monitoring ?? '24/7';
  const heroDetection = stats?.detectionAccuracy ?? '95%+';
  const heroEngines = String(stats?.aiEngines ?? 6);

  const features: readonly FeatureCard[] = [
    {
      title: '위내센서 인텔리전스',
      description: '체온 0.01°C 정밀도, 반추, 활동, 음수, pH — 24시간 실시간 모니터링',
    },
    {
      title: '국가 공공데이터 융합',
      description: '이력추적, DHI 검정, 혈통, 유전체, 방역, 기상 — 완전 통합',
    },
    {
      title: '역할별 AI 액션플랜',
      description: '수의사 / 수정사 / 목장주 / 행정관 / 방역관 / 사료회사 — 각자 필요한 정보',
    },
    {
      title: '지역 방역 인텔리전스',
      description: '다농장 클러스터, 조기경보, 역학 감시, 정책 대시보드',
    },
    {
      title: '번식 + 유전체',
      description: '혈통, 근교계수, 유전체 육종가, 정액 추천, 교배 계획',
    },
    {
      title: `농장 성과 벤치마크`,
      description: `생산성 분석, ROI 계산기, 농장 리포트 카드, ${heroFarms}개 농장 비교`,
    },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      minHeight: '100vh',
      overflow: 'hidden',
    }}>
      {/* ── Mobile: 상단 히어로 요약 ── */}
      {isMobile && (
        <div
          style={{
            background: 'linear-gradient(160deg, #0f4c3a 0%, #1a6b4f 50%, #2a8f6a 100%)',
            padding: '32px 20px 24px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: 32, fontWeight: 700, color: '#fff', margin: 0 }}>
            Cow<span style={{ color: '#86efac' }}>Talk</span>
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', margin: '4px 0 16px' }}>
            Cows speak through data. We translate it into action.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <StatItem value={heroFarms} label="Farms" />
            <StatItem value={heroCattle} label="Cattle" />
            <StatItem value={heroMonitoring} label="24/7" />
            <StatItem value={heroDetection} label="Detection" />
          </div>
        </div>
      )}

      {/* ── Left Panel: Login Form ── */}
      <div
        style={{
          flex: isMobile ? '1' : '0 0 460px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: isMobile ? 'flex-start' : 'center',
          padding: isMobile ? '24px 20px' : '40px 36px',
          background: '#ffffff',
          overflowY: 'auto',
          width: isMobile ? '100%' : undefined,
          maxWidth: isMobile ? '100%' : undefined,
          boxSizing: 'border-box',
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>
            Cow<span style={{ color: '#16a34a' }}>Talk</span>
          </h1>
          <p style={{ fontSize: 14, color: '#666', margin: '4px 0 0' }}>
            AI livestock digital operating system
          </p>
          <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>
            D2O Corp. | Agricultural corporation
          </p>
        </div>

        {/* ── Login form ── */}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label
                htmlFor="email"
                style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-required="true"
                autoComplete="email"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#1a1a1a',
                  background: '#ffffff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#16a34a'; }}
                onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label
                htmlFor="password"
                style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-required="true"
                autoComplete="current-password"
                minLength={8}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#1a1a1a',
                  background: '#ffffff',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#16a34a'; }}
                onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; }}
              />
            </div>
          </div>

          {loginError && (
            <p style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>
              Login failed. Please check your email and password.
            </p>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              color: '#1a1a1a',
              background: '#ffffff',
              cursor: isLoggingIn ? 'wait' : 'pointer',
              opacity: isLoggingIn ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!isLoggingIn) {
                e.currentTarget.style.background = '#16a34a';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.borderColor = '#16a34a';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.color = '#1a1a1a';
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          >
            {isLoggingIn ? '로그인 중...' : '로그인'}
          </button>
        </form>

        {/* Demo + Footer */}
        <button
          type="button"
          onClick={handleDemoClick}
          style={{
            display: 'block',
            width: '100%',
            marginTop: 16,
            fontSize: 12,
            color: '#16a34a',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          데모 모드 &mdash; 로그인 없이 둘러보기
        </button>
        <button
          type="button"
          onClick={() => navigate('/onboarding')}
          style={{
            width: '100%',
            padding: '10px',
            fontSize: 13,
            color: 'var(--ct-primary)',
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: 10,
            cursor: 'pointer',
            marginTop: 4,
            fontWeight: 600,
          }}
        >
          🐄 CowTalk 시작하기 — 3분 무료 가입
        </button>
        {/* 모바일: 역할 선택 버튼 */}
        {isMobile && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 11, color: '#999', textAlign: 'center', marginBottom: 8 }}>
              역할을 선택하여 바로 입장
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {ROLE_BADGES.map((role) => {
                const isLoading = quickLoggingEmail === role.email;
                return (
                  <button
                    key={role.email}
                    type="button"
                    disabled={isLoggingIn}
                    onClick={() => { handleQuickLogin({ ...ROLE_PRESETS.find((p) => p.email === role.email)!, email: role.email }); }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 16,
                      background: isLoading ? '#16a34a' : '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      fontSize: 12,
                      fontWeight: 600,
                      color: isLoading ? '#fff' : '#16a34a',
                      cursor: isLoggingIn ? 'wait' : 'pointer',
                    }}
                  >
                    {isLoading ? '입장 중...' : role.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p style={{ fontSize: 11, color: '#ccc', textAlign: 'center', marginTop: 16 }}>
          CowTalk v5.0 | D2O Corp. | Powered by AI
        </p>
      </div>

      {/* ── Right Panel: Hero Showcase (데스크톱 전용) ── */}
      {!isMobile && <div
        style={{
          flex: 1,
          background: 'linear-gradient(160deg, #0f4c3a 0%, #1a6b4f 30%, #1e7a5a 60%, #2a8f6a 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '48px 60px',
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {/* Top badge */}
        <span
          style={{
            display: 'inline-block',
            padding: '6px 16px',
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.3)',
            fontSize: 11,
            fontWeight: 600,
            color: '#ffffff',
            letterSpacing: 1.5,
            marginBottom: 20,
          }}
        >
          AI-POWERED LIVESTOCK INTELLIGENCE PLATFORM
        </span>

        {/* Title */}
        <h2
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: '#ffffff',
            margin: '0 0 8px',
            textAlign: 'center',
          }}
        >
          Cow<span style={{ color: '#86efac' }}>Talk</span>
        </h2>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.85)', textAlign: 'center', margin: 0 }}>
          Cows speak through data.
        </p>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.85)', textAlign: 'center', margin: '2px 0 0' }}>
          We translate it into action.
        </p>

        {/* Stats bar — 실제 DB 데이터 */}
        <div
          style={{
            display: 'flex',
            gap: 32,
            marginTop: 32,
            marginBottom: 36,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <StatItem value={heroFarms} label="Farms" />
          <StatItem value={heroCattle} label="Cattle" />
          <StatItem value={heroMonitoring} label="Monitoring" />
          <StatItem value={heroDetection} label="Detection" />
          <StatItem value={heroEngines} label="AI engines" />
        </div>

        {/* Feature cards grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 14,
            width: '100%',
            maxWidth: 640,
          }}
        >
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(8px)',
                borderRadius: 12,
                padding: '18px 20px',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', margin: '0 0 6px' }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.5 }}>
                {f.description}
              </p>
            </div>
          ))}
        </div>

        {/* Role badges — 클릭 시 즉시 로그인 */}
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 28, marginBottom: 10, textAlign: 'center' }}>
          역할을 선택하여 바로 입장
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {ROLE_BADGES.map((role) => {
            const isLoading = quickLoggingEmail === role.email;
            return (
              <button
                key={role.email}
                type="button"
                disabled={isLoggingIn}
                onClick={() => { handleQuickLogin({ ...ROLE_PRESETS.find((p) => p.email === role.email)!, email: role.email }); }}
                style={{
                  padding: '8px 18px',
                  borderRadius: 20,
                  background: isLoading ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(4px)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#ffffff',
                  cursor: isLoggingIn ? 'wait' : 'pointer',
                  transition: 'all 0.15s',
                  opacity: (isLoggingIn && !isLoading) ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isLoggingIn) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isLoading ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {isLoading ? '입장 중...' : role.label}
              </button>
            );
          })}
        </div>

        {/* Bottom footer */}
        <p
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
            marginTop: 32,
            textAlign: 'center',
          }}
        >
          D2O Corp. &mdash; Dairy + Beef | Korea + Global&nbsp;&nbsp;&nbsp;&nbsp;Powered by CowTalk AI
        </p>
      </div>}
    </div>
  );
}

// ── Stats item ──

function StatItem({
  value,
  label,
}: {
  readonly value: string;
  readonly label: string;
}): React.JSX.Element {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 32, fontWeight: 700, color: '#86efac', margin: 0 }}>{value}</p>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', margin: '2px 0 0' }}>{label}</p>
    </div>
  );
}
