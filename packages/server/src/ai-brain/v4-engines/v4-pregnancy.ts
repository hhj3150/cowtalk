// v4 임신 예측 엔진 이식 (fallback + 보조 분석)
// 수정 후 안정성 점수, 재발정 감지, 임신 단계 추정

import type { AnimalProfile } from '@cowtalk/shared';
import type { ExtractedFeatures } from './v4-feature-extractor.js';

export interface PregnancyResult {
  readonly stabilityScore: number;   // 0-1, 임신 안정성
  readonly status: 'likely_pregnant' | 'uncertain' | 'likely_open' | 'not_applicable';
  readonly daysPostInsemination: number | null;
  readonly signals: readonly string[];
}

export function analyzePregnancy(
  profile: AnimalProfile,
  features: ExtractedFeatures,
): PregnancyResult {
  const signals: string[] = [];

  // 수정 이력 없으면 해당 없음
  if (profile.breedingHistory.length === 0 || profile.daysSinceInsemination === null) {
    return {
      stabilityScore: 0,
      status: 'not_applicable',
      daysPostInsemination: null,
      signals: ['수정 이력 없음'],
    };
  }

  const dpi = profile.daysSinceInsemination;
  signals.push(`수정 후 ${String(dpi)}일 경과`);

  // 이미 확인된 경우
  if (profile.pregnancyStatus === 'confirmed') {
    signals.push('임신 확인 상태');
    return {
      stabilityScore: 0.9,
      status: 'likely_pregnant',
      daysPostInsemination: dpi,
      signals,
    };
  }

  let stabilityScore = 0.5; // 중립 시작

  // 1. 발정 재발 징후 체크 (smaXtec)
  const recentEstrus = profile.activeEvents.some((e) => e.type === 'estrus');
  if (recentEstrus) {
    stabilityScore -= 0.3;
    signals.push('발정 이벤트 재감지 → 수태 실패 가능성');
  }

  // 2. 체온 안정성
  if (features.temperature_trend === 'stable') {
    stabilityScore += 0.1;
    signals.push('체온 안정 (긍정)');
  } else if (features.temperature_trend === 'rising' && dpi >= 18 && dpi <= 24) {
    // 21일 주기 부근 체온 상승 → 재발정 의심
    stabilityScore -= 0.15;
    signals.push('주기 부근 체온 상승 (재발정 의심)');
  }

  // 3. 활동 패턴
  if (features.activity_24h_delta_pct !== null) {
    if (features.activity_24h_delta_pct > 40 && dpi >= 18 && dpi <= 24) {
      stabilityScore -= 0.2;
      signals.push('주기 부근 활동 증가 (재발정 의심)');
    } else if (features.activity_24h_delta_pct < 10) {
      stabilityScore += 0.05;
    }
  }

  // 4. DPI 기반 기본 안정성
  if (dpi > 45) {
    stabilityScore += 0.15;
    signals.push('수정 후 45일 이상 경과 (안정기 진입)');
  } else if (dpi > 30) {
    stabilityScore += 0.1;
    signals.push('수정 후 30일 경과');
  }

  stabilityScore = Math.max(0, Math.min(1, stabilityScore));

  const status = stabilityScore >= 0.7 ? 'likely_pregnant'
    : stabilityScore >= 0.4 ? 'uncertain'
    : 'likely_open';

  return {
    stabilityScore,
    status,
    daysPostInsemination: dpi,
    signals,
  };
}
