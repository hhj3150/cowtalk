// 로그인 페이지 — CowTalk 2-panel 레이아웃 (좌: 로그인폼, 우: 히어로)
// 히어로 섹션 수치는 /api/public/stats에서 실시간 조회
// 역할 카드 클릭 → 비밀번호 없이 즉시 로그인 (quick-login)
// 4언어 지원: 한국어/영어/러시아어/우즈벡어 (5/13 중앙아시아 시연 대응)

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

// ── i18n 번역 리소스 (로그인 첫 화면 전용) ──

type Lang = 'ko' | 'en' | 'ru' | 'uz';

interface Strings {
  readonly tagline: string;
  readonly corporation: string;
  readonly email: string;
  readonly password: string;
  readonly login: string;
  readonly loggingIn: string;
  readonly loginFailed: string;
  readonly demoMode: string;
  readonly signupCta: string;
  readonly rolePrompt: string;
  readonly entering: string;
  readonly heroBadge: string;
  readonly heroLine1: string;
  readonly heroLine2: string;
  readonly statFarms: string;
  readonly statCattle: string;
  readonly statMonitoring: string;
  readonly statDetection: string;
  readonly statEngines: string;
  readonly roleVet: string;
  readonly roleFarmer: string;
  readonly roleAdmin: string;
  readonly roleQuarantine: string;
  readonly feature1Title: string;
  readonly feature1Desc: string;
  readonly feature2Title: string;
  readonly feature2Desc: string;
  readonly feature3Title: string;
  readonly feature3Desc: string;
  readonly feature4Title: string;
  readonly feature4Desc: string;
  readonly feature5Title: string;
  readonly feature5Desc: string;
  readonly feature6Title: string;
  readonly feature6DescTemplate: string; // {farms} placeholder
  readonly footer: string;
  readonly footerHero: string;
}

const I18N: Readonly<Record<Lang, Strings>> = {
  ko: {
    tagline: '축산 AX 플랫폼 — 데이터에서 행동까지, AI가 연결합니다',
    corporation: 'D2O Corp. | 농업회사법인',
    email: '이메일',
    password: '비밀번호',
    login: '로그인',
    loggingIn: '로그인 중...',
    loginFailed: '로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.',
    demoMode: '데모 모드 — 로그인 없이 둘러보기',
    signupCta: '🐄 CowTalk 시작하기 — 3분 무료 가입',
    rolePrompt: '역할을 선택하여 바로 입장',
    entering: '입장 중...',
    heroBadge: 'LIVESTOCK AX PLATFORM — AI TRANSFORMATION',
    heroLine1: '소가 데이터로 말합니다.',
    heroLine2: 'CowTalk이 행동으로 바꿉니다.',
    statFarms: '농장',
    statCattle: '소',
    statMonitoring: '24/7',
    statDetection: '감지 정확도',
    statEngines: 'AI 엔진',
    roleVet: '수의사',
    roleFarmer: '목장주',
    roleAdmin: '행정관',
    roleQuarantine: '방역관',
    feature1Title: '위내센서 인텔리전스',
    feature1Desc: '체온 0.01°C 정밀도, 반추, 활동, 음수, pH — 24시간 실시간 모니터링',
    feature2Title: '국가 공공데이터 융합',
    feature2Desc: '이력추적, DHI 검정, 혈통, 유전체, 방역, 기상 — 완전 통합',
    feature3Title: '역할별 AI 액션플랜',
    feature3Desc: '목장주 / 수의사 / 행정관 / 방역관 — 각자 필요한 정보',
    feature4Title: '지역 방역 인텔리전스',
    feature4Desc: '다농장 클러스터, 조기경보, 역학 감시, 정책 대시보드',
    feature5Title: '번식 + 유전체',
    feature5Desc: '혈통, 근교계수, 유전체 육종가, 정액 추천, 교배 계획',
    feature6Title: '농장 성과 벤치마크',
    feature6DescTemplate: '생산성 분석, ROI 계산기, 농장 리포트 카드, {farms}개 농장 비교',
    footer: 'CowTalk v5.0 | D2O Corp. | Powered by AI',
    footerHero: 'D2O Corp. — Dairy + Beef | Korea + Global    Powered by CowTalk AI',
  },
  en: {
    tagline: 'Livestock AX Platform — From data to action, powered by AI',
    corporation: 'D2O Corp. | Agricultural corporation',
    email: 'Email',
    password: 'Password',
    login: 'Sign in',
    loggingIn: 'Signing in...',
    loginFailed: 'Login failed. Please check your email and password.',
    demoMode: 'Demo mode — browse without logging in',
    signupCta: '🐄 Start CowTalk — Free 3-minute signup',
    rolePrompt: 'Choose a role to enter instantly',
    entering: 'Entering...',
    heroBadge: 'LIVESTOCK AX PLATFORM — AI TRANSFORMATION',
    heroLine1: 'Cows speak through data.',
    heroLine2: 'CowTalk turns it into action.',
    statFarms: 'Farms',
    statCattle: 'Cattle',
    statMonitoring: 'Monitoring',
    statDetection: 'Detection',
    statEngines: 'AI engines',
    roleVet: 'Veterinarian',
    roleFarmer: 'Farmer',
    roleAdmin: 'Government',
    roleQuarantine: 'Quarantine',
    feature1Title: 'Rumen Sensor Intelligence',
    feature1Desc: 'Body temp 0.01°C precision, rumination, activity, water, pH — 24/7 real-time monitoring',
    feature2Title: 'National Public Data Fusion',
    feature2Desc: 'Traceability, DHI, pedigree, genomics, quarantine, weather — fully integrated',
    feature3Title: 'Role-based AI Action Plans',
    feature3Desc: 'Farmer / Vet / Government / Quarantine — each gets what they need',
    feature4Title: 'Regional Disease Intelligence',
    feature4Desc: 'Multi-farm clusters, early warning, epidemiological surveillance, policy dashboards',
    feature5Title: 'Breeding + Genomics',
    feature5Desc: 'Pedigree, inbreeding coefficient, genomic EBV, semen recommendation, mating plans',
    feature6Title: 'Farm Performance Benchmark',
    feature6DescTemplate: 'Productivity analysis, ROI calculator, farm report cards, {farms} farms compared',
    footer: 'CowTalk v5.0 | D2O Corp. | Powered by AI',
    footerHero: 'D2O Corp. — Dairy + Beef | Korea + Global    Powered by CowTalk AI',
  },
  ru: {
    tagline: 'AX-платформа для животноводства — от данных к действиям через ИИ',
    corporation: 'D2O Corp. | Сельскохозяйственная корпорация',
    email: 'Эл. почта',
    password: 'Пароль',
    login: 'Войти',
    loggingIn: 'Вход...',
    loginFailed: 'Ошибка входа. Проверьте эл. почту и пароль.',
    demoMode: 'Демо-режим — просмотр без входа',
    signupCta: '🐄 Начать CowTalk — Бесплатная регистрация за 3 минуты',
    rolePrompt: 'Выберите роль для быстрого входа',
    entering: 'Вход...',
    heroBadge: 'AX-ПЛАТФОРМА — ИИ-ТРАНСФОРМАЦИЯ ЖИВОТНОВОДСТВА',
    heroLine1: 'Коровы говорят с помощью данных.',
    heroLine2: 'CowTalk превращает их в действия.',
    statFarms: 'Ферм',
    statCattle: 'Коров',
    statMonitoring: 'Мониторинг',
    statDetection: 'Точность',
    statEngines: 'ИИ-модулей',
    roleVet: 'Ветеринар',
    roleFarmer: 'Фермер',
    roleAdmin: 'Администратор',
    roleQuarantine: 'Карантин',
    feature1Title: 'Интеллект внутрижелудочных датчиков',
    feature1Desc: 'Температура 0.01°C, жвачка, активность, водопой, pH — мониторинг 24/7',
    feature2Title: 'Интеграция государственных данных',
    feature2Desc: 'Прослеживаемость, DHI, родословная, геномика, карантин, погода — единая платформа',
    feature3Title: 'ИИ-планы действий по ролям',
    feature3Desc: 'Фермер / Ветеринар / Администратор / Карантин — каждому своё',
    feature4Title: 'Региональная эпидемиологическая разведка',
    feature4Desc: 'Кластеры ферм, раннее предупреждение, эпиднадзор, управленческие дашборды',
    feature5Title: 'Воспроизводство + Геномика',
    feature5Desc: 'Родословная, инбридинг, геномные оценки, подбор семени, планы скрещивания',
    feature6Title: 'Эталон производительности ферм',
    feature6DescTemplate: 'Анализ продуктивности, калькулятор ROI, отчёты ферм, сравнение {farms} хозяйств',
    footer: 'CowTalk v5.0 | D2O Corp. | Работает на ИИ',
    footerHero: 'D2O Corp. — Молочное + Мясное | Корея + Мир    Работает на CowTalk AI',
  },
  uz: {
    tagline: 'Chorvachilik AX platformasi — Ma\'lumotdan harakatga, SI kuchi bilan',
    corporation: 'D2O Corp. | Qishloq xo\'jaligi korporatsiyasi',
    email: 'Elektron pochta',
    password: 'Parol',
    login: 'Kirish',
    loggingIn: 'Kirmoqda...',
    loginFailed: 'Kirish muvaffaqiyatsiz. Elektron pochta va parolingizni tekshiring.',
    demoMode: 'Demo rejim — kirmasdan ko\'rib chiqish',
    signupCta: '🐄 CowTalk\'ni boshlash — 3 daqiqada bepul ro\'yxatdan o\'tish',
    rolePrompt: 'Tezkor kirish uchun rolni tanlang',
    entering: 'Kirmoqda...',
    heroBadge: 'CHORVACHILIK AX PLATFORMASI — SI TRANSFORMATSIYASI',
    heroLine1: 'Qoramol ma\'lumotlar orqali gapiradi.',
    heroLine2: 'CowTalk ularni harakatga aylantiradi.',
    statFarms: 'Ferma',
    statCattle: 'Qoramol',
    statMonitoring: 'Monitoring',
    statDetection: 'Aniqlik',
    statEngines: 'AI dvigatel',
    roleVet: 'Veterinar',
    roleFarmer: 'Fermer',
    roleAdmin: 'Ma\'mur',
    roleQuarantine: 'Karantin',
    feature1Title: 'Oshqozon ichi sensor intellekti',
    feature1Desc: 'Tana harorati 0.01°C aniqlik, kavshash, faollik, suv, pH — 24/7 real vaqt monitoringi',
    feature2Title: 'Milliy ochiq ma\'lumotlar integratsiyasi',
    feature2Desc: 'Hisob, DHI, nasl, genomika, karantin, ob-havo — to\'liq integratsiya',
    feature3Title: 'Rolga asoslangan AI harakat rejalari',
    feature3Desc: 'Fermer / Veterinar / Ma\'mur / Karantin — har biri uchun kerakli ma\'lumot',
    feature4Title: 'Hududiy karantin razvedkasi',
    feature4Desc: 'Ko\'p fermali klasterlar, erta ogohlantirish, epidemiologik nazorat, siyosat panellari',
    feature5Title: 'Ko\'paytirish + Genomika',
    feature5Desc: 'Nasl, qarindosh koeffitsiyenti, genomik baholash, sperma tavsiyasi, juftlash rejalari',
    feature6Title: 'Ferma samaradorligi benchmark',
    feature6DescTemplate: 'Samaradorlik tahlili, ROI kalkulyatori, ferma hisobotlari, {farms} fermani taqqoslash',
    footer: 'CowTalk v5.0 | D2O Corp. | AI asosida ishlaydi',
    footerHero: 'D2O Corp. — Sut + Go\'sht | Koreya + Global    CowTalk AI asosida ishlaydi',
  },
};

const LANG_OPTIONS: readonly { readonly code: Lang; readonly label: string }[] = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'uz', label: 'O\'zbekcha' },
];

const LANG_STORAGE_KEY = 'cowtalk-login-lang';

function detectInitialLang(): Lang {
  if (typeof window === 'undefined') return 'ko';
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  if (saved === 'ko' || saved === 'en' || saved === 'ru' || saved === 'uz') return saved;
  const browserLang = navigator.language?.toLowerCase() ?? '';
  if (browserLang.startsWith('ko')) return 'ko';
  if (browserLang.startsWith('ru')) return 'ru';
  if (browserLang.startsWith('uz')) return 'uz';
  return 'en';
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
];

// ── 피처 카드 ──

interface FeatureCard {
  readonly title: string;
  readonly description: string;
}

// ── 메인 컴포넌트 ──

export default function LoginPage(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [quickLoggingEmail, setQuickLoggingEmail] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(detectInitialLang);
  const { login, quickLogin, isLoggingIn, loginError, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const t = I18N[lang];

  // 역할별 라벨 (언어 변환)
  const roleBadges: readonly { readonly label: string; readonly email: string }[] = [
    { label: t.roleVet, email: 'vet@test.kr' },
    { label: t.roleFarmer, email: 'farmer@test.kr' },
    { label: t.roleAdmin, email: 'admin@gyeonggi.kr' },
    { label: t.roleQuarantine, email: 'quarantine@test.kr' },
  ];

  // 언어 전환 + 저장
  function handleLangChange(next: Lang): void {
    setLang(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // storage 비활성화 환경 무시
    }
  }

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
    { title: t.feature1Title, description: t.feature1Desc },
    { title: t.feature2Title, description: t.feature2Desc },
    { title: t.feature3Title, description: t.feature3Desc },
    { title: t.feature4Title, description: t.feature4Desc },
    { title: t.feature5Title, description: t.feature5Desc },
    {
      title: t.feature6Title,
      description: t.feature6DescTemplate.replace('{farms}', heroFarms),
    },
  ];

  // ── 언어 스위처 ──
  const LangSwitcher = (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        padding: '4px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        backdropFilter: 'blur(4px)',
      }}
    >
      {LANG_OPTIONS.map((opt) => {
        const active = opt.code === lang;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => handleLangChange(opt.code)}
            aria-pressed={active}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              border: 'none',
              background: active ? '#ffffff' : 'transparent',
              color: active ? '#166534' : 'rgba(255,255,255,0.85)',
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  // 모바일/폼 쪽 스위처 (연한 배경)
  const LangSwitcherLight = (
    <div
      role="group"
      aria-label="Language"
      style={{
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        padding: '4px',
        borderRadius: 999,
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
      }}
    >
      {LANG_OPTIONS.map((opt) => {
        const active = opt.code === lang;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => handleLangChange(opt.code)}
            aria-pressed={active}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              border: 'none',
              background: active ? '#16a34a' : 'transparent',
              color: active ? '#ffffff' : '#166534',
              fontSize: 11,
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

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
            padding: '16px 20px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>{LangSwitcher}</div>
          <h2 style={{ fontSize: 32, fontWeight: 700, color: '#fff', margin: 0 }}>
            Cow<span style={{ color: '#86efac' }}>Talk</span>
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', margin: '4px 0 16px' }}>
            {t.heroLine1} {t.heroLine2}
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <StatItem value={heroFarms} label={t.statFarms} />
            <StatItem value={heroCattle} label={t.statCattle} />
            <StatItem value={heroMonitoring} label={t.statMonitoring} />
            <StatItem value={heroDetection} label={t.statDetection} />
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
          position: 'relative',
        }}
      >
        {/* Desktop 전용: 폼 상단 오른쪽에 언어 스위처 */}
        {!isMobile && (
          <div style={{ position: 'absolute', top: 16, right: 16 }}>{LangSwitcherLight}</div>
        )}

        {/* Logo */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>
            Cow<span style={{ color: '#16a34a' }}>Talk</span>
          </h1>
          <p style={{ fontSize: 14, color: '#666', margin: '4px 0 0' }}>
            {t.tagline}
          </p>
          <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>
            {t.corporation}
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
                {t.email}
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
                {t.password}
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
              {t.loginFailed}
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
            {isLoggingIn ? t.loggingIn : t.login}
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
          {t.demoMode}
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
          {t.signupCta}
        </button>
        {/* 모바일: 역할 선택 버튼 */}
        {isMobile && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 11, color: '#999', textAlign: 'center', marginBottom: 8 }}>
              {t.rolePrompt}
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {roleBadges.map((role) => {
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
                    {isLoading ? t.entering : role.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p style={{ fontSize: 11, color: '#ccc', textAlign: 'center', marginTop: 16 }}>
          {t.footer}
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
          {t.heroBadge}
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
          {t.heroLine1}
        </p>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.85)', textAlign: 'center', margin: '2px 0 0' }}>
          {t.heroLine2}
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
          <StatItem value={heroFarms} label={t.statFarms} />
          <StatItem value={heroCattle} label={t.statCattle} />
          <StatItem value={heroMonitoring} label={t.statMonitoring} />
          <StatItem value={heroDetection} label={t.statDetection} />
          <StatItem value={heroEngines} label={t.statEngines} />
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
          {t.rolePrompt}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {roleBadges.map((role) => {
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
                {isLoading ? t.entering : role.label}
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
          {t.footerHero}
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
