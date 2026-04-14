/**
 * CowTalk 핵심 알람 구현 명세 — D2O Corp IP
 *
 * 하원장님 현장 비전 + 53.6만 건 실데이터 분석 기반.
 * 자체 센서 개발 시 이 파일의 타입+알고리즘을 그대로 사용하여 구현.
 *
 * 작성일: 2026-04-15
 */

// ─── 1. 발정 발견 + 수정 코치 ──────────────────────────────────

export interface EstrusDetectionResult {
  readonly detected: boolean;
  readonly confidence: number;          // 0~100
  readonly estrusStartEstimate: Date;   // 발정 시작 추정 시각
  readonly activityChangePct: number;   // 활동 변화율 (%)
  readonly ruminationChangePct: number; // 반추 변화율 (%)
  readonly temperatureChange: number;   // 체온 변화 (°C)
}

export interface InseminationAdvice {
  readonly shouldInseminate: boolean;
  readonly reason: string;
  readonly optimalWindowStart: Date;
  readonly optimalWindowEnd: Date;
  readonly warnings: readonly string[];
}

export type InseminationDecision =
  | { readonly decision: 'inseminate_now'; readonly reason: string }
  | { readonly decision: 'too_early'; readonly reason: string }       // 육성우 나이 미달, DIM 부족
  | { readonly decision: 'health_issue'; readonly reason: string }    // 건강 문제로 보류
  | { readonly decision: 'repeat_breeder'; readonly reason: string }  // 번식장애 의심
  | { readonly decision: 'skip_cycle'; readonly reason: string }      // 이번 발정은 패스
  | { readonly decision: 'embryo_transfer'; readonly reason: string }; // 수정란 이식 대상 (발정 후 7일)

/** 수정 의견 판단 기준 */
export const INSEMINATION_DECISION_RULES = {
  // 육성우 최소 월령 (목장별 설정 가능, 기본 12개월)
  minBreedingAgeMonths: 12,
  // 분만 후 최소 DIM (자궁 회복기)
  minDaysInMilkForBreeding: 50,
  // 장기공태우 기준 DIM
  longOpenDaysDim: 200,
  // 연속 미임신 경고 기준
  repeatBreederThreshold: 3,
  // 수정란 이식 결정 시 발정 후 대기일
  embryoTransferDaysAfterEstrus: 7,
  // 건강 이벤트 체크 기간 (일)
  healthCheckWindowDays: 30,
} as const;

/** 정액 추천 3단계 */
export type SemenRecommendationLevel =
  | 'farm_inventory'    // 1단계: 목장 보유 정액
  | 'national_catalog'  // 2단계: 전국 유통 정액 (국산+수입)
  | 'global_optimal';   // 3단계: 지구상 최적 정액 (컨설팅)

export interface SemenRecommendation {
  readonly level: SemenRecommendationLevel;
  readonly semenId: string;
  readonly bullName: string;
  readonly breed: string;
  readonly score: number;               // 종합 점수
  readonly inbreedingRisk: 'low' | 'medium' | 'high';
  readonly geneticMerit: {
    readonly milkYield?: number;        // 유량 개량량 (kg)
    readonly bodyType?: number;         // 체형 점수
    readonly longevity?: number;        // 장수성
    readonly fertility?: number;        // 번식 능력
  };
  readonly pastConceptionRate: number | null;  // 목장 내 과거 수태율
  readonly reasoning: string;
}

// ─── 2. 임신 유무 — 데이터 기반 ─────────────────────────────────

export interface PregnancyPrediction {
  readonly daysPostInsemination: number;
  readonly stabilityScore: number;      // 0~1
  readonly status: 'likely_pregnant' | 'uncertain' | 'likely_open';
  readonly signals: readonly PregnancySignal[];
  readonly recommendedAction: string;
}

export interface PregnancySignal {
  readonly type: 'reestrus_detected' | 'temp_stable' | 'temp_rising' | 'activity_spike' | 'dpi_milestone';
  readonly description: string;
  readonly impact: 'positive' | 'negative' | 'neutral';
  readonly value: number | null;
}

/** 임신 판단 타임라인 */
export const PREGNANCY_DETECTION_TIMELINE = {
  // 재발정 감지 윈도우 (수정 후)
  reestrusWindowStart: 18,  // DPI
  reestrusWindowEnd: 25,    // DPI
  // 1차 판정 시점
  firstAssessmentDPI: 28,
  // 안정기 진입 시점
  stablePregnancyDPI: 45,
  // 재발정 감지 기준 (활동 변화)
  reestrusActivityThresholdPct: 40,  // 개체 평균 대비 40% 이상 증가
  reestrusRuminationThresholdPct: -10,
} as const;

/** 발정동기화 프로그램 */
export type SyncProtocol = 'PG' | 'OVSYNCH' | 'G6G' | 'DOUBLE_OVSYNCH';

export interface SyncProtocolDefinition {
  readonly protocol: SyncProtocol;
  readonly nameKo: string;
  readonly description: string;
  readonly steps: readonly SyncStep[];
  readonly totalDays: number;
  readonly aiDay: number;  // 수정(AI) 시행일 (Day 0 기준)
}

export interface SyncStep {
  readonly day: number;        // Day 0 기준
  readonly treatment: string;  // 약물명
  readonly route: string;      // 투여 경로
  readonly note: string;
}

export const SYNC_PROTOCOLS: readonly SyncProtocolDefinition[] = [
  {
    protocol: 'PG',
    nameKo: 'PG법 (Prostaglandin)',
    description: 'PG₂α 2회 투여. 가장 단순한 프로토콜.',
    totalDays: 17,
    aiDay: 16,
    steps: [
      { day: 0,  treatment: 'PG₂α (Lutalyse/Estrumate)', route: 'IM', note: '1차 투여' },
      { day: 14, treatment: 'PG₂α', route: 'IM', note: '2차 투여' },
      { day: 16, treatment: '수정(AI)', route: '-', note: '2차 PG 후 48~72시간' },
    ],
  },
  {
    protocol: 'OVSYNCH',
    nameKo: 'OVSYNCH (오브싱크)',
    description: 'GnRH-PG-GnRH 프로토콜. 가장 널리 사용됨.',
    totalDays: 10,
    aiDay: 10,
    steps: [
      { day: 0, treatment: 'GnRH (Fertagyl/Cystorelin)', route: 'IM', note: '배란 동기화' },
      { day: 7, treatment: 'PG₂α', route: 'IM', note: '황체 퇴행' },
      { day: 9, treatment: 'GnRH', route: 'IM', note: '배란 유도' },
      { day: 10, treatment: '수정(AI)', route: '-', note: '2차 GnRH 후 16~20시간' },
    ],
  },
  {
    protocol: 'G6G',
    nameKo: 'G6G (Pre-OVSYNCH)',
    description: 'PG+GnRH 전처리 후 OVSYNCH. 난포 wave 동기화로 정확도 향상.',
    totalDays: 18,
    aiDay: 18,
    steps: [
      { day: 0,  treatment: 'PG₂α', route: 'IM', note: '전처리: 황체 퇴행' },
      { day: 2,  treatment: 'GnRH', route: 'IM', note: '전처리: 새 난포 wave 유도' },
      { day: 8,  treatment: 'GnRH', route: 'IM', note: 'OVSYNCH 시작' },
      { day: 15, treatment: 'PG₂α', route: 'IM', note: 'OVSYNCH PG' },
      { day: 17, treatment: 'GnRH', route: 'IM', note: '배란 유도' },
      { day: 18, treatment: '수정(AI)', route: '-', note: '2차 GnRH 후 16~20시간' },
    ],
  },
  {
    protocol: 'DOUBLE_OVSYNCH',
    nameKo: 'Double OVSYNCH (더블 오브싱크)',
    description: 'Pre-synch + OVSYNCH. 최고 수태율이나 처치 횟수 많음.',
    totalDays: 27,
    aiDay: 27,
    steps: [
      { day: 0,  treatment: 'GnRH', route: 'IM', note: 'Pre-synch 시작' },
      { day: 7,  treatment: 'PG₂α', route: 'IM', note: 'Pre-synch PG' },
      { day: 10, treatment: 'GnRH', route: 'IM', note: 'Pre-synch 완료' },
      { day: 17, treatment: 'GnRH', route: 'IM', note: 'OVSYNCH 시작' },
      { day: 24, treatment: 'PG₂α', route: 'IM', note: 'OVSYNCH PG' },
      { day: 26, treatment: 'GnRH', route: 'IM', note: '배란 유도' },
      { day: 27, treatment: '수정(AI)', route: '-', note: '2차 GnRH 후 16~20시간' },
    ],
  },
];

// ─── 3. 분만 알림 ───────────────────────────────────────────────

export interface CalvingPrediction {
  readonly expectedCalvingDate: Date;
  readonly hoursUntilCalving: number | null;  // null이면 아직 먼 시점
  readonly confidence: number;
  readonly stage: 'approaching' | 'imminent' | 'active';
  readonly sensorSignals: {
    readonly tempDrop: number;       // °C (음수)
    readonly ruminationChange: number; // %
    readonly activityChange: number;   // %
  };
  readonly postCalvingChecklist: readonly string[];
}

export const CALVING_ALGORITHM = {
  // 센서 감지 조건
  tempDropThreshold: -0.3,           // °C (개체 7일 평균 대비)
  tempDropCritical: -0.5,            // °C (6시간 이내 분만)
  ruminationDeclineThreshold: -5,    // %
  // 모니터링 시작 (분만 예정일 기준)
  monitoringStartDaysBefore: 14,
  // 분만 후 체크리스트
  postCalvingChecklist: [
    '6시간 이내 초유 급여 (체중의 10%, 최소 4L)',
    '어미소 체온 측정 (39.5°C 초과 시 자궁내막염 의심)',
    '후산 배출 확인 (12시간 이내 정상, 24시간 초과 시 후산정체)',
    '어미소 식욕/반추 확인',
    '송아지 호흡/활력 확인',
    'DIM 0 시작 — 케토시스 고위험기 진입',
  ],
} as const;

// ─── 4. 유방염 조기 발견 ────────────────────────────────────────

export const MASTITIS_DETECTION_STAGES = {
  /** 1단계: 준임상형 의심 (subclinical) — 아직 눈에 보이는 증상 없음 */
  subclinical: {
    tempThreshold: 39.2,          // °C (정상 상한 근처)
    tempRiseFromBaseline: 0.3,    // °C
    ruminationDeclinePct: -5,     // %
    action: 'CMT 검사 권장 — 준임상형 유방염 가능성',
  },
  /** 2단계: 임상형 의심 — 치료 시작 적기 */
  clinical: {
    tempThreshold: 39.4,          // °C (실측 평균 39.35°C)
    ruminationDeclinePct: -10,    // %
    action: '즉시 CMT + 유즙 확인 — 항생제 처방 준비',
  },
  /** 3단계: 급성 — 응급 */
  acute: {
    tempThreshold: 40.0,          // °C
    ruminationDeclinePct: -20,    // %
    activityDeclinePct: -15,      // %
    action: '급성 유방염 — 수의사 즉시 + 격리',
  },
} as const;

// ─── 5. 대사성 질병 ─────────────────────────────────────────────

export interface MetabolicDiseaseRule {
  readonly disease: string;
  readonly diseaseKo: string;
  readonly riskWindow: { readonly dimStart: number; readonly dimEnd: number }; // DIM 범위
  readonly sensorConditions: readonly {
    readonly metric: string;
    readonly condition: string;
    readonly value: number;
  }[];
  readonly emergencyAction: string;
  readonly confirmatoryTests: readonly string[];
}

export const METABOLIC_DISEASE_RULES: readonly MetabolicDiseaseRule[] = [
  {
    disease: 'milk_fever',
    diseaseKo: '유열 (저칼슘혈증)',
    riskWindow: { dimStart: -1, dimEnd: 3 },  // 분만 전 1일 ~ 분만 후 3일
    sensorConditions: [
      { metric: 'temperature', condition: '<', value: 37.5 },
      { metric: 'activity', condition: 'pctChange<', value: -60 },
      { metric: 'rumination', condition: 'pctChange<', value: -40 },
    ],
    emergencyAction: '칼슘제(글루콘산칼슘) 정맥주사 즉시. 기립 가능할 때까지 보조.',
    confirmatoryTests: ['혈중 칼슘 (<7.5mg/dL 확진)', '혈중 인/마그네슘'],
  },
  {
    disease: 'ketosis',
    diseaseKo: '케토시스',
    riskWindow: { dimStart: 7, dimEnd: 70 },
    sensorConditions: [
      { metric: 'rumination', condition: 'pctChange<', value: -15 },
      { metric: 'temperature', condition: 'range', value: 0 },  // 정상 범위
      { metric: 'activity', condition: 'pctChange<', value: -10 },
    ],
    emergencyAction: '프로필렌 글리콜 300mL 1일 2회 경구. BHBA 검사.',
    confirmatoryTests: ['뇨 케톤 스트립', '혈중 BHBA (>1.2mmol/L)', '유즙 케톤'],
  },
  {
    disease: 'retained_placenta',
    diseaseKo: '후산정체',
    riskWindow: { dimStart: 0, dimEnd: 2 },  // 분만 직후
    sensorConditions: [
      { metric: 'temperature', condition: '>', value: 39.5 },
      { metric: 'rumination', condition: 'pctChange<', value: -15 },
    ],
    emergencyAction: '12시간 이상 후산 미배출 시 수의사. 무리한 제거 금지.',
    confirmatoryTests: ['육안 확인 (후산 잔류)', '체온 39.5°C+ = 감염 진행'],
  },
  {
    disease: 'metritis',
    diseaseKo: '자궁내막염',
    riskWindow: { dimStart: 3, dimEnd: 21 },
    sensorConditions: [
      { metric: 'temperature', condition: '>', value: 39.5 },
      { metric: 'rumination', condition: 'pctChange<', value: -12 },
      { metric: 'activity', condition: 'pctChange<', value: -10 },
    ],
    emergencyAction: '질 분비물 확인. 악취/화농성이면 항생제 자궁내 주입.',
    confirmatoryTests: ['질 분비물 관찰', '직장검사', '자궁 초음파'],
  },
  {
    disease: 'lda',
    diseaseKo: '제4위변위(LDA)',
    riskWindow: { dimStart: 7, dimEnd: 50 },
    sensorConditions: [
      { metric: 'rumination', condition: 'pctChange<', value: -35 },
      { metric: 'activity', condition: 'pctChange<', value: -25 },
      { metric: 'temperature', condition: 'range', value: 0 },
    ],
    emergencyAction: '좌측 복벽 핑음 확인. 수술 필요.',
    confirmatoryTests: ['청타진 (좌측 복벽 핑음)', '직장검사', '초음파'],
  },
  {
    disease: 'downer_cow',
    diseaseKo: '기립불능',
    riskWindow: { dimStart: -1, dimEnd: 3 },
    sensorConditions: [
      { metric: 'activity', condition: '<', value: 0.5 },  // 거의 움직임 없음
      { metric: 'temperature', condition: '<', value: 37.5 },
    ],
    emergencyAction: '유열/저인혈증 동시 치료. 체위 변경(2시간마다). 수의사 즉시.',
    confirmatoryTests: ['혈중 칼슘+인+마그네슘', '근육 손상 여부(CK)', '신경학적 검사'],
  },
];

// ─── 6. 전염성 질병 — 집단 감지 ─────────────────────────────────

export interface EpidemicAlertLevel {
  readonly level: 'watch' | 'warning' | 'outbreak' | 'national_emergency';
  readonly description: string;
  readonly criteria: string;
  readonly actions: readonly string[];
}

export const EPIDEMIC_ALERT_LEVELS: readonly EpidemicAlertLevel[] = [
  {
    level: 'watch',
    description: '주의 관찰',
    criteria: '1개 농장에서 3두 이상 동시 발열+반추 저하',
    actions: ['해당 농장 집중 모니터링', '인근 농장 센서 데이터 확인'],
  },
  {
    level: 'warning',
    description: '경고',
    criteria: '반경 10km 내 2개+ 농장에서 유사 증상 클러스터',
    actions: ['방역관 알림', '이동 이력 조회', '접촉 네트워크 분석'],
  },
  {
    level: 'outbreak',
    description: '발생 의심',
    criteria: '확산 가속(farms/day 증가) + 3개+ 농장 클러스터',
    actions: ['KAHIS 보고', '이동 제한 권고', 'SEIR 시뮬레이션 실행'],
  },
  {
    level: 'national_emergency',
    description: '국가 비상',
    criteria: '2개+ 시도에 걸친 동시 클러스터 + R0 추정 > 3',
    actions: ['국가 비상 대응', '전국 이동 제한', '살처분 범위 결정'],
  },
];

// ─── 7. 축산 행정 API ───────────────────────────────────────────

export interface AdminAPIEndpoint {
  readonly domain: string;
  readonly endpoint: string;
  readonly description: string;
  readonly externalSystem: string;
}

export const ADMIN_API_ENDPOINTS: readonly AdminAPIEndpoint[] = [
  { domain: '이력제', endpoint: '/api/traceability/:traceNo', description: '개체 전체 이력', externalSystem: 'EKAPE' },
  { domain: '방역', endpoint: '/api/epidemic/clusters', description: '집단 이상 클러스터', externalSystem: 'KAHIS' },
  { domain: '등급', endpoint: '/api/grade/:traceNo', description: '등급판정 결과', externalSystem: 'EKAPE' },
  { domain: '번식', endpoint: '/api/breeding/pipeline/:farmId', description: '번식 파이프라인', externalSystem: '농정 통계' },
  { domain: '유전', endpoint: '/api/genetics/sire/:registration', description: '씨수소 유전능력', externalSystem: '농진청' },
  { domain: '기상', endpoint: '/api/weather/thi/:farmId', description: 'THI 열스트레스', externalSystem: '기상청' },
];
