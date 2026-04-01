// 번식 성과 KPI 대시보드 — 수태율·공태일·경제 효과 한눈에
// 공모사업 심사 포인트: "도입 전후 얼마나 좋아졌냐" 30초 안에 증명

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBreedingPipeline } from '@web/api/breeding.api';
import { LoadingSkeleton } from '@web/components/common/LoadingSkeleton';
import type { BreedingKpis, BreedingPipelineData } from '@cowtalk/shared';
import { useFarmStore } from '@web/stores/farm.store';

// ===========================
// 전국 평균 벤치마크 (2024 축산물품질평가원 기준)
// ===========================
const NATIONAL_BENCHMARK: Readonly<{
  conceptionRate: number;
  estrusDetectionRate: number;
  avgDaysOpen: number;
  avgCalvingInterval: number;
}> = {
  conceptionRate: 55,        // 전국 평균 수태율 55%
  estrusDetectionRate: 65,   // 전국 평균 발정탐지율 65%
  avgDaysOpen: 160,          // 전국 평균 공태일 160일
  avgCalvingInterval: 430,   // 전국 평균 분만간격 430일
};

const TARGETS: Readonly<{
  conceptionRate: number;
  estrusDetectionRate: number;
  avgDaysOpen: number;
  avgCalvingInterval: number;
}> = {
  conceptionRate: 65,
  estrusDetectionRate: 85,
  avgDaysOpen: 120,
  avgCalvingInterval: 400,
};

// ===========================
// 경제적 효과 계산
// ===========================

interface EconomicEffect {
  readonly label: string;
  readonly basis: string;
  readonly annualGainPerHead: number; // 두당 연간 이익 (원)
  readonly description: string;
}

function calcEconomicEffects(kpis: BreedingKpis, _totalAnimals: number): readonly EconomicEffect[] {
  // 수태율 개선 효과: 공태 1일당 약 3,000원 손실 (사료비+기회비용)
  const daysOpenImproved = Math.max(0, NATIONAL_BENCHMARK.avgDaysOpen - kpis.avgDaysOpen);
  const breedingGainPerHead = daysOpenImproved * 3000;

  // 발정탐지율 개선 효과: 발정 1회 놓침당 약 21일 공태 추가 → 63,000원
  const detectionImprovement = Math.max(0, kpis.estrusDetectionRate - NATIONAL_BENCHMARK.estrusDetectionRate);
  const detectionGainPerHead = (detectionImprovement / 100) * 21 * 3000;

  // 분만간격 단축 효과: 분만간격 1일 단축당 약 5,000원 (송아지 판매 기회)
  const calvingImproved = Math.max(0, NATIONAL_BENCHMARK.avgCalvingInterval - kpis.avgCalvingInterval);
  const calvingGainPerHead = calvingImproved * 5000;

  return [
    {
      label: '공태일 단축 효과',
      basis: `${NATIONAL_BENCHMARK.avgDaysOpen}일 → ${kpis.avgDaysOpen.toFixed(0)}일 (${daysOpenImproved.toFixed(0)}일 단축)`,
      annualGainPerHead: breedingGainPerHead,
      description: '공태 1일당 사료비·기회비용 약 3,000원',
    },
    {
      label: '발정탐지율 개선 효과',
      basis: `${NATIONAL_BENCHMARK.estrusDetectionRate}% → ${kpis.estrusDetectionRate.toFixed(1)}% (+${detectionImprovement.toFixed(1)}%p)`,
      annualGainPerHead: detectionGainPerHead,
      description: '발정 1회 추가 탐지당 공태 21일 절약',
    },
    {
      label: '분만간격 단축 효과',
      basis: `${NATIONAL_BENCHMARK.avgCalvingInterval}일 → ${kpis.avgCalvingInterval.toFixed(0)}일 (${calvingImproved.toFixed(0)}일 단축)`,
      annualGainPerHead: calvingGainPerHead,
      description: '분만간격 1일 단축당 약 5,000원 (송아지 생산 기회 증가)',
    },
  ];
}

// ===========================
// 게이지 바 컴포넌트
// ===========================

interface GaugeSectionProps {
  readonly label: string;
  readonly current: number;
  readonly national: number;
  readonly target: number;
  readonly unit: string;
  readonly higherIsBetter?: boolean;
}

function GaugeSection({ label, current, national, target, unit, higherIsBetter = true }: GaugeSectionProps): React.JSX.Element {
  const max = higherIsBetter ? Math.max(current, national, target) * 1.1 : Math.max(current, national, target) * 1.1;

  const pct = (v: number): number => Math.min(100, Math.round((v / max) * 100));

  const isGood = higherIsBetter ? current >= target : current <= target;
  const isBetterThanNational = higherIsBetter ? current >= national : current <= national;
  const currentColor = isGood ? '#16a34a' : isBetterThanNational ? '#d97706' : '#dc2626';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>{label}</p>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold" style={{ color: currentColor }}>
            {current.toFixed(label.includes('일') ? 0 : 1)}{unit}
          </span>
          {isGood && <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>목표 달성</span>}
        </div>
      </div>

      {/* 바 */}
      <div className="space-y-1.5">
        {/* 현재값 */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] w-16 text-right flex-shrink-0" style={{ color: currentColor }}>현재</span>
          <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: 'var(--ct-border)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct(current)}%`, background: currentColor }}
            />
          </div>
          <span className="text-xs w-14 flex-shrink-0" style={{ color: currentColor }}>
            {current.toFixed(label.includes('일') ? 0 : 1)}{unit}
          </span>
        </div>
        {/* 전국 평균 */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] w-16 text-right flex-shrink-0" style={{ color: '#6b7280' }}>전국평균</span>
          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--ct-border)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${pct(national)}%`, background: '#9ca3af' }}
            />
          </div>
          <span className="text-xs w-14 flex-shrink-0" style={{ color: '#6b7280' }}>
            {national}{unit}
          </span>
        </div>
        {/* 목표 */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] w-16 text-right flex-shrink-0" style={{ color: '#3b82f6' }}>목표</span>
          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--ct-border)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${pct(target)}%`, background: '#3b82f6', opacity: 0.5 }}
            />
          </div>
          <span className="text-xs w-14 flex-shrink-0" style={{ color: '#3b82f6' }}>
            {target}{unit}
          </span>
        </div>
      </div>
    </div>
  );
}

// ===========================
// 경제 효과 카드
// ===========================

function EconomicCard({
  effect,
  totalAnimals,
}: {
  effect: EconomicEffect;
  totalAnimals: number;
}): React.JSX.Element {
  const totalAnnual = effect.annualGainPerHead * totalAnimals;
  const isPositive = effect.annualGainPerHead > 0;

  return (
    <div
      className="rounded-xl p-4 space-y-2"
      style={{ background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
    >
      <p className="text-sm font-bold" style={{ color: 'var(--ct-text)' }}>{effect.label}</p>
      <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>{effect.basis}</p>
      <div className="flex items-end justify-between pt-1">
        <div>
          <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>두당 연간</p>
          <p
            className="text-lg font-bold"
            style={{ color: isPositive ? '#16a34a' : '#6b7280' }}
          >
            {isPositive ? '+' : ''}{(effect.annualGainPerHead / 10000).toFixed(0)}만원
          </p>
        </div>
        {totalAnimals > 0 && (
          <div className="text-right">
            <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>농장 전체 ({totalAnimals}두)</p>
            <p
              className="text-xl font-bold"
              style={{ color: isPositive ? '#16a34a' : '#6b7280' }}
            >
              {isPositive ? '+' : ''}{(totalAnnual / 10000).toFixed(0)}만원/년
            </p>
          </div>
        )}
      </div>
      <p className="text-[11px]" style={{ color: 'var(--ct-text-secondary)' }}>{effect.description}</p>
    </div>
  );
}

// ===========================
// 총 경제 효과 요약
// ===========================

function EconomicSummary({
  effects,
  totalAnimals,
}: {
  effects: readonly EconomicEffect[];
  totalAnimals: number;
}): React.JSX.Element {
  const totalPerHead = effects.reduce((sum, e) => sum + e.annualGainPerHead, 0);
  const totalFarm = totalPerHead * totalAnimals;
  const isPositive = totalFarm > 0;

  return (
    <div
      className="rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
      style={{
        background: isPositive ? 'rgba(22,163,74,0.06)' : 'var(--ct-surface)',
        border: `2px solid ${isPositive ? 'rgba(22,163,74,0.3)' : 'var(--ct-border)'}`,
      }}
    >
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--ct-text)' }}>CowTalk 도입 연간 총 경제 효과</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
          전국 평균 대비 개선치 기준 · {totalAnimals}두 농장 기준
        </p>
      </div>
      <div className="text-center sm:text-right">
        <p
          className="text-3xl font-bold"
          style={{ color: isPositive ? '#16a34a' : '#6b7280' }}
        >
          {isPositive ? '+' : ''}{(totalFarm / 10000).toFixed(0)}만원/년
        </p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
          두당 {isPositive ? '+' : ''}{(totalPerHead / 10000).toFixed(1)}만원
        </p>
      </div>
    </div>
  );
}

// ===========================
// 성과 등급 배지
// ===========================

function PerformanceBadge({ kpis }: { kpis: BreedingKpis }): React.JSX.Element {
  const scores = [
    kpis.conceptionRate >= TARGETS.conceptionRate ? 2 : kpis.conceptionRate >= NATIONAL_BENCHMARK.conceptionRate ? 1 : 0,
    kpis.estrusDetectionRate >= TARGETS.estrusDetectionRate ? 2 : kpis.estrusDetectionRate >= NATIONAL_BENCHMARK.estrusDetectionRate ? 1 : 0,
    kpis.avgDaysOpen <= TARGETS.avgDaysOpen ? 2 : kpis.avgDaysOpen <= NATIONAL_BENCHMARK.avgDaysOpen ? 1 : 0,
    kpis.avgCalvingInterval <= TARGETS.avgCalvingInterval ? 2 : kpis.avgCalvingInterval <= NATIONAL_BENCHMARK.avgCalvingInterval ? 1 : 0,
  ];
  const total = scores.reduce((s, v) => s + v, 0);

  let grade: string;
  let color: string;
  let bg: string;

  if (total >= 7)      { grade = 'S — 최우수';   color = '#7c3aed'; bg = 'rgba(124,58,237,0.1)'; }
  else if (total >= 5) { grade = 'A — 우수';      color = '#16a34a'; bg = 'rgba(22,163,74,0.1)'; }
  else if (total >= 3) { grade = 'B — 양호';      color = '#2563eb'; bg = 'rgba(37,99,235,0.1)'; }
  else if (total >= 1) { grade = 'C — 개선 필요'; color = '#d97706'; bg = 'rgba(217,119,6,0.1)'; }
  else                 { grade = 'D — 집중 관리'; color = '#dc2626'; bg = 'rgba(220,38,38,0.1)'; }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full"
      style={{ background: bg, color }}
    >
      🏆 번식 성적 등급: {grade}
    </span>
  );
}

// ===========================
// 메인 페이지
// ===========================

type ViewTab = 'kpi' | 'economic';

export default function BreedingKpiPage(): React.JSX.Element {
  const { selectedFarmId } = useFarmStore();
  const [tab, setTab] = useState<ViewTab>('kpi');

  const { data, isLoading, isError } = useQuery<BreedingPipelineData>({
    queryKey: ['breeding-pipeline', selectedFarmId],
    queryFn: () => getBreedingPipeline(selectedFarmId ?? undefined),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <LoadingSkeleton lines={3} />
        <LoadingSkeleton lines={5} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm" style={{ color: 'var(--ct-text-secondary)' }}>성과 데이터를 불러올 수 없습니다</p>
      </div>
    );
  }

  const { kpis, totalAnimals } = data;
  const economicEffects = calcEconomicEffects(kpis, totalAnimals);

  return (
    <div className="space-y-5 pb-8">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--ct-text)' }}>번식 성과 분석</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
            전국 평균 대비 · {totalAnimals}두 기준 · 2024 축산물품질평가원 벤치마크
          </p>
        </div>
        <PerformanceBadge kpis={kpis} />
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--ct-border)' }}>
        {([
          { key: 'kpi' as ViewTab,      label: '📊 성과 지표' },
          { key: 'economic' as ViewTab, label: '💰 경제 효과' },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
            style={{
              borderColor: tab === t.key ? 'var(--ct-primary)' : 'transparent',
              color: tab === t.key ? 'var(--ct-primary)' : 'var(--ct-text-secondary)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {tab === 'kpi' && (
        <div className="space-y-6">
          {/* 4대 KPI 게이지 */}
          <div
            className="rounded-xl p-5 space-y-6"
            style={{ background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
          >
            <GaugeSection
              label="수태율"
              current={kpis.conceptionRate}
              national={NATIONAL_BENCHMARK.conceptionRate}
              target={TARGETS.conceptionRate}
              unit="%"
              higherIsBetter={true}
            />
            <GaugeSection
              label="발정탐지율"
              current={kpis.estrusDetectionRate}
              national={NATIONAL_BENCHMARK.estrusDetectionRate}
              target={TARGETS.estrusDetectionRate}
              unit="%"
              higherIsBetter={true}
            />
            <GaugeSection
              label="평균 공태일"
              current={kpis.avgDaysOpen}
              national={NATIONAL_BENCHMARK.avgDaysOpen}
              target={TARGETS.avgDaysOpen}
              unit="일"
              higherIsBetter={false}
            />
            <GaugeSection
              label="평균 분만간격"
              current={kpis.avgCalvingInterval}
              national={NATIONAL_BENCHMARK.avgCalvingInterval}
              target={TARGETS.avgCalvingInterval}
              unit="일"
              higherIsBetter={false}
            />
          </div>

          {/* 임신율 = 발정탐지율 × 수태율 */}
          <div
            className="rounded-xl p-4 flex items-center justify-between"
            style={{ background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.2)' }}
          >
            <div>
              <p className="text-xs font-semibold" style={{ color: '#2563eb' }}>종합 임신율</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ct-text-secondary)' }}>
                = 발정탐지율 × 수태율 (PR: Pregnancy Rate)
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold" style={{ color: '#2563eb' }}>
                {kpis.pregnancyRate.toFixed(1)}%
              </p>
              <p className="text-xs" style={{ color: 'var(--ct-text-secondary)' }}>
                전국평균 {(NATIONAL_BENCHMARK.conceptionRate * NATIONAL_BENCHMARK.estrusDetectionRate / 100).toFixed(1)}%
              </p>
            </div>
          </div>

          {/* 벤치마크 범례 */}
          <div className="flex items-center gap-4">
            {[
              { color: '#16a34a', label: '현재 (목표 달성)' },
              { color: '#d97706', label: '현재 (전국 이상)' },
              { color: '#dc2626', label: '현재 (개선 필요)' },
              { color: '#9ca3af', label: '전국 평균' },
              { color: '#3b82f6', label: '목표' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: item.color }} />
                <span className="text-[11px]" style={{ color: 'var(--ct-text-secondary)' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'economic' && (
        <div className="space-y-4">
          {/* 총 효과 요약 */}
          <EconomicSummary effects={economicEffects} totalAnimals={totalAnimals} />

          {/* 항목별 효과 */}
          <div className="grid gap-3 sm:grid-cols-1">
            {economicEffects.map((effect) => (
              <EconomicCard key={effect.label} effect={effect} totalAnimals={totalAnimals} />
            ))}
          </div>

          {/* 전제 조건 안내 */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--ct-surface)', border: '1px solid var(--ct-border)' }}
          >
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--ct-text-secondary)' }}>📌 산출 근거</p>
            <ul className="space-y-1 text-[11px]" style={{ color: 'var(--ct-text-secondary)' }}>
              <li>• 전국 평균 수치: 2024년 축산물품질평가원 낙농·한우 통합 기준</li>
              <li>• 공태 1일 비용: 사료비 약 2,000원 + 기회비용 1,000원 = 3,000원</li>
              <li>• 분만간격 단축 효과: 연간 추가 송아지 생산 기회 (두당 5,000원)</li>
              <li>• 실제 효과는 농장 규모·사육 방식에 따라 달라질 수 있음</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
