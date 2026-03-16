// AI 엔진 ID, 라벨, 설명 (v4 이식)

import type { EngineType } from '../types/prediction';

export interface EngineDefinition {
  readonly id: EngineType;
  readonly label: string;
  readonly labelKo: string;
  readonly description: string;
  readonly version: string;
  readonly modelType: 'rule_based' | 'ml' | 'hybrid';
  readonly inputMetrics: readonly string[];
  readonly outputCategory: string;
}

export const ENGINES: readonly EngineDefinition[] = [
  {
    id: 'estrus',
    label: 'Estrus Detection',
    labelKo: '발정 감지',
    description: '센서 시그니처(50%) + 이벤트(30%) + 번식 주기(20%) 기반 발정 감지',
    version: '5.0.0',
    modelType: 'rule_based',
    inputMetrics: ['temperature', 'activity', 'rumination', 'water_intake'],
    outputCategory: 'estrus_candidate',
  },
  {
    id: 'disease',
    label: 'Disease Warning',
    labelKo: '질병 경고',
    description: '다중 센서 이상 탐지 → 7개 질병 패턴 매칭',
    version: '5.0.0',
    modelType: 'rule_based',
    inputMetrics: ['temperature', 'activity', 'rumination', 'water_intake', 'ph'],
    outputCategory: 'health_risk',
  },
  {
    id: 'pregnancy',
    label: 'Pregnancy Prediction',
    labelKo: '임신 예측',
    description: '수정 후 센서 안정성 추적 기반 임신 예측',
    version: '5.0.0',
    modelType: 'rule_based',
    inputMetrics: ['temperature', 'activity', 'rumination'],
    outputCategory: 'pregnancy_status',
  },
  {
    id: 'herd',
    label: 'Herd Abnormality',
    labelKo: '군집 이상',
    description: '군 단위 클러스터링 이상 탐지',
    version: '5.0.0',
    modelType: 'rule_based',
    inputMetrics: ['temperature', 'activity', 'rumination', 'water_intake'],
    outputCategory: 'herd_anomaly',
  },
  {
    id: 'regional',
    label: 'Regional Intelligence',
    labelKo: '지역 인텔리전스',
    description: '다중 농장 감시 + 조기 경보 신호',
    version: '5.0.0',
    modelType: 'rule_based',
    inputMetrics: ['temperature', 'activity', 'rumination'],
    outputCategory: 'regional_warning',
  },
] as const;

export const ENGINE_MAP: Readonly<Record<EngineType, EngineDefinition>> = Object.fromEntries(
  ENGINES.map((e) => [e.id, e]),
) as Record<EngineType, EngineDefinition>;

export const ENGINE_IDS: readonly EngineType[] = ENGINES.map((e) => e.id);
