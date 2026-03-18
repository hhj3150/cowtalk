// v4 발정 감지 엔진 이식 (fallback + 보조 분석)
// smaXtec 이벤트를 재판단하지 않음
// 센서 시그니처 + 번식 이력 → 발정 점수 계산

import type { AnimalProfile } from '@cowtalk/shared';
import {
  ESTRUS_WEIGHTS,
  ESTRUS_THRESHOLDS,
  PARITY_ADJUSTMENTS,
} from '@cowtalk/shared';
import type { ExtractedFeatures } from './v4-feature-extractor.js';

export interface EstrusResult {
  readonly score: number;        // 0-1
  readonly stage: 'pre_estrus' | 'estrus' | 'post_estrus' | 'none';
  readonly confidence: 'high' | 'medium' | 'low';
  readonly signals: readonly string[];
  readonly smaxtecEventDetected: boolean;
}

export function analyzeEstrus(
  profile: AnimalProfile,
  features: ExtractedFeatures,
): EstrusResult {
  const signals: string[] = [];

  // 1. smaXtec 발정 이벤트 확인 (신뢰)
  const estrusEvent = profile.activeEvents.find((e) => e.type === 'estrus');
  if (estrusEvent) {
    signals.push(`smaXtec 발정 이벤트 감지 (신뢰도 ${String(Math.round(estrusEvent.confidence * 100))}%)`);
  }

  // 2. 센서 시그니처 점수
  const sensorScore = calcSensorSignatureScore(features, signals);

  // 3. 번식 이력 점수
  const eventScore = calcEventHistoryScore(profile, signals);

  // 4. 주기 예측 점수 (간소화)
  const cycleScore = calcCycleScore(profile, signals);

  // 5. 가중 평균
  const rawScore =
    sensorScore * ESTRUS_WEIGHTS.sensorSignature +
    eventScore * ESTRUS_WEIGHTS.eventHistory +
    cycleScore * ESTRUS_WEIGHTS.cyclePrediction;

  // 6. 산차 보정
  const parityKey = profile.parity === 0 ? 'heifer'
    : profile.parity === 1 ? 'parity1'
    : profile.parity === 2 ? 'parity2'
    : 'parity3+';
  const parityAdj = PARITY_ADJUSTMENTS[parityKey] ?? 1.0;
  const score = Math.min(rawScore * parityAdj, 1);

  // 7. 단계 판정
  const stage = determineStage(estrusEvent, features);

  // 8. 신뢰도
  const confidence = score >= ESTRUS_THRESHOLDS.positive ? 'high'
    : score >= ESTRUS_THRESHOLDS.probable ? 'medium'
    : 'low';

  return {
    score,
    stage,
    confidence,
    signals,
    smaxtecEventDetected: Boolean(estrusEvent),
  };
}

function calcSensorSignatureScore(
  features: ExtractedFeatures,
  signals: string[],
): number {
  let score = 0;

  // 체온 소폭 상승
  if (features.temperature_24h_delta !== null) {
    const delta = features.temperature_24h_delta;
    if (delta >= ESTRUS_THRESHOLDS.temperatureRise.min && delta <= ESTRUS_THRESHOLDS.temperatureRise.max) {
      score += 0.4;
      signals.push(`체온 상승 ${String(Math.round(delta * 100) / 100)}°C (발정 범위)`);
    }
  }

  // 활동 증가
  if (features.activity_24h_delta_pct !== null && features.activity_24h_delta_pct > 30) {
    score += 0.35;
    signals.push(`활동 ${String(Math.round(features.activity_24h_delta_pct))}% 증가`);
  }

  // 반추 감소
  if (features.rumination_24h_delta_pct !== null && features.rumination_24h_delta_pct < -15) {
    score += 0.25;
    signals.push(`반추 ${String(Math.abs(Math.round(features.rumination_24h_delta_pct)))}% 감소`);
  }

  return Math.min(score, 1);
}

function calcEventHistoryScore(
  profile: AnimalProfile,
  signals: string[],
): number {
  // 임신 확인된 경우 → 발정 가능성 낮음 (최우선 체크)
  if (profile.pregnancyStatus === 'confirmed') {
    signals.push('임신 확인 상태 (발정 가능성 낮음)');
    return 0.1;
  }

  // 번식 이력 기반 점수
  if (profile.breedingHistory.length === 0) return 0.5; // 이력 없으면 중립

  const lastBreeding = profile.breedingHistory[0];
  if (!lastBreeding) return 0.5;

  // 마지막 수정 후 경과일
  const daysSince = profile.daysSinceInsemination;

  if (daysSince !== null) {
    // 21일 주기 기반
    const cycleDay = daysSince % 21;
    if (cycleDay >= 18 || cycleDay <= 3) {
      signals.push(`수정 후 ${String(daysSince)}일 (주기상 발정 시기)`);
      return 0.8;
    }
  }

  return 0.5;
}

function calcCycleScore(
  profile: AnimalProfile,
  signals: string[],
): number {
  // 번식 이력에서 주기 패턴 추출 (간소화)
  if (profile.breedingHistory.length < 2) return 0.5;

  const dates = profile.breedingHistory
    .map((b) => b.date.getTime())
    .sort((a, b) => b - a);

  // 최근 2회 간격
  const interval = Math.abs(dates[0]! - dates[1]!) / (24 * 60 * 60 * 1000);

  if (interval >= 18 && interval <= 24) {
    signals.push(`최근 번식 간격 ${String(Math.round(interval))}일 (정상 주기)`);
    return 0.7;
  }

  return 0.5;
}

function determineStage(
  estrusEvent: { stage?: string } | undefined,
  features: ExtractedFeatures,
): 'pre_estrus' | 'estrus' | 'post_estrus' | 'none' {
  // smaXtec 이벤트에 stage 정보가 있으면 그대로 사용
  if (estrusEvent?.stage) {
    const stage = estrusEvent.stage;
    if (stage === 'pre_estrus' || stage === 'estrus' || stage === 'post_estrus') {
      return stage;
    }
  }

  // 센서 패턴으로 추정
  if (features.activity_24h_delta_pct !== null && features.activity_24h_delta_pct > 50) {
    return 'estrus';
  }
  if (features.temperature_trend === 'rising' && features.activity_24h_delta_pct !== null && features.activity_24h_delta_pct > 20) {
    return 'pre_estrus';
  }

  return 'none';
}
