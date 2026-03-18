// 축종별 설정 — dairy (젖소) vs beef (한우/비육우)

import type { BreedType } from '../types/profile.js';

export interface BreedConfig {
  readonly breedType: BreedType;
  readonly label: string;
  readonly labelKo: string;
  readonly metrics: readonly string[];
  readonly dataIntegrations: readonly string[];
  readonly stages: readonly string[];
  readonly kpiFields: readonly string[];
}

export const BREED_CONFIGS: Readonly<Record<BreedType, BreedConfig>> = {
  dairy: {
    breedType: 'dairy',
    label: 'Dairy',
    labelKo: '젖소',
    metrics: [
      'milk_yield', 'fat_percentage', 'protein_percentage',
      'scc', 'lactation_days', 'peak_yield',
    ],
    dataIntegrations: ['dhi', 'traceability', 'pedigree'],
    stages: [
      'dry', 'transition', 'fresh', 'early_lactation',
      'mid_lactation', 'late_lactation',
    ],
    kpiFields: [
      'avgMilkYield', 'avgSCC', 'conceptionRate',
      'heatDetectionRate', 'calvingInterval',
    ],
  },
  beef: {
    breedType: 'beef',
    label: 'Beef',
    labelKo: '한우/비육우',
    metrics: [
      'weight', 'daily_gain', 'feed_conversion',
      'grade_estimate', 'marbling_score', 'back_fat',
    ],
    dataIntegrations: ['traceability', 'pedigree', 'quality_grade'],
    stages: [
      'calf', 'growing', 'fattening_early',
      'fattening_mid', 'fattening_late', 'finishing',
    ],
    kpiFields: [
      'avgDailyGain', 'feedConversionRate',
      'gradeDistribution', 'avgShippingWeight',
    ],
  },
} as const;

export const COMMON_METRICS: readonly string[] = [
  'temperature', 'rumination', 'activity',
  'water_intake', 'ph', 'estrus', 'health',
];

/** 축종별로 사용 가능한 전체 메트릭 목록 */
export function getMetricsForBreed(breedType: BreedType): readonly string[] {
  return [...COMMON_METRICS, ...BREED_CONFIGS[breedType].metrics];
}

/** 축종 판별 (breed 문자열 → BreedType) */
export function resolveBreedType(breed: string): BreedType {
  const beefBreeds = ['hanwoo', 'angus', 'hereford', 'charolais', 'limousin', 'wagyu'];
  return beefBreeds.includes(breed.toLowerCase()) ? 'beef' : 'dairy';
}
