// v4 임신 예측 엔진 — 센서 데이터 기반 임신 유무 판단
//
// 핵심 원리:
//   임신 소: 수정 후 21일 주기에 발정 재발 없음. 체온/반추/활동 안정.
//   미임신 소: 수정 후 18~25일에 활동↑ + 반추↓ (재발정).
//
// 정확도는 레이블 축적에 따라 향상됨.
// 직장검사/임신키트 없이 데이터만으로 판단하는 것이 최종 목표.

import type { AnimalProfile } from '@cowtalk/shared';
import type { ExtractedFeatures } from './v4-feature-extractor.js';

export interface PregnancyResult {
  readonly stabilityScore: number;   // 0-1, 임신 안정성
  readonly status: 'likely_pregnant' | 'uncertain' | 'likely_open' | 'not_applicable';
  readonly daysPostInsemination: number | null;
  readonly signals: readonly PregnancySignal[];
  readonly recommendation: string;
}

interface PregnancySignal {
  readonly type: string;
  readonly description: string;
  readonly impact: 'positive' | 'negative' | 'neutral';
  readonly weight: number;
}

export function analyzePregnancy(
  profile: AnimalProfile,
  features: ExtractedFeatures,
): PregnancyResult {
  const signals: PregnancySignal[] = [];

  // 수정 이력 없으면 해당 없음
  if (profile.breedingHistory.length === 0 || profile.daysSinceInsemination === null) {
    return {
      stabilityScore: 0,
      status: 'not_applicable',
      daysPostInsemination: null,
      signals: [{ type: 'no_history', description: '수정 이력 없음', impact: 'neutral', weight: 0 }],
      recommendation: '수정 이력이 없어 임신 판단 불가.',
    };
  }

  const dpi = profile.daysSinceInsemination;

  // 이미 확인된 경우
  if (profile.pregnancyStatus === 'confirmed') {
    return {
      stabilityScore: 0.95,
      status: 'likely_pregnant',
      daysPostInsemination: dpi,
      signals: [{ type: 'confirmed', description: '임신 확인 상태', impact: 'positive', weight: 0.5 }],
      recommendation: `임신 확인 (DPI ${dpi}일). 정기 건강 모니터링 유지.`,
    };
  }

  let score = 0.50; // 중립 시작

  // ── 1. 재발정 감지 (가장 강력한 신호) ──

  // smaXtec 발정 이벤트 재감지
  const recentEstrus = profile.activeEvents.some((e) => e.type === 'estrus');
  if (recentEstrus && dpi >= 15 && dpi <= 30) {
    score -= 0.35;
    signals.push({
      type: 'reestrus_detected',
      description: `수정 후 ${dpi}일에 발정 이벤트 재감지 — 수태 실패 가능성 매우 높음`,
      impact: 'negative',
      weight: -0.35,
    });
  } else if (recentEstrus && dpi > 30) {
    score -= 0.15;
    signals.push({
      type: 'late_estrus',
      description: `수정 후 ${dpi}일에 발정 감지 — 초기 배아 사멸 또는 오감지 가능성`,
      impact: 'negative',
      weight: -0.15,
    });
  }

  // ── 2. 체온 안정성 (21일 주기 부근) ──

  if (features.temperature_trend === 'stable') {
    score += 0.10;
    signals.push({
      type: 'temp_stable',
      description: '체온 추세 안정 — 임신 유지에 긍정적',
      impact: 'positive',
      weight: 0.10,
    });
  } else if (features.temperature_trend === 'rising' && dpi >= 18 && dpi <= 25) {
    score -= 0.20;
    signals.push({
      type: 'temp_rising_cycle',
      description: `수정 후 ${dpi}일(21일 주기 부근) 체온 상승 — 재발정 또는 염증 의심`,
      impact: 'negative',
      weight: -0.20,
    });
  } else if (features.temperature_trend === 'falling' && dpi >= 18 && dpi <= 25) {
    // 체온 하강은 프로게스테론 유지 → 임신에 긍정
    score += 0.05;
    signals.push({
      type: 'temp_falling_cycle',
      description: '체온 하강 추세 — 프로게스테론 유지(임신 가능성)',
      impact: 'positive',
      weight: 0.05,
    });
  }

  // ── 3. 활동 패턴 (21일 주기 부근) ──

  if (features.activity_24h_delta_pct !== null) {
    if (features.activity_24h_delta_pct > 40 && dpi >= 18 && dpi <= 25) {
      score -= 0.25;
      signals.push({
        type: 'activity_spike_cycle',
        description: `수정 후 ${dpi}일 활동 +${Math.round(features.activity_24h_delta_pct)}% 급증 — 재발정 행동 의심`,
        impact: 'negative',
        weight: -0.25,
      });
    } else if (features.activity_24h_delta_pct < 10 && dpi >= 18 && dpi <= 25) {
      score += 0.10;
      signals.push({
        type: 'activity_calm_cycle',
        description: '21일 주기 부근 활동량 안정 — 재발정 징후 없음',
        impact: 'positive',
        weight: 0.10,
      });
    }
  }

  // ── 4. 반추 안정성 ──

  if (features.rumination_24h_avg !== null && features.rumination_24h_avg > 450) {
    score += 0.05;
    signals.push({
      type: 'rum_normal',
      description: `반추 ${Math.round(features.rumination_24h_avg)}분/일 — 정상 범위 유지`,
      impact: 'positive',
      weight: 0.05,
    });
  } else if (features.rumination_24h_avg !== null && features.rumination_24h_avg < 350) {
    score -= 0.05;
    signals.push({
      type: 'rum_low',
      description: `반추 ${Math.round(features.rumination_24h_avg)}분/일 — 건강 문제 또는 재발정 가능성`,
      impact: 'negative',
      weight: -0.05,
    });
  }

  // ── 5. DPI 기반 안정성 ──

  if (dpi > 45) {
    score += 0.20;
    signals.push({
      type: 'dpi_45_plus',
      description: `수정 후 ${dpi}일 — 2회 발정 주기 통과. 재발정 없으면 임신 확률 높음`,
      impact: 'positive',
      weight: 0.20,
    });
  } else if (dpi > 30) {
    score += 0.10;
    signals.push({
      type: 'dpi_30_plus',
      description: `수정 후 ${dpi}일 — 1.5회 발정 주기 통과`,
      impact: 'positive',
      weight: 0.10,
    });
  } else if (dpi >= 18 && dpi <= 25) {
    signals.push({
      type: 'dpi_critical_window',
      description: `수정 후 ${dpi}일 — 재발정 관찰 핵심 기간 (18~25일)`,
      impact: 'neutral',
      weight: 0,
    });
  }

  // ── 6. 반복 수정 이력 ──

  const failCount = profile.breedingHistory.filter((b) => b.result === 'fail').length;
  if (failCount >= 3) {
    score -= 0.10;
    signals.push({
      type: 'repeat_breeder',
      description: `과거 수정 ${failCount}회 실패 — 반복수정우(Repeat Breeder), 수태율 하향 보정`,
      impact: 'negative',
      weight: -0.10,
    });
  }

  // ── 결과 판정 ──

  score = Math.max(0, Math.min(1, score));

  const status: PregnancyResult['status'] =
    score >= 0.70 ? 'likely_pregnant'
    : score >= 0.40 ? 'uncertain'
    : 'likely_open';

  // 행동 권고
  let recommendation = '';
  if (status === 'likely_pregnant' && dpi < 35) {
    recommendation = `임신 가능성 높음 (${Math.round(score * 100)}%). 수정 후 35일에 직장검사/임신키트로 확정 권장.`;
  } else if (status === 'likely_pregnant' && dpi >= 35) {
    recommendation = `임신 가능성 높음 (${Math.round(score * 100)}%). 직장검사 임신감정 시행 권장.`;
  } else if (status === 'uncertain') {
    recommendation = `불확실 (${Math.round(score * 100)}%). ${dpi < 25 ? '21일 주기 관찰 후 재평가.' : '직장검사 또는 임신키트 확인 필요.'}`;
  } else {
    recommendation = `미임신 가능성 높음 (${Math.round(score * 100)}%). 다음 발정 대기 또는 발정동기화 프로그램 고려.`;
  }

  return {
    stabilityScore: score,
    status,
    daysPostInsemination: dpi,
    signals,
    recommendation,
  };
}
