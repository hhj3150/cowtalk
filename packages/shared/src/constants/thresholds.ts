// 기본 임계값 (v4 이식 — 오버라이드 가능)

import type { MetricType, SensorNormalRange } from '../types/sensor';
import type { DiseaseType } from '../types/prediction';

// === 센서 정상 범위 ===

export const SENSOR_NORMAL_RANGES: readonly SensorNormalRange[] = [
  { metricType: 'temperature', min: 38.0, max: 39.3, unit: '°C' },
  { metricType: 'activity', min: 0, max: 300, unit: 'units' },
  { metricType: 'rumination', min: 300, max: 600, unit: 'min/day' },
  { metricType: 'water_intake', min: 40, max: 120, unit: 'L/day' },
  { metricType: 'ph', min: 5.8, max: 7.0, unit: 'pH' },
] as const;

export const SENSOR_RANGE_MAP: Readonly<Record<MetricType, SensorNormalRange>> = Object.fromEntries(
  SENSOR_NORMAL_RANGES.map((r) => [r.metricType, r]),
) as Record<MetricType, SensorNormalRange>;

// === 알림 임계값 ===

export const ALERT_THRESHOLDS = {
  temperature: {
    high: 39.5,      // °C — 주의
    fever: 40.0,     // °C — 발열
    low: 37.5,       // °C — 저체온
    severe: 41.0,    // °C — 위험
  },
  activity: {
    dropPercent: 30,      // % 감소 시 경고
    surgePercent: 50,     // % 증가 시 (발정 의심)
  },
  rumination: {
    dropPercent: 25,      // % 감소 시 경고
    criticalMin: 200,     // min/day 이하 → 위험
  },
  waterIntake: {
    dropPercent: 30,      // % 감소 시 경고
    surgePercent: 40,     // % 증가 시
  },
  ph: {
    acidosis: 5.5,        // 이하 → 산독증 의심
    high: 7.2,            // 이상 → 알칼리증
  },
} as const;

// === 발정 감지 가중치 (v4 이식) ===

export const ESTRUS_WEIGHTS = {
  sensorSignature: 0.50,   // 센서 시그니처 점수
  eventHistory: 0.30,      // 이벤트 이력 점수
  cyclePrediction: 0.20,   // 번식 주기 예측 점수
} as const;

export const ESTRUS_THRESHOLDS = {
  positive: 0.65,          // 이상 → 발정 양성
  probable: 0.45,          // 이상 → 발정 가능성
  temperatureRise: { min: 0.2, max: 0.5 }, // °C — 발정 시 체온 상승 범위
} as const;

// === 발정 타이밍 (v4 이식) ===

export const ESTRUS_TIMING = {
  stages: {
    pre_estrus: { startHours: -12, endHours: 0 },
    estrus: { startHours: 0, endHours: 18 },
    post_estrus: { startHours: 18, endHours: 36 },
  },
  optimalInsemination: { startHours: 12, endHours: 18 },
} as const;

// === 산차 보정 계수 (v4 이식) ===

export const PARITY_ADJUSTMENTS: Readonly<Record<string, number>> = {
  heifer: 0.90,     // 미경산우
  parity1: 1.00,
  parity2: 1.05,
  'parity3+': 1.00,
} as const;

// === 번식 적기 DIM 범위 ===

export const BREEDING_DIM_RANGE = {
  min: 45,
  max: 150,
} as const;

// === 질병 패턴 최소 점수 (v4 이식) ===

export const DISEASE_MIN_SCORES: Readonly<Record<DiseaseType, number>> = {
  mastitis: 40,
  ketosis: 35,
  milk_fever: 45,
  acidosis: 40,
  pneumonia: 45,
  metritis: 40,
  lameness: 35,
} as const;

// === 긴급도 매핑 (v4 이식) ===

export const URGENCY_HOURS: Readonly<Record<string, number>> = {
  critical: 2,
  high: 6,
  medium: 12,
  low: 24,
  monitor: 48,
} as const;

// === Decision Fusion 임계값 (v4 이식) ===

export const FUSION_THRESHOLDS = {
  estrusTemperature: { min: 0.2, max: 0.5 },  // °C
  diseaseTemperature: 0.5,                      // °C 이상
  severeTemperature: 1.5,                       // °C 이상
  heatStressTHI: 72,
} as const;

// === 데이터 품질 가중치 (v4 이식) ===

export const DATA_QUALITY_WEIGHTS: Readonly<Record<MetricType, number>> = {
  temperature: 0.30,
  activity: 0.25,
  rumination: 0.25,
  water_intake: 0.10,
  ph: 0.10,
} as const;

export const DATA_QUALITY_GRADES = {
  A: 90,
  B: 70,
  C: 50,
  D: 30,
} as const;

// === 알림 쿨다운 (중복 방지) ===

export const ALERT_COOLDOWN_HOURS: Readonly<Record<string, number>> = {
  health_risk: 6,
  estrus_candidate: 12,
  feeding_metabolic_risk: 12,
  productivity_drop: 24,
  herd_anomaly: 24,
  regional_warning: 48,
} as const;

// === 자동 갱신 주기 ===

export const REFRESH_INTERVALS = {
  sensorPollMs: 5 * 60 * 1000,       // 5분 — smaXtec 데이터 수집
  dashboardRefreshMs: 5 * 60 * 1000, // 5분 — 대시보드 자동 갱신
  batchDailyHour: 2,                  // 매일 02시 — 일별 집계
  batchWeeklyDay: 1,                  // 매주 월요일 — 주간 보고
} as const;
