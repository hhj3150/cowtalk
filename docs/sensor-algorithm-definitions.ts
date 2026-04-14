/**
 * 위내센서 알람 알고리즘 정의 — D2O Corp IP
 *
 * smaXtec 53.6만 건 이벤트 + 7,253두 센서 데이터를 역분석하여 도출.
 * 자체 센서 개발 시 이 파일을 그대로 사용하여 알람 엔진을 구현할 수 있음.
 *
 * 작성일: 2026-04-15
 * 데이터 근거: sensor-algorithm-report.md 참조
 */

// ─── 센서 측정값 타입 ───────────────────────────────────────────

export interface SensorReading {
  readonly timestamp: Date;
  readonly temperature: number;   // °C (위내 체온)
  readonly rumination: number;    // 분/일 (반추 시간)
  readonly activity: number;      // index (3축 가속도 기반)
}

export interface DailySummary {
  readonly date: string;          // YYYY-MM-DD
  readonly tempAvg: number;
  readonly tempMin: number;
  readonly tempMax: number;
  readonly rumTotal: number;      // 분/일
  readonly actAvg: number;
}

// ─── 정상 베이스라인 (실측 근거) ────────────────────────────────

/** 건강한 소 정상 범위 (146농장 5,099 샘플) */
export const NORMAL_BASELINE = {
  temperature: {
    mean: 38.48,
    std: 2.37,
    p05: 37.25,
    p25: 38.40,
    p50: 38.80,
    p75: 39.18,
    p95: 39.60,
  },
  rumination: {
    mean: 519.8,
    std: 61.2,
    p05: 412.9,
    p25: 487.3,
    p50: 524.6,
    p75: 560.2,
    p95: 608.9,
    unit: 'minutes/day',
  },
  activity: {
    mean: 2.84,
    std: 1.50,
    p05: 0.86,
    p25: 1.83,
    p50: 2.61,
    p75: 3.62,
    p95: 5.58,
    unit: 'index',
  },
} as const;

// ─── 알람 타입 정의 ─────────────────────────────────────────────

export type AlarmCategory =
  | 'temperature'  // 체온 이상
  | 'rumination'   // 반추 이상
  | 'activity'     // 활동량 이상
  | 'estrus'       // 발정
  | 'calving'      // 분만
  | 'health'       // 건강
  | 'breeding'     // 번식 관리
  | 'management';  // 관리

export type Severity = 'info' | 'caution' | 'warning' | 'critical';

export interface AlarmDefinition {
  readonly type: string;
  readonly category: AlarmCategory;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly description: string;
  readonly smaxtecEventCount: number;   // 실제 관측 이벤트 수
  readonly sensorBased: boolean;        // 센서 기반 여부 (vs 사용자 입력)
  readonly thresholds: AlarmThresholds;
  readonly clinicalSignificance: string;
  readonly differentialDiagnosis: readonly string[];
}

export interface AlarmThresholds {
  readonly primaryMetric: 'temperature' | 'rumination' | 'activity' | 'composite';
  readonly conditions: readonly ThresholdCondition[];
  readonly severityRules: readonly SeverityRule[];
  readonly excludeConditions?: readonly string[];
}

export interface ThresholdCondition {
  readonly metric: string;
  readonly operator: '>' | '<' | '>=' | '<=' | 'change>' | 'change<' | 'pctChange>' | 'pctChange<';
  readonly value: number;
  readonly windowDays: number;        // 비교 기간 (일)
  readonly comparedTo: 'absolute' | 'individual_baseline' | 'previous_period';
  readonly description: string;
}

export interface SeverityRule {
  readonly severity: Severity;
  readonly condition: string;         // 사람이 읽을 수 있는 조건
  readonly metricThreshold: number;
}

// ─── 11종 센서 기반 알람 정의 ───────────────────────────────────

export const SENSOR_ALARM_DEFINITIONS: readonly AlarmDefinition[] = [

  // ===== 체온 =====
  {
    type: 'temperature_high',
    category: 'temperature',
    nameKo: '고열',
    nameEn: 'High Temperature',
    description: '위내 체온이 정상 범위를 초과. 감염, 염증, 열스트레스 등 의심.',
    smaxtecEventCount: 77139,
    sensorBased: true,
    thresholds: {
      primaryMetric: 'temperature',
      conditions: [
        {
          metric: 'temperature',
          operator: '>',
          value: 39.4,
          windowDays: 1,
          comparedTo: 'absolute',
          description: '일평균 체온 39.4°C 초과',
        },
        {
          metric: 'temperature',
          operator: 'change>',
          value: 0.4,
          windowDays: 3,
          comparedTo: 'previous_period',
          description: '이전 3일 대비 +0.4°C 이상 상승',
        },
      ],
      severityRules: [
        { severity: 'critical', condition: '체온 > 40.5°C', metricThreshold: 40.5 },
        { severity: 'warning', condition: '체온 > 39.7°C', metricThreshold: 39.7 },
        { severity: 'caution', condition: '체온 > 39.4°C', metricThreshold: 39.4 },
      ],
    },
    clinicalSignificance: '유방염, 폐렴, 자궁내막염, 열스트레스. 체온 40°C 이상은 즉시 수의사 필요.',
    differentialDiagnosis: ['유방염', '폐렴(BRD)', '자궁내막염', '열스트레스', '산독증'],
  },

  {
    type: 'temperature_low',
    category: 'temperature',
    nameKo: '저체온',
    nameEn: 'Low Temperature',
    description: '위내 체온이 정상 이하로 하강. 분만 임박, 저체온증, 센서 이상 감별.',
    smaxtecEventCount: 31222,
    sensorBased: true,
    thresholds: {
      primaryMetric: 'temperature',
      conditions: [
        {
          metric: 'temperature',
          operator: '<',
          value: 37.5,
          windowDays: 1,
          comparedTo: 'absolute',
          description: '일평균 체온 37.5°C 미만',
        },
        {
          metric: 'temperature',
          operator: 'change<',
          value: -0.3,
          windowDays: 3,
          comparedTo: 'previous_period',
          description: '이전 3일 대비 -0.3°C 이상 하강',
        },
      ],
      severityRules: [
        { severity: 'warning', condition: '체온 < 37.0°C', metricThreshold: 37.0 },
        { severity: 'caution', condition: '체온 < 37.5°C', metricThreshold: 37.5 },
      ],
      excludeConditions: ['건유우 분만 직전 정상 하강과 구분 필요'],
    },
    clinicalSignificance: '분만 전 24~48시간 정상 하강. 비임신우 저체온은 쇼크/패혈증 의심.',
    differentialDiagnosis: ['분만 임박(정상)', '저체온증', '센서 이탈', '과음수(냉수)'],
  },

  // ===== 반추 =====
  {
    type: 'rumination_decrease',
    category: 'rumination',
    nameKo: '반추 감소',
    nameEn: 'Rumination Decrease',
    description: '반추 시간이 정상 대비 15% 이상 감소. 가장 빈번한 비특이적 건강 이상 지표.',
    smaxtecEventCount: 108728,
    sensorBased: true,
    thresholds: {
      primaryMetric: 'rumination',
      conditions: [
        {
          metric: 'rumination',
          operator: 'pctChange<',
          value: -15,
          windowDays: 3,
          comparedTo: 'previous_period',
          description: '최근 3일 반추가 이전 4~7일 대비 15% 이상 감소',
        },
        {
          metric: 'rumination',
          operator: '<',
          value: 420,
          windowDays: 3,
          comparedTo: 'absolute',
          description: '최근 3일 반추 평균 420분/일 미만',
        },
      ],
      severityRules: [
        { severity: 'warning', condition: '감소율 > 30%', metricThreshold: -30 },
        { severity: 'caution', condition: '감소율 > 15%', metricThreshold: -15 },
      ],
    },
    clinicalSignificance: '가장 빈번한 알람. 단독으로는 진단 불가. 체온+활동과 조합 필요.',
    differentialDiagnosis: ['케토시스', '산독증(SARA)', '유방염', '사료 변경', '스트레스', '제엽염'],
  },

  // ===== 활동 =====
  {
    type: 'activity_increase',
    category: 'activity',
    nameKo: '활동량 급증',
    nameEn: 'Activity Increase',
    description: '활동량이 평소의 1.5배 이상 증가. 발정, 통증, 불안 감별.',
    smaxtecEventCount: 49829,
    sensorBased: true,
    thresholds: {
      primaryMetric: 'activity',
      conditions: [
        {
          metric: 'activity',
          operator: 'pctChange>',
          value: 40,
          windowDays: 1,
          comparedTo: 'individual_baseline',
          description: '개체별 7일 평균 대비 40% 이상 증가',
        },
      ],
      severityRules: [
        { severity: 'warning', condition: '증가율 > 100%', metricThreshold: 100 },
        { severity: 'caution', condition: '증가율 > 40%', metricThreshold: 40 },
      ],
    },
    clinicalSignificance: '발정 행동(60.4%↑)과 유사. 반추 동반 감소+체온 무변화면 발정 가능성 높음.',
    differentialDiagnosis: ['발정', '통증(산통/복통)', '환경 스트레스', '군집 이동'],
  },

  {
    type: 'activity_decrease',
    category: 'activity',
    nameKo: '활동량 급감',
    nameEn: 'Activity Decrease',
    description: '활동량이 평소의 50% 이하로 감소. 파행, 중증 질환 의심.',
    smaxtecEventCount: 9813,
    sensorBased: true,
    thresholds: {
      primaryMetric: 'activity',
      conditions: [
        {
          metric: 'activity',
          operator: 'pctChange<',
          value: -40,
          windowDays: 1,
          comparedTo: 'individual_baseline',
          description: '개체별 7일 평균 대비 40% 이상 감소',
        },
      ],
      severityRules: [
        { severity: 'warning', condition: '감소율 > 50%', metricThreshold: -50 },
        { severity: 'caution', condition: '감소율 > 40%', metricThreshold: -40 },
      ],
    },
    clinicalSignificance: '제엽염(파행)의 핵심 지표. 반추 동반 감소(-12.7%) 시 전신질환.',
    differentialDiagnosis: ['제엽염(파행)', '외상', '중증 질환(기립불능)', '환경 요인'],
  },

  // ===== 발정 =====
  {
    type: 'estrus',
    category: 'estrus',
    nameKo: '발정',
    nameEn: 'Estrus Detection',
    description: '활동 +60%, 반추 -14% 복합 패턴으로 발정 감지. 수정 적기 판단의 핵심.',
    smaxtecEventCount: 75850,
    sensorBased: true,
    thresholds: {
      primaryMetric: 'composite',
      conditions: [
        {
          metric: 'activity',
          operator: 'pctChange>',
          value: 40,
          windowDays: 1,
          comparedTo: 'individual_baseline',
          description: '활동량 개체 평균 대비 40% 이상 증가 (실측 평균 +60.4%)',
        },
        {
          metric: 'rumination',
          operator: 'pctChange<',
          value: -10,
          windowDays: 1,
          comparedTo: 'individual_baseline',
          description: '반추 10% 이상 감소 동반 (실측 평균 -13.6%)',
        },
        {
          metric: 'temperature',
          operator: 'change<',
          value: 1.0,
          windowDays: 1,
          comparedTo: 'previous_period',
          description: '체온 변화 +1.0°C 미만 (열성 질환 배제)',
        },
      ],
      severityRules: [
        { severity: 'info', condition: '발정 감지', metricThreshold: 0 },
      ],
      excludeConditions: [
        'DIM < 20일 (분만 후 자궁 회복기)',
        '건유우/임신 확인 개체',
        '직전 발정 14일 이내 (비현실적 간격)',
      ],
    },
    clinicalSignificance: '수정 적기는 발정 시작 후 12~18시간. 수태율에 직결되는 최고 가치 알람.',
    differentialDiagnosis: ['난소낭종(지속 발정)', '자궁내막염(위양성)', '환경 요인'],
  },

  // ===== 분만 =====
  {
    type: 'calving_detection',
    category: 'calving',
    nameKo: '분만 감지',
    nameEn: 'Calving Detection',
    description: '체온 -0.3°C 하강 + 반추 감소 + 활동 불규칙으로 분만 임박 감지.',
    smaxtecEventCount: 17702,
    sensorBased: true,
    thresholds: {
      primaryMetric: 'composite',
      conditions: [
        {
          metric: 'temperature',
          operator: 'change<',
          value: -0.3,
          windowDays: 1,
          comparedTo: 'individual_baseline',
          description: '24시간 내 체온 -0.3°C 이상 하강 (실측 평균 -0.32°C)',
        },
        {
          metric: 'rumination',
          operator: 'pctChange<',
          value: -5,
          windowDays: 1,
          comparedTo: 'individual_baseline',
          description: '반추 5% 이상 감소 동반 (실측 평균 -8.2%)',
        },
      ],
      severityRules: [
        { severity: 'critical', condition: '분만 6시간 이내 예상', metricThreshold: -0.5 },
        { severity: 'warning', condition: '분만 24시간 이내 예상', metricThreshold: -0.3 },
      ],
      excludeConditions: [
        '건유우 OR 임신 후기(예상 분만일 ±15일)만 대상',
      ],
    },
    clinicalSignificance: '분만 전 24~48시간 감지. 난산 방지, 신생 송아지 관리의 핵심.',
    differentialDiagnosis: ['센서 이탈(위양성)', '저체온증', '음수 과다(냉수)'],
  },

  // ===== 건강 =====
  {
    type: 'health_general',
    category: 'health',
    nameKo: '종합 건강 이상',
    nameEn: 'General Health Alert',
    description: '체온+반추+활동 복합 이상으로 비특이적 건강 문제 감지.',
    smaxtecEventCount: 53605,
    sensorBased: true,
    thresholds: {
      primaryMetric: 'composite',
      conditions: [
        {
          metric: 'rumination',
          operator: 'pctChange<',
          value: -8,
          windowDays: 3,
          comparedTo: 'previous_period',
          description: '반추 8% 이상 감소 (실측 평균 -8.2%)',
        },
        {
          metric: 'temperature',
          operator: '>',
          value: 39.5,
          windowDays: 1,
          comparedTo: 'absolute',
          description: '체온 39.5°C 초과 동반 시',
        },
      ],
      severityRules: [
        { severity: 'warning', condition: '체온 > 40°C + 반추 > 15% 감소', metricThreshold: 40.0 },
        { severity: 'caution', condition: '반추 > 8% 감소', metricThreshold: -8 },
      ],
    },
    clinicalSignificance: '특정 질병으로 분류 불가한 복합 이상. 감별진단 필요.',
    differentialDiagnosis: ['유방염', '케토시스', '산독증', '폐렴', '자궁내막염', '제4위변위'],
  },

  {
    type: 'clinical_condition',
    category: 'health',
    nameKo: '임상 상태 이상',
    nameEn: 'Clinical Condition',
    description: 'health_general보다 심각한 수준. 체온 40°C 이상 또는 반추 20% 이상 감소.',
    smaxtecEventCount: 10207,
    sensorBased: true,
    thresholds: {
      primaryMetric: 'composite',
      conditions: [
        {
          metric: 'temperature',
          operator: '>',
          value: 40.0,
          windowDays: 1,
          comparedTo: 'absolute',
          description: '체온 40.0°C 초과 (실측 P90=40.09)',
        },
        {
          metric: 'rumination',
          operator: 'pctChange<',
          value: -20,
          windowDays: 3,
          comparedTo: 'previous_period',
          description: '반추 20% 이상 감소',
        },
      ],
      severityRules: [
        { severity: 'critical', condition: '체온 > 41°C', metricThreshold: 41.0 },
        { severity: 'warning', condition: '체온 > 40°C OR 반추 > 20% 감소', metricThreshold: 40.0 },
      ],
    },
    clinicalSignificance: '수의사 즉시 진료 필요. 중증 감염, 패혈증, 급성 질환.',
    differentialDiagnosis: ['급성 유방염(E.coli)', '급성 폐렴', '패혈증', '급성 산독증'],
  },

  // ===== 유산 =====
  {
    type: 'abortion',
    category: 'calving',
    nameKo: '유산',
    nameEn: 'Abortion',
    description: '임신 개체의 체온 진동 + 반추 급감 + 활동 급변.',
    smaxtecEventCount: 519,
    sensorBased: true,
    thresholds: {
      primaryMetric: 'composite',
      conditions: [
        {
          metric: 'temperature',
          operator: 'change>',
          value: 1.0,
          windowDays: 2,
          comparedTo: 'individual_baseline',
          description: '체온 ±1.0°C 이상 진동 (불안정)',
        },
        {
          metric: 'rumination',
          operator: 'pctChange<',
          value: -20,
          windowDays: 2,
          comparedTo: 'previous_period',
          description: '반추 20% 이상 급감',
        },
      ],
      severityRules: [
        { severity: 'critical', condition: '임신 개체 + 센서 급변', metricThreshold: 0 },
      ],
      excludeConditions: ['임신 확인 개체만 대상'],
    },
    clinicalSignificance: '전염성 질환(브루셀라, BVD, 네오스포라) 감별 필수. 역학조사 트리거.',
    differentialDiagnosis: ['브루셀라', 'BVD', '네오스포라', '곰팡이독소', '스트레스'],
  },
];

// ─── 9종 사용자 입력 기반 이벤트 ────────────────────────────────

export const USER_INPUT_EVENTS = [
  { type: 'insemination',         nameKo: '수정 기록',       count: 36560 },
  { type: 'pregnancy_check',      nameKo: '임신 감정',       count: 18464 },
  { type: 'fertility_warning',    nameKo: '번식 경고',       count: 18032 },
  { type: 'calving_confirmation', nameKo: '분만 확인',       count: 16461 },
  { type: 'dry_off',              nameKo: '건유',            count: 7600 },
  { type: 'no_insemination',      nameKo: '미수정(DNB)',     count: 3530 },
  { type: 'calving_waiting',      nameKo: '분만 대기',       count: 570 },
  { type: 'management',           nameKo: '관리 이벤트',     count: 320 },
  { type: 'feeding_warning',      nameKo: '사양 경고',       count: 204 },
] as const;

// ─── 알람 간 연관 관계 ──────────────────────────────────────────

export interface AlarmCorrelation {
  readonly source: string;
  readonly related: string;
  readonly relationship: 'precedes' | 'accompanies' | 'escalates_to' | 'differentiates';
  readonly description: string;
}

export const ALARM_CORRELATIONS: readonly AlarmCorrelation[] = [
  { source: 'rumination_decrease', related: 'health_general',     relationship: 'precedes',        description: '반추 감소 후 12~48시간 내 건강 이상 발생 빈도 높음' },
  { source: 'health_general',      related: 'clinical_condition', relationship: 'escalates_to',    description: '건강 이상이 악화되면 임상 상태 이상으로 격상' },
  { source: 'temperature_high',    related: 'rumination_decrease', relationship: 'accompanies',     description: '고열 시 반추 동반 감소 (평균 -20.5분/일)' },
  { source: 'activity_increase',   related: 'estrus',              relationship: 'differentiates',  description: '활동 증가 + 반추 감소 + 체온 무변화 → 발정' },
  { source: 'activity_increase',   related: 'health_general',      relationship: 'differentiates',  description: '활동 증가 + 체온 상승 → 통증/질환' },
  { source: 'temperature_low',     related: 'calving_detection',   relationship: 'precedes',        description: '체온 하강 → 24~48시간 후 분만' },
  { source: 'activity_decrease',   related: 'clinical_condition',  relationship: 'accompanies',     description: '활동 급감 + 반추 급감 → 중증 질환' },
  { source: 'rumination_decrease', related: 'estrus',              relationship: 'accompanies',     description: '발정 시 반추 감소 동반 (평균 -13.6%)' },
];

// ─── 감별진단 매트릭스 ──────────────────────────────────────────

export interface DiseaseSignature {
  readonly disease: string;
  readonly diseaseKo: string;
  readonly tempPattern: 'high' | 'low' | 'normal' | 'fluctuating';
  readonly rumPattern: 'decreased' | 'normal' | 'severely_decreased';
  readonly actPattern: 'increased' | 'decreased' | 'normal';
  readonly tempDelta: number;      // 정상 대비 °C 변화
  readonly rumDeltaPct: number;    // 정상 대비 % 변화
  readonly actDeltaPct: number;    // 정상 대비 % 변화
  readonly confirmatoryTests: readonly string[];
}

export const DISEASE_SIGNATURES: readonly DiseaseSignature[] = [
  {
    disease: 'mastitis',
    diseaseKo: '유방염',
    tempPattern: 'high',
    rumPattern: 'decreased',
    actPattern: 'decreased',
    tempDelta: +0.8,
    rumDeltaPct: -15,
    actDeltaPct: -10,
    confirmatoryTests: ['CMT 검사', '유즙 세균배양', 'SCC 체세포수'],
  },
  {
    disease: 'ketosis',
    diseaseKo: '케토시스',
    tempPattern: 'normal',
    rumPattern: 'severely_decreased',
    actPattern: 'decreased',
    tempDelta: 0,
    rumDeltaPct: -25,
    actDeltaPct: -15,
    confirmatoryTests: ['뇨 케톤 스트립', '혈중 BHBA', '유즙 케톤'],
  },
  {
    disease: 'acidosis',
    diseaseKo: '반추위 산독증(SARA)',
    tempPattern: 'normal',
    rumPattern: 'severely_decreased',
    actPattern: 'normal',
    tempDelta: 0,
    rumDeltaPct: -30,
    actDeltaPct: 0,
    confirmatoryTests: ['반추위 천자 pH', '분변 점수', 'TMR 입자도 분석'],
  },
  {
    disease: 'pneumonia',
    diseaseKo: '폐렴(BRD)',
    tempPattern: 'high',
    rumPattern: 'decreased',
    actPattern: 'decreased',
    tempDelta: +1.2,
    rumDeltaPct: -20,
    actDeltaPct: -20,
    confirmatoryTests: ['폐 청진', '비강 면봉 PCR', '흉부 초음파'],
  },
  {
    disease: 'metritis',
    diseaseKo: '자궁내막염',
    tempPattern: 'high',
    rumPattern: 'decreased',
    actPattern: 'decreased',
    tempDelta: +0.6,
    rumDeltaPct: -12,
    actDeltaPct: -10,
    confirmatoryTests: ['질 분비물 관찰', '직장검사', '자궁 초음파'],
  },
  {
    disease: 'lda',
    diseaseKo: '제4위변위(LDA)',
    tempPattern: 'normal',
    rumPattern: 'severely_decreased',
    actPattern: 'decreased',
    tempDelta: 0,
    rumDeltaPct: -35,
    actDeltaPct: -25,
    confirmatoryTests: ['좌측 복벽 청타진(핑음)', '동시 청진-타진', '직장검사'],
  },
  {
    disease: 'laminitis',
    diseaseKo: '제엽염(파행)',
    tempPattern: 'normal',
    rumPattern: 'decreased',
    actPattern: 'decreased',
    tempDelta: 0,
    rumDeltaPct: -10,
    actDeltaPct: -43,
    confirmatoryTests: ['보행 관찰', '발굽 검사', '발굽삭제'],
  },
  {
    disease: 'estrus',
    diseaseKo: '발정',
    tempPattern: 'normal',
    rumPattern: 'decreased',
    actPattern: 'increased',
    tempDelta: +0.04,
    rumDeltaPct: -14,
    actDeltaPct: +60,
    confirmatoryTests: ['직장검사(난포 확인)', '유즙 프로게스테론', '승가 관찰'],
  },
  {
    disease: 'calving',
    diseaseKo: '분만 임박',
    tempPattern: 'low',
    rumPattern: 'decreased',
    actPattern: 'normal',
    tempDelta: -0.32,
    rumDeltaPct: -8,
    actDeltaPct: +5,
    confirmatoryTests: ['자궁경부 이완 확인', '유두 밀랍 탈락', '외음부 부종'],
  },
];
