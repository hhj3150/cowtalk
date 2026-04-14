/**
 * 소버린 알람 룰 레지스트리 — 전체 룰 등록 + 카테고리별 조회
 * 24종 독립 알람: 기존 질병 6종 + 신규 18종
 */

import type { RuleDefinition } from '../types.js';

// 질병 리스크 (기존 5종 + heat_stress + 대사성 3종)
import {
  ruleKetosisRisk, ruleMastitisRisk, ruleAcidosisRisk, ruleLaminitisRisk, ruleHeatStressRisk,
  ruleMilkFever, ruleRetainedPlacenta, ruleDownerCow,
} from './disease-risk.rules.js';

// 체온 (3종)
import { ruleTemperatureHigh, ruleTemperatureLow, ruleTemperatureWarning } from './temperature.rules.js';

// 반추 (2종)
import { ruleRuminationDecrease, ruleRuminationWarning } from './rumination.rules.js';

// 활동량 (3종)
import { ruleActivityIncrease, ruleActivityDecrease, ruleActivityWarning } from './activity.rules.js';

// 발정 (2종)
import { ruleEstrus, ruleEstrusDnb } from './estrus.rules.js';

// 분만 (3종)
import { ruleCalvingDetection, ruleCalvingWaiting, ruleAbortion } from './calving.rules.js';

// 복합 (2종)
import { ruleHealthGeneral, ruleClinicalCondition } from './composite.rules.js';

// 사양/음수 (3종)
import { ruleFeedingWarning, ruleWaterIntakeAnomaly } from './feeding.rules.js';

const RULE_REGISTRY: readonly RuleDefinition[] = [
  // ── 질병 리스크 (기존) ──
  { eventType: 'ketosis_risk',    category: 'disease',     rule: ruleKetosisRisk },
  { eventType: 'mastitis_risk',   category: 'disease',     rule: ruleMastitisRisk },
  { eventType: 'acidosis_risk',   category: 'disease',     rule: ruleAcidosisRisk },
  { eventType: 'laminitis_risk',  category: 'disease',     rule: ruleLaminitisRisk },
  { eventType: 'heat_stress',     category: 'disease',     rule: ruleHeatStressRisk },
  { eventType: 'milk_fever',      category: 'disease',     rule: ruleMilkFever },
  { eventType: 'retained_placenta', category: 'disease',   rule: ruleRetainedPlacenta },
  { eventType: 'downer_cow',      category: 'disease',     rule: ruleDownerCow },

  // ── 체온 (신규) ──
  { eventType: 'temperature_high',    category: 'temperature', rule: ruleTemperatureHigh },
  { eventType: 'temperature_low',     category: 'temperature', rule: ruleTemperatureLow },
  { eventType: 'temperature_warning', category: 'temperature', rule: ruleTemperatureWarning },

  // ── 반추 (신규) ──
  { eventType: 'rumination_decrease', category: 'rumination', rule: ruleRuminationDecrease },
  { eventType: 'rumination_warning',  category: 'rumination', rule: ruleRuminationWarning },

  // ── 활동량 (신규) ──
  { eventType: 'activity_increase', category: 'activity', rule: ruleActivityIncrease },
  { eventType: 'activity_decrease', category: 'activity', rule: ruleActivityDecrease },
  { eventType: 'activity_warning',  category: 'activity', rule: ruleActivityWarning },

  // ── 발정 (신규) ──
  { eventType: 'estrus',     category: 'estrus', rule: ruleEstrus },
  { eventType: 'estrus_dnb', category: 'estrus', rule: ruleEstrusDnb },

  // ── 분만 (신규) ──
  { eventType: 'calving_detection', category: 'calving', rule: ruleCalvingDetection },
  { eventType: 'calving_waiting',   category: 'calving', rule: ruleCalvingWaiting },
  { eventType: 'abortion',          category: 'calving', rule: ruleAbortion },

  // ── 복합 건강 (신규) ──
  { eventType: 'health_general',     category: 'composite', rule: ruleHealthGeneral },
  { eventType: 'clinical_condition', category: 'composite', rule: ruleClinicalCondition },

  // ── 사양/음수 (기존 이동 + 신규) ──
  { eventType: 'feeding_warning',  category: 'feeding', rule: ruleFeedingWarning },
  { eventType: 'water_decrease',   category: 'feeding', rule: ruleWaterIntakeAnomaly },
  // water_increase는 ruleWaterIntakeAnomaly가 양방향 처리
];

export function getAllRules(): readonly RuleDefinition[] {
  return RULE_REGISTRY;
}

export function getRulesByCategory(category: string): readonly RuleDefinition[] {
  return RULE_REGISTRY.filter(r => r.category === category);
}

export function getRuleCount(): number {
  return RULE_REGISTRY.length;
}

/** 센서 탐지 가능한 smaXtec 이벤트 타입 목록 (비교 엔진에서 사용) */
export const SENSOR_DETECTABLE_EVENT_TYPES: readonly string[] = RULE_REGISTRY.map(r => r.eventType);
