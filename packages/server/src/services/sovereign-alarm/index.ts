/**
 * 소버린 알람 모듈 — 재수출 (기존 import 호환)
 */

export type {
  SovereignAlarm,
  DailySummary,
  AnimalProfile,
  SaveSovereignLabelInput,
  SovereignAlarmAccuracy,
  RuleFunction,
  RuleDefinition,
} from './types.js';

export { generateSovereignAlarms } from './orchestrator.js';
export { saveSovereignAlarmLabel, getSovereignAlarmAccuracy } from './label.service.js';
export { getBatchDailySummaries } from './data-loader.js';
export { getAllRules, getRulesByCategory, getRuleCount, SENSOR_DETECTABLE_EVENT_TYPES } from './rules/rule-registry.js';
export { extractPatternFeatures, computePatternSummaries, findSimilarPatterns, runPatternMining } from './pattern-mining.service.js';
export type { PatternFeatures, PatternSummary, PatternMiningResult } from './pattern-mining.service.js';
