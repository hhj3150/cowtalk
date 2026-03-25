// 데모 모드 — 전체화면 자동 순환

import React, { useState, useEffect, useCallback } from 'react';

type DemoSlide = 'map' | 'kpi' | 'farm' | 'animal' | 'ai' | 'vet' | 'quarantine';

const SLIDES: readonly { key: DemoSlide; title: string; description: string }[] = [
  { key: 'map', title: '지역 인텔리전스', description: '141개 농장 실시간 모니터링' },
  { key: 'kpi', title: '핵심 성과 지표', description: '위내센서 데이터 기반 AI 분석' },
  { key: 'farm', title: '주의 농장 줌인', description: '건강 점수 기반 우선순위 농장' },
  { key: 'animal', title: '긴급 개체 분석', description: '개체별 종합 AI 해석' },
  { key: 'ai', title: 'AI 브리핑', description: 'Claude AI + v4 엔진 통합 해석' },
  { key: 'vet', title: '수의사 뷰', description: '56농장 한눈에 — 임상 의사결정 지원' },
  { key: 'quarantine', title: '방역 뷰', description: '조기 경보 + 질병 클러스터 감시' },
];

const INTERVAL = 10_000; // 10초

export default function DemoModePage(): React.JSX.Element {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % SLIDES.length);
  }, []);

  // 자동 순환
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(nextSlide, INTERVAL);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  // ESC로 종료
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        window.location.href = '/';
      }
      if (e.key === ' ') {
        e.preventDefault();
        setIsPaused((p) => !p);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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
      <div className="flex flex-1 flex-col items-center justify-center px-4 lg:px-8">
        <div className="animate-fade-in text-center">
          <h2 className="text-3xl font-bold lg:text-5xl">{slide.title}</h2>
          <p className="mt-3 text-base text-blue-200 lg:mt-4 lg:text-xl">{slide.description}</p>

          {/* 데모 KPI 애니메이션 */}
          <div className="mt-8 grid grid-cols-2 gap-3 lg:mt-12 lg:grid-cols-4 lg:gap-6">
            <DemoKpi label="총 두수" value={4250} suffix="두" />
            <DemoKpi label="건강이상" value={12} suffix="두" color="text-red-400" />
            <DemoKpi label="발정 후보" value={8} suffix="두" color="text-pink-400" />
            <DemoKpi label="AI 정확도" value={94.2} suffix="%" color="text-green-400" />
          </div>
        </div>
      </div>

      {/* 슬라이드 네비게이션 */}
      <div className="flex justify-center gap-2 pb-8">
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
    const duration = 2000;
    const steps = 60;
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
    <div className="rounded-xl bg-white/10 p-4 backdrop-blur lg:p-6">
      <p className="text-xs text-blue-300 lg:text-sm">{label}</p>
      <p className={`mt-1 text-2xl font-bold lg:text-3xl ${color}`}>
        {Number.isInteger(value) ? Math.round(displayValue) : displayValue.toFixed(1)}
        <span className="text-lg">{suffix}</span>
      </p>
    </div>
  );
}
