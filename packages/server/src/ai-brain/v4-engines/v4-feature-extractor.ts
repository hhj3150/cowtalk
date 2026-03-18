// v4 Feature Extractor 이식 — 센서 데이터에서 특성(feature) 추출
// Claude에게 보조 분석으로 제공 + fallback 시 직접 사용

import type { AnimalProfile, SensorSnapshot } from '@cowtalk/shared';
import {
  SENSOR_RANGE_MAP,
  DATA_QUALITY_WEIGHTS,
} from '@cowtalk/shared';

// ===========================
// 추출된 특성 타입
// ===========================

export interface ExtractedFeatures {
  // 체온 특성
  readonly temperature_current: number | null;
  readonly temperature_24h_avg: number | null;
  readonly temperature_24h_delta: number | null;    // 현재 - 24시간 평균
  readonly temperature_24h_max: number | null;
  readonly temperature_24h_min: number | null;
  readonly temperature_trend: 'rising' | 'falling' | 'stable' | 'unknown';

  // 활동 특성
  readonly activity_current: number | null;
  readonly activity_24h_avg: number | null;
  readonly activity_24h_delta_pct: number | null;   // % 변화

  // 반추 특성
  readonly rumination_current: number | null;
  readonly rumination_24h_avg: number | null;
  readonly rumination_24h_delta_pct: number | null;  // % 변화

  // 음수 특성
  readonly water_intake_current: number | null;
  readonly water_intake_24h_delta_pct: number | null;

  // pH 특성
  readonly ph_current: number | null;
  readonly ph_24h_avg: number | null;

  // 복합 특성
  readonly estrus_evidence_score: number;    // 0-1, 발정 증거 점수
  readonly disease_evidence_score: number;   // 0-1, 질병 증거 점수
  readonly data_quality_score: number;       // 0-100
}

// ===========================
// 메인 추출 함수
// ===========================

export function extractFeatures(profile: AnimalProfile): ExtractedFeatures {
  const current = profile.latestSensor;
  const history = profile.sensorHistory24h;

  // 24시간 평균 계산
  const avgTemp = calcAvg(history, 'temperature');
  const avgAct = calcAvg(history, 'activity');
  const avgRum = calcAvg(history, 'rumination');
  const avgWater = calcAvg(history, 'waterIntake');
  const avgPh = calcAvg(history, 'ph');

  // 체온 트렌드
  const tempTrend = calcTemperatureTrend(history);

  // 델타 계산
  const tempDelta = current.temperature !== null && avgTemp !== null
    ? current.temperature - avgTemp
    : null;

  const actDeltaPct = calcDeltaPercent(current.activity, avgAct);
  const rumDeltaPct = calcDeltaPercent(current.rumination, avgRum);
  const waterDeltaPct = calcDeltaPercent(current.waterIntake, avgWater);

  // 발정 증거 점수
  const estrusScore = calcEstrusEvidenceScore(
    tempDelta,
    actDeltaPct,
    rumDeltaPct,
    profile.activeEvents,
  );

  // 질병 증거 점수
  const diseaseScore = calcDiseaseEvidenceScore(
    current.temperature,
    rumDeltaPct,
    current.ph,
    profile.activeEvents,
  );

  // 데이터 품질
  const dataQuality = calcDataQuality(current, history);

  return {
    temperature_current: current.temperature,
    temperature_24h_avg: avgTemp,
    temperature_24h_delta: tempDelta,
    temperature_24h_max: calcMax(history, 'temperature'),
    temperature_24h_min: calcMin(history, 'temperature'),
    temperature_trend: tempTrend,

    activity_current: current.activity,
    activity_24h_avg: avgAct,
    activity_24h_delta_pct: actDeltaPct,

    rumination_current: current.rumination,
    rumination_24h_avg: avgRum,
    rumination_24h_delta_pct: rumDeltaPct,

    water_intake_current: current.waterIntake,
    water_intake_24h_delta_pct: waterDeltaPct,

    ph_current: current.ph,
    ph_24h_avg: avgPh,

    estrus_evidence_score: estrusScore,
    disease_evidence_score: diseaseScore,
    data_quality_score: dataQuality,
  };
}

// ===========================
// 발정 증거 점수 (v4 로직 이식)
// ===========================

function calcEstrusEvidenceScore(
  tempDelta: number | null,
  actDeltaPct: number | null,
  rumDeltaPct: number | null,
  events: readonly { type: string; confidence: number }[],
): number {
  let score = 0;
  let factors = 0;

  // 체온 소폭 상승 (0.2~0.5°C) → 발정 징후
  if (tempDelta !== null) {
    if (tempDelta >= 0.2 && tempDelta <= 0.5) {
      score += 0.3;
    } else if (tempDelta > 0.5) {
      score += 0.1; // 너무 높으면 질병 가능성
    }
    factors++;
  }

  // 활동 증가 (>30%) → 발정 징후
  if (actDeltaPct !== null) {
    if (actDeltaPct > 50) {
      score += 0.3;
    } else if (actDeltaPct > 30) {
      score += 0.2;
    }
    factors++;
  }

  // 반추 감소 → 약한 발정 징후
  if (rumDeltaPct !== null && rumDeltaPct < -15) {
    score += 0.1;
    factors++;
  }

  // smaXtec 발정 이벤트 → 강한 증거
  const estrusEvent = events.find((e) => e.type === 'estrus');
  if (estrusEvent) {
    score += 0.4 * estrusEvent.confidence;
    factors++;
  }

  return factors > 0 ? Math.min(score, 1) : 0;
}

// ===========================
// 질병 증거 점수 (v4 로직 이식)
// ===========================

function calcDiseaseEvidenceScore(
  temperature: number | null,
  rumDeltaPct: number | null,
  ph: number | null,
  events: readonly { type: string; confidence: number }[],
): number {
  let score = 0;
  let factors = 0;

  // 발열 (>39.5°C)
  if (temperature !== null) {
    if (temperature >= 40.0) {
      score += 0.4;
    } else if (temperature >= 39.5) {
      score += 0.2;
    }
    factors++;
  }

  // 반추 감소 (>25%)
  if (rumDeltaPct !== null) {
    if (rumDeltaPct < -40) {
      score += 0.3;
    } else if (rumDeltaPct < -25) {
      score += 0.2;
    }
    factors++;
  }

  // pH 이상
  if (ph !== null) {
    if (ph <= 5.5) {
      score += 0.3; // 산독증
    } else if (ph >= 7.2) {
      score += 0.2; // 알칼리증
    }
    factors++;
  }

  // smaXtec 건강 이벤트
  const healthEvent = events.find((e) => e.type === 'health_warning');
  if (healthEvent) {
    score += 0.3 * healthEvent.confidence;
    factors++;
  }

  return factors > 0 ? Math.min(score, 1) : 0;
}

// ===========================
// 데이터 품질 점수 (v4 이식)
// ===========================

function calcDataQuality(
  current: { temperature: number | null; activity: number | null; rumination: number | null; waterIntake: number | null; ph: number | null },
  history: readonly SensorSnapshot[],
): number {
  let score = 0;

  // 센서별 유무 × 가중치
  const checks: Array<[number | null, string]> = [
    [current.temperature, 'temperature'],
    [current.activity, 'activity'],
    [current.rumination, 'rumination'],
    [current.waterIntake, 'water_intake'],
    [current.ph, 'ph'],
  ];

  for (const [val, metric] of checks) {
    const weight = DATA_QUALITY_WEIGHTS[metric as keyof typeof DATA_QUALITY_WEIGHTS] ?? 0;
    if (val !== null) {
      // 범위 확인
      const range = SENSOR_RANGE_MAP[metric as keyof typeof SENSOR_RANGE_MAP];
      if (range && val >= range.min && val <= range.max) {
        score += weight * 100; // 정상 범위 내
      } else {
        score += weight * 60; // 값은 있지만 범위 밖
      }
    }
  }

  // 히스토리 양 보너스 (최대 20점)
  const historyBonus = Math.min(history.length / 24, 1) * 20;
  score += historyBonus;

  return Math.min(Math.round(score), 100);
}

// ===========================
// 유틸리티
// ===========================

type SensorField = 'temperature' | 'rumination' | 'activity' | 'waterIntake' | 'ph';

function calcAvg(snapshots: readonly SensorSnapshot[], field: SensorField): number | null {
  const values = snapshots.map((s) => s[field]).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calcMax(snapshots: readonly SensorSnapshot[], field: SensorField): number | null {
  const values = snapshots.map((s) => s[field]).filter((v): v is number => v !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

function calcMin(snapshots: readonly SensorSnapshot[], field: SensorField): number | null {
  const values = snapshots.map((s) => s[field]).filter((v): v is number => v !== null);
  return values.length > 0 ? Math.min(...values) : null;
}

function calcDeltaPercent(current: number | null, avg: number | null): number | null {
  if (current === null || avg === null || avg === 0) return null;
  return ((current - avg) / avg) * 100;
}

function calcTemperatureTrend(
  snapshots: readonly SensorSnapshot[],
): 'rising' | 'falling' | 'stable' | 'unknown' {
  const temps = snapshots
    .map((s) => s.temperature)
    .filter((v): v is number => v !== null);

  if (temps.length < 3) return 'unknown';

  // 최근 6시간 vs 이전 비교
  const recentCount = Math.min(6, Math.floor(temps.length / 2));
  const recent = temps.slice(0, recentCount);
  const earlier = temps.slice(recentCount);

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;

  const diff = recentAvg - earlierAvg;
  if (diff > 0.15) return 'rising';
  if (diff < -0.15) return 'falling';
  return 'stable';
}
