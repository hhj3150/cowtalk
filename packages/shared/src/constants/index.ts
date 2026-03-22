export { ROLES, ROLE_MAP, PERMISSION_MATRIX, hasPermission, getPermissionsForRole } from './roles.js';
export { ENGINES, ENGINE_MAP, ENGINE_IDS } from './engines.js';
export type { EngineDefinition } from './engines.js';
export {
  SENSOR_NORMAL_RANGES,
  SENSOR_RANGE_MAP,
  ALERT_THRESHOLDS,
  ESTRUS_WEIGHTS,
  ESTRUS_THRESHOLDS,
  ESTRUS_TIMING,
  PARITY_ADJUSTMENTS,
  BREEDING_DIM_RANGE,
  DISEASE_MIN_SCORES,
  URGENCY_HOURS,
  FUSION_THRESHOLDS,
  DATA_QUALITY_WEIGHTS,
  DATA_QUALITY_GRADES,
  ALERT_COOLDOWN_HOURS,
  REFRESH_INTERVALS,
} from './thresholds.js';
export {
  BREED_CONFIGS,
  COMMON_METRICS,
  getMetricsForBreed,
  resolveBreedType,
} from './breed-config.js';
export type { BreedConfig } from './breed-config.js';
export {
  CLUSTER_DETECTION,
  ALERT_LEVEL_THRESHOLDS,
  SPREAD_RATE,
  PROXIMITY_RISK_RADIUS,
  ESCALATION_TARGETS,
  EPIDEMIC_SCAN_INTERVAL_MS,
  EPIDEMIC_RELEVANT_EVENT_TYPES,
  DISEASE_PATTERN_MAP,
} from './epidemic-thresholds.js';
