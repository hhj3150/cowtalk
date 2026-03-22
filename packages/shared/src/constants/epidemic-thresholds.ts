// 전염병 조기경보 임계값 상수

// ======================================================================
// 클러스터 감지 임계값
// ======================================================================

export const CLUSTER_DETECTION = {
  /** 클러스터 최소 농장 수 */
  MIN_FARMS: 3,
  /** 클러스터 탐색 반경 (km) */
  RADIUS_KM: 30,
  /** 이벤트 감지 시간 윈도우 (시간) */
  TIME_WINDOW_HOURS: 72,
  /** 농장당 최소 유사 이벤트 수 */
  MIN_EVENTS_PER_FARM: 2,
  /** 클러스터 내 최소 총 이벤트 수 */
  MIN_TOTAL_EVENTS: 5,
} as const;

// ======================================================================
// 경보 레벨 기준
// ======================================================================

export const ALERT_LEVEL_THRESHOLDS = {
  /** watch: 3개 이상 농장에서 유사 건강 이벤트 */
  WATCH: {
    minFarms: 3,
    minEvents: 5,
  },
  /** warning: 5개 이상 농장, 확산 중 */
  WARNING: {
    minFarms: 5,
    minEvents: 10,
    minSpreadRate: 0.5, // farms/day
  },
  /** outbreak: 10개 이상 농장 또는 급속 확산 */
  OUTBREAK: {
    minFarms: 10,
    minEvents: 20,
    minSpreadRate: 1.0, // farms/day
  },
} as const;

// ======================================================================
// 확산 속도 분류
// ======================================================================

export const SPREAD_RATE = {
  /** 느림: 주당 1개 농장 미만 */
  SLOW: 0.14, // ~1 farm/week
  /** 보통: 주당 2~3개 농장 */
  MODERATE: 0.43, // ~3 farms/week
  /** 빠름: 주당 3개 이상 */
  FAST: 0.43,
} as const;

// ======================================================================
// 근접성 위험 반경 (km)
// ======================================================================

export const PROXIMITY_RISK_RADIUS = {
  /** 즉각 위험: 5km 이내 */
  IMMEDIATE: 5,
  /** 높은 위험: 10km 이내 */
  HIGH: 10,
  /** 중간 위험: 20km 이내 */
  MEDIUM: 20,
  /** 모니터링: 50km 이내 */
  MONITORING: 50,
} as const;

// ======================================================================
// 에스컬레이션 대상 역할
// ======================================================================

export const ESCALATION_TARGETS = {
  watch: ['farmer', 'veterinarian'] as readonly string[],
  warning: ['farmer', 'veterinarian', 'quarantine_officer'] as readonly string[],
  outbreak: ['farmer', 'veterinarian', 'quarantine_officer', 'government_admin'] as readonly string[],
} as const;

// ======================================================================
// 스캔 주기 (ms)
// ======================================================================

export const EPIDEMIC_SCAN_INTERVAL_MS = 30 * 60 * 1000; // 30분

// ======================================================================
// 건강 이벤트 타입 (전염병 관련)
// ======================================================================

export const EPIDEMIC_RELEVANT_EVENT_TYPES = [
  'health_warning',
  'temperature_warning',
  'health_101', // Temperature alarm
  'health_102', // Activity drop
  'health_103', // Rumination drop
  'health_104', // Drinking drop
  'health_201', // Temperature + Activity
  'health_202', // Temperature + Rumination
  'health_301', // Temperature + Activity + Rumination
  'health_310', // All 4 symptoms
  'clinical_condition_401', // Clinical condition
  'clinical_condition_402',
  'clinical_condition_403',
] as const;

// ======================================================================
// 질병 유형 분류 (이벤트 패턴 → 질병명)
// ======================================================================

export const DISEASE_PATTERN_MAP: Record<string, string> = {
  'temperature_warning': 'fever_syndrome',
  'health_101': 'fever_syndrome',
  'health_102': 'lethargy_syndrome',
  'health_103': 'digestive_disorder',
  'health_104': 'dehydration_risk',
  'health_201': 'acute_infection',
  'health_202': 'respiratory_infection',
  'health_301': 'severe_systemic',
  'health_310': 'critical_systemic',
  'clinical_condition_401': 'clinical_disease',
  'clinical_condition_402': 'clinical_disease',
  'clinical_condition_403': 'clinical_disease',
};
