// 폐루프 프로토콜 카탈로그 — 질환별 "개입 후보 + 센서 검증 기준" 단일 원천 (순수 데이터)
//
// 원칙:
// - 개입 후보는 '권고 후보'다. 처방·용량은 수의사가 정한다 (requiresVet).
// - 검증 기준은 CowTalk이 실제 수집하는 3개 메트릭(체온·반추·활동)만 쓴다.
//   음수량·pH 는 smaXtec API 미지원이라 기준으로 삼지 않는다 (CLAUDE.md 센서 파이프라인).
// - 반추·활동은 목장·개체 편차가 커서 절대값 대신 '감지 전 기준선 대비 비율'로 본다.
// - futureBolusCandidate 는 smaXtec 체내 방출형 볼루스(개발 중) 적용 '가설' 표시일 뿐이다.

import type { ClosedLoopProtocolSummary, InterventionOption } from '@cowtalk/shared';

export type CriterionKind =
  | 'temp_below'          // 검증 창 최근 평균 체온 < threshold
  | 'temp_at_least'       // 최근 평균 체온 ≥ threshold (저체온 회복)
  | 'rumination_recovery' // 최근 반추 ≥ 기준선 × threshold
  | 'activity_recovery';  // 최근 활동 ≥ 기준선 × threshold

export type WorsenKind =
  | 'temp_above'          // 최근 체온 > threshold
  | 'temp_under'          // 최근 체온 < threshold (저체온 진행)
  | 'rumination_drop';    // 최근 반추 < 기준선 × threshold

export interface Criterion {
  readonly kind: CriterionKind;
  readonly threshold: number;
  readonly label: string;
}

export interface WorsenRule {
  readonly kind: WorsenKind;
  readonly threshold: number;
  readonly label: string;
}

export interface ClosedLoopProtocol {
  readonly key: string;
  readonly label: string;
  /** 진단명 매칭 키워드 (소문자 비교) */
  readonly keywords: readonly string[];
  /** 이 질환으로 연결할 smaXtec 이벤트 유형 */
  readonly smaxtecEventTypes: readonly string[];
  readonly verifyStartHours: number;
  readonly verifyWindowHours: number;
  /** 모두 충족 → resolved */
  readonly primary: readonly Criterion[];
  /** 하나라도 충족 → worsened */
  readonly worsen: readonly WorsenRule[];
  readonly interventions: readonly InterventionOption[];
  readonly caveat?: string;
}

const TEMP_NORMAL = 39.3;   // 위내 체온 일평균 정상 상한 (기존 assessRecovery 와 동일)
const TEMP_HIGH = 39.8;     // 지속 고열 (기존 assessRecovery 와 동일)
const TEMP_HYPO = 38.0;     // 저체온 진행 (유열 등)
const TEMP_HYPO_OK = 38.4;  // 저체온 회복

export const CLOSED_LOOP_PROTOCOLS: readonly ClosedLoopProtocol[] = [
  {
    key: 'ketosis',
    label: '케토시스',
    keywords: ['케토시스', '케톤', 'ketosis', '아세톤혈증'],
    smaxtecEventTypes: [],
    verifyStartHours: 24,
    verifyWindowHours: 96,
    primary: [
      { kind: 'rumination_recovery', threshold: 1.1, label: '반추시간 기준선 대비 +10% 회복' },
      { kind: 'activity_recovery', threshold: 1.0, label: '활동량 기준선 회복' },
    ],
    worsen: [
      { kind: 'rumination_drop', threshold: 0.85, label: '반추시간 기준선 대비 15% 이상 추가 감소' },
    ],
    interventions: [
      { category: 'supplement', label: '프로필렌글리콜 경구 급여', channel: 'manual', requiresVet: false, futureBolusCandidate: true },
      { category: 'treatment', label: '포도당 정맥 투여 등 수의 처치', channel: 'manual', requiresVet: true },
      { category: 'management', label: '분만 전후 건물섭취량·BCS 점검', channel: 'management', requiresVet: false },
    ],
    caveat: '혈중 BHB 재검이 확정 근거 — 센서는 회복 추세 보조 지표',
  },
  {
    key: 'hypocalcemia',
    label: '유열·저칼슘혈증',
    keywords: ['유열', '저칼슘', 'milk fever', 'hypocalcemia', '기립불능'],
    smaxtecEventTypes: ['temperature_low'],
    verifyStartHours: 12,
    verifyWindowHours: 48,
    primary: [
      { kind: 'temp_at_least', threshold: TEMP_HYPO_OK, label: `위내 체온 ${TEMP_HYPO_OK}°C 이상 회복` },
      { kind: 'rumination_recovery', threshold: 1.0, label: '반추시간 기준선 회복' },
    ],
    worsen: [
      { kind: 'temp_under', threshold: TEMP_HYPO, label: `위내 체온 ${TEMP_HYPO}°C 미만 지속` },
    ],
    interventions: [
      { category: 'supplement', label: '칼슘 경구 보충 (볼루스·젤)', channel: 'manual', requiresVet: false, futureBolusCandidate: true },
      { category: 'treatment', label: '칼슘 정맥 투여', channel: 'manual', requiresVet: true },
      { category: 'management', label: '건유기 DCAD·음이온염 사양 점검', channel: 'management', requiresVet: false },
    ],
  },
  {
    key: 'acidosis',
    label: '반추위 산증(SARA)',
    keywords: ['산증', '아시도시스', 'acidosis', 'sara', '과산증'],
    smaxtecEventTypes: [],
    verifyStartHours: 24,
    verifyWindowHours: 96,
    primary: [
      { kind: 'rumination_recovery', threshold: 1.1, label: '반추시간 기준선 대비 +10% 회복' },
    ],
    worsen: [
      { kind: 'rumination_drop', threshold: 0.85, label: '반추시간 기준선 대비 15% 이상 추가 감소' },
    ],
    interventions: [
      { category: 'supplement', label: '완충제(중탄산나트륨 등) 사료 첨가', channel: 'feed', requiresVet: false, futureBolusCandidate: true },
      { category: 'management', label: 'TMR 조사료 비율·입자도·급여 횟수 점검', channel: 'management', requiresVet: false },
    ],
    caveat: '위내 pH 는 CowTalk 미수집 — 반추시간 회복으로만 간접 판정',
  },
  {
    key: 'mastitis',
    label: '유방염',
    keywords: ['유방염', 'mastitis', 'cmt'],
    smaxtecEventTypes: [],
    verifyStartHours: 24,
    verifyWindowHours: 120,
    primary: [
      { kind: 'temp_below', threshold: TEMP_NORMAL, label: `위내 체온 ${TEMP_NORMAL}°C 미만` },
      { kind: 'rumination_recovery', threshold: 1.0, label: '반추시간 기준선 회복' },
    ],
    worsen: [
      { kind: 'temp_above', threshold: TEMP_HIGH, label: `위내 체온 ${TEMP_HIGH}°C 초과 지속` },
    ],
    interventions: [
      { category: 'treatment', label: '유방내 주입제·전신 항생제 (휴약 준수)', channel: 'manual', requiresVet: true },
      { category: 'supplement', label: '소염·수액 보조', channel: 'manual', requiresVet: true },
      { category: 'management', label: '착유 위생·착유기 점검', channel: 'management', requiresVet: false },
    ],
    caveat: 'CMT·SCC 재검이 확정 근거 — 국소형은 센서 변화가 작다',
  },
  {
    key: 'fever_infection',
    label: '발열·감염성 질환 (폐렴·자궁염 등)',
    keywords: ['폐렴', '자궁염', '발열', '고열', '감염', 'pneumonia', 'metritis', 'fever'],
    smaxtecEventTypes: ['temperature_high', 'temperature_warning'],
    verifyStartHours: 24,
    verifyWindowHours: 72,
    primary: [
      { kind: 'temp_below', threshold: TEMP_NORMAL, label: `위내 체온 ${TEMP_NORMAL}°C 미만` },
      { kind: 'rumination_recovery', threshold: 1.1, label: '반추시간 기준선 대비 +10% 회복' },
    ],
    worsen: [
      { kind: 'temp_above', threshold: TEMP_HIGH, label: `위내 체온 ${TEMP_HIGH}°C 초과 지속` },
    ],
    interventions: [
      { category: 'treatment', label: '항생제·해열소염제 (휴약 준수)', channel: 'manual', requiresVet: true },
      { category: 'management', label: '격리·환기·급수 확보', channel: 'management', requiresVet: false },
    ],
  },
  {
    key: 'heat_stress',
    label: '열스트레스',
    keywords: ['열스트레스', '고온스트레스', '열사병', 'heat stress', 'thi'],
    smaxtecEventTypes: [],
    verifyStartHours: 12,
    verifyWindowHours: 48,
    primary: [
      { kind: 'temp_below', threshold: TEMP_NORMAL, label: `위내 체온 ${TEMP_NORMAL}°C 미만` },
    ],
    worsen: [
      { kind: 'temp_above', threshold: TEMP_HIGH, label: `위내 체온 ${TEMP_HIGH}°C 초과 지속` },
    ],
    interventions: [
      { category: 'management', label: '송풍·안개분무·그늘·급수 확대', channel: 'management', requiresVet: false },
      { category: 'supplement', label: '전해질·완충제 사료 첨가', channel: 'feed', requiresVet: false },
    ],
  },
  {
    key: 'digestive',
    label: '소화기 질환 (식체·고창·설사)',
    keywords: ['소화불량', '식체', '고창', '설사', '제4위', '전위', 'indigestion', 'bloat', 'diarrhea', 'lda'],
    smaxtecEventTypes: ['rumination_decrease', 'rumination_warning'],
    verifyStartHours: 24,
    verifyWindowHours: 72,
    primary: [
      { kind: 'rumination_recovery', threshold: 1.1, label: '반추시간 기준선 대비 +10% 회복' },
    ],
    worsen: [
      { kind: 'rumination_drop', threshold: 0.85, label: '반추시간 기준선 대비 15% 이상 추가 감소' },
    ],
    interventions: [
      { category: 'treatment', label: '수의 진단 후 처치 (제4위변위는 외과)', channel: 'manual', requiresVet: true },
      { category: 'supplement', label: '생균제·반추 촉진제', channel: 'feed', requiresVet: false },
    ],
  },
];

/** 매칭 실패 시 — 기존 치료결과 추적(assessRecovery)과 같은 일반 기준 */
export const GENERAL_PROTOCOL: ClosedLoopProtocol = {
  key: 'general',
  label: '일반 (분류 외)',
  keywords: [],
  smaxtecEventTypes: [],
  verifyStartHours: 24,
  verifyWindowHours: 72,
  primary: [
    { kind: 'temp_below', threshold: TEMP_NORMAL, label: `위내 체온 ${TEMP_NORMAL}°C 미만` },
  ],
  worsen: [
    { kind: 'temp_above', threshold: TEMP_HIGH, label: `위내 체온 ${TEMP_HIGH}°C 초과 지속` },
  ],
  interventions: [
    { category: 'treatment', label: '수의 진단 후 처치', channel: 'manual', requiresVet: true },
  ],
};

/** smaXtec 건강 감지로 보는 이벤트 유형 (번식·분만 이벤트 제외) */
export const HEALTH_DETECTION_EVENT_TYPES: readonly string[] = [
  'health_warning', 'health_general', 'health_alert', 'health_risk', 'clinical_condition',
  'temperature_high', 'temperature_warning', 'temperature_low',
  'rumination_decrease', 'rumination_warning',
  'activity_decrease', 'activity_warning',
  'drinking_decrease', 'drinking_warning',
];

/** 진단명 → 프로토콜 (키워드 첫 매칭, 없으면 일반) */
export function resolveProtocol(diagnosis: string | null | undefined): ClosedLoopProtocol {
  const text = (diagnosis ?? '').toLowerCase();
  if (!text) return GENERAL_PROTOCOL;
  for (const p of CLOSED_LOOP_PROTOCOLS) {
    if (p.keywords.some((k) => text.includes(k.toLowerCase()))) return p;
  }
  return GENERAL_PROTOCOL;
}

export function protocolByKey(key: string): ClosedLoopProtocol {
  return CLOSED_LOOP_PROTOCOLS.find((p) => p.key === key) ?? GENERAL_PROTOCOL;
}

export function summarizeProtocol(p: ClosedLoopProtocol): ClosedLoopProtocolSummary {
  return {
    key: p.key,
    label: p.label,
    verifyStartHours: p.verifyStartHours,
    verifyWindowHours: p.verifyWindowHours,
    interventions: p.interventions,
    criteriaText: [
      ...p.primary.map((c) => `회복: ${c.label}`),
      ...p.worsen.map((w) => `악화: ${w.label}`),
    ],
    ...(p.caveat ? { caveat: p.caveat } : {}),
  };
}
