// 데모 모드 — 전체화면 자동 순환 (슬라이드별 차별화된 KPI + 기능 미리보기)

import React, { useState, useEffect, useCallback } from 'react';

interface SlideConfig {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly kpis: readonly { label: string; value: number; suffix: string; color?: string }[];
  readonly features: readonly string[];
}

const SLIDES: readonly SlideConfig[] = [
  {
    key: 'overview',
    title: '축산 디지털 운영체제',
    description: 'smaXtec 위내센서 + 공공데이터 + AI 해석 = 통합 플랫폼',
    icon: '🐄',
    kpis: [
      { label: '연동 농장', value: 146, suffix: '개' },
      { label: '관리 두수', value: 7158, suffix: '두' },
      { label: '24/7 모니터링', value: 24, suffix: 'h', color: 'text-green-400' },
      { label: 'AI 감지 정확도', value: 95, suffix: '%+', color: 'text-green-400' },
    ],
    features: ['위내센서 실시간 체온·반추·활동 모니터링', '6개 역할별 맞춤 대시보드', '알람 → 판단 → 행동이 한 화면에서 완결'],
  },
  {
    key: 'farmer',
    title: '목장주 대시보드',
    description: 'smaXtec 센서 데이터 + AI 해석 → 즉시 행동',
    icon: '🧑‍🌾',
    kpis: [
      { label: '오늘 알림', value: 3, suffix: '건', color: 'text-yellow-400' },
      { label: '발정 후보', value: 2, suffix: '두', color: 'text-pink-400' },
      { label: '건강 이상', value: 1, suffix: '두', color: 'text-red-400' },
      { label: '건강 점수', value: 92, suffix: '점', color: 'text-green-400' },
    ],
    features: ['AI 일일 브리핑 — 오늘 뭘 먼저 해야 하는지', '개체 클릭 → 센서 차트 + 번식이력 + AI 분석', '수정 적기 알림 + 정액 추천'],
  },
  {
    key: 'vet',
    title: '수의사 뷰',
    description: '56개 담당 농장 한눈에 — 임상 의사결정 지원',
    icon: '🩺',
    kpis: [
      { label: '담당 농장', value: 56, suffix: '개' },
      { label: '긴급 방문', value: 3, suffix: '건', color: 'text-red-400' },
      { label: '체온 이상', value: 7, suffix: '두', color: 'text-orange-400' },
      { label: '처방 완료', value: 12, suffix: '건', color: 'text-green-400' },
    ],
    features: ['농장 그룹별 건강 랭킹', '질병 패턴 분석 + 감별 진단 지원', '처방전 자동 생성 + 기록'],
  },
  {
    key: 'quarantine',
    title: '방역관 뷰',
    description: '146개 농장 통합 방역 — 조기 경보 시스템',
    icon: '🛡️',
    kpis: [
      { label: '감시 농장', value: 146, suffix: '개' },
      { label: '발열 클러스터', value: 2, suffix: '건', color: 'text-red-400' },
      { label: '의심 개체', value: 4, suffix: '두', color: 'text-orange-400' },
      { label: '정상 비율', value: 97.3, suffix: '%', color: 'text-green-400' },
    ],
    features: ['질병 클러스터 자동 감지 + 확산 시뮬레이션', '역학 조사 워크플로우 디지털화', 'KAHIS 연동 + 전국 현황 지도'],
  },
  {
    key: 'ai',
    title: 'CowTalk AI 엔진',
    description: 'Claude AI + v4 룰 엔진 + 데이터 루프',
    icon: '🧠',
    kpis: [
      { label: '일일 분석', value: 1200, suffix: '건' },
      { label: 'AI 정확도', value: 94.2, suffix: '%', color: 'text-green-400' },
      { label: '평균 응답', value: 1.2, suffix: '초', color: 'text-blue-400' },
      { label: '레이블 축적', value: 340, suffix: '건', color: 'text-purple-400' },
    ],
    features: ['센서+공공데이터 → AI 분석 → 결과 축적 → AI 재강화', '역할별 맞춤 액션플랜 자동 생성', 'Claude API 불가 시 v4 룰 엔진 자동 전환'],
  },
  {
    key: 'export',
    title: '수출 전략 플랫폼',
    description: '1농장 → 146농장 → 지역 → 국가 → 글로벌',
    icon: '🌏',
    kpis: [
      { label: '한국 목장', value: 146, suffix: '개' },
      { label: '공공데이터 API', value: 8, suffix: '종' },
      { label: '지원 역할', value: 6, suffix: '개' },
      { label: '다국어 지원', value: 3, suffix: '종', color: 'text-blue-400' },
    ],
    features: ['국가별 어댑터 패턴 — 한국 특화이되 글로벌 확장', 'i18n 지원 (한/영/러)', '축산 디지털 주권 — 아날로그→디지털 전환'],
  },
];

const INTERVAL = 10_000;

export default function DemoModePage(): React.JSX.Element {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(nextSlide, INTERVAL);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') window.location.href = '/';
      if (e.key === ' ') { e.preventDefault(); setIsPaused((p) => !p); }
      if (e.key === 'ArrowRight') setCurrentIndex((p) => (p + 1) % SLIDES.length);
      if (e.key === 'ArrowLeft') setCurrentIndex((p) => (p - 1 + SLIDES.length) % SLIDES.length);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 스와이프 지원
  useEffect(() => {
    let startX = 0;
    function onTouchStart(e: TouchEvent): void { startX = e.touches[0]?.clientX ?? 0; }
    function onTouchEnd(e: TouchEvent): void {
      const endX = e.changedTouches[0]?.clientX ?? 0;
      const diff = startX - endX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) setCurrentIndex((p) => (p + 1) % SLIDES.length);
        else setCurrentIndex((p) => (p - 1 + SLIDES.length) % SLIDES.length);
      }
    }
    document.addEventListener('touchstart', onTouchStart);
    document.addEventListener('touchend', onTouchEnd);
    return () => { document.removeEventListener('touchstart', onTouchStart); document.removeEventListener('touchend', onTouchEnd); };
  }, []);

  const slide = SLIDES[currentIndex]!;

  return (
    <div className="flex h-screen flex-col bg-gradient-to-br from-slate-900 to-blue-900 text-white">
      {/* 최상단 브랜딩 */}
      <div className="flex items-center justify-between px-4 py-3 lg:px-8 lg:py-4">
        <div>
          <h1 className="text-2xl font-bold">CowTalk</h1>
          <p className="text-xs text-blue-300">축산 디지털 운영체제</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-blue-400">
            {currentIndex + 1} / {SLIDES.length}
          </span>
          <button
            type="button"
            onClick={() => setIsPaused(!isPaused)}
            className="rounded-md border border-blue-500 px-3 py-1 text-xs text-blue-300 hover:bg-blue-800"
          >
            {isPaused ? '재생' : '일시정지'}
          </button>
          <a href="/" className="rounded-md border border-blue-500 px-3 py-1 text-xs text-blue-300 hover:bg-blue-800">
            ESC 종료
          </a>
        </div>
      </div>

      {/* 진행 바 */}
      <div className="mx-4 h-1 rounded-full bg-blue-800 lg:mx-8">
        <div
          className="h-1 rounded-full bg-blue-400 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / SLIDES.length) * 100}%` }}
        />
      </div>

      {/* 슬라이드 컨텐츠 */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 lg:px-8">
        <div key={slide.key} className="w-full max-w-3xl text-center">
          {/* 아이콘 + 제목 */}
          <div className="mb-2 text-4xl lg:text-5xl">{slide.icon}</div>
          <h2 className="text-2xl font-bold lg:text-4xl">{slide.title}</h2>
          <p className="mt-2 text-sm text-blue-200 lg:mt-3 lg:text-lg">{slide.description}</p>

          {/* KPI 카드 */}
          <div className="mt-6 grid grid-cols-2 gap-3 lg:mt-10 lg:grid-cols-4 lg:gap-5">
            {slide.kpis.map((kpi) => (
              <DemoKpi key={kpi.label} label={kpi.label} value={kpi.value} suffix={kpi.suffix} color={kpi.color} />
            ))}
          </div>

          {/* 핵심 기능 */}
          <div className="mt-6 space-y-2 text-left lg:mt-8">
            {slide.features.map((feat, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-blue-100 lg:px-4 lg:py-3 lg:text-sm">
                <span className="mt-0.5 text-green-400">{'>'}</span>
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 슬라이드 네비게이션 */}
      <div className="flex justify-center gap-2 pb-6 pt-2">
        {SLIDES.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setCurrentIndex(i)}
            className={`h-2 rounded-full transition-all ${
              i === currentIndex ? 'w-8 bg-blue-400' : 'w-2 bg-blue-700'
            }`}
          />
        ))}
      </div>

      {/* 스와이프 힌트 */}
      <div className="pb-4 text-center text-[10px] text-blue-600 lg:hidden">
        좌우 스와이프로 이동
      </div>
    </div>
  );
}

function DemoKpi({
  label,
  value,
  suffix,
  color = 'text-white',
}: {
  label: string;
  value: number;
  suffix: string;
  color?: string;
}): React.JSX.Element {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    setDisplayValue(0);
    const duration = 1500;
    const steps = 40;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(current + increment, value);
      setDisplayValue(current);
      if (step >= steps) clearInterval(timer);
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  return (
    <div className="rounded-xl bg-white/10 p-3 backdrop-blur lg:p-5">
      <p className="text-[10px] text-blue-300 lg:text-xs">{label}</p>
      <p className={`mt-1 text-xl font-bold lg:text-2xl ${color}`}>
        {Number.isInteger(value) ? Math.round(displayValue) : displayValue.toFixed(1)}
        <span className="text-sm lg:text-base">{suffix}</span>
      </p>
    </div>
  );
}
