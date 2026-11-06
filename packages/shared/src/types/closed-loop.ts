// 폐루프 건강관리 (Closed-Loop Health Management) — 공유 타입
//
// 배경: smaXtec이 볼루스에 미세기계식 방출 장치를 넣어 "감지 → 체내 투여"를 잇는
// 폐루프 시스템을 개발 중이라고 발표했다 (2024-05, 특허 출원 중, 상용화 일정 미정).
// 그 발표에는 투여 "이후 효과 확인" 단계가 없다.
// CowTalk은 소프트웨어 층에서 루프 전체를 닫는다:
//   ① 감지(smaXtec 이벤트, 신뢰) → ② 개입(치료·보충제·관리) → ③ 센서 검증 → ④ 수의사 확정
// 향후 체내 방출형 볼루스가 상용화되면 개입 채널(smaxtec_bolus_release)로 수신만 붙인다.

/** 개입 채널 — 현재는 manual/feed/management, 체내 방출은 향후 수신 슬롯 */
export type InterventionChannel = 'manual' | 'feed' | 'management' | 'smaxtec_bolus_release';

export type InterventionCategory = 'treatment' | 'supplement' | 'management';

/** 센서 검증 판정 */
export type LoopVerdict =
  | 'awaiting'          // 검증 시작 시점 전
  | 'insufficient_data' // 판정에 필요한 센서값이 없음
  | 'monitoring'        // 검증 창 진행 중, 아직 결론 없음
  | 'improving'         // 일부 기준 충족 — 회복 추세
  | 'resolved'          // 1차 기준 모두 충족 — 수의사 확정 대기
  | 'not_improved'      // 검증 창 종료, 기준 미충족
  | 'worsened';         // 악화 기준 충족 — 즉시 재진

export interface InterventionOption {
  readonly category: InterventionCategory;
  readonly label: string;
  readonly channel: InterventionChannel;
  readonly requiresVet: boolean;
  /** 체내 방출형 볼루스 적용 후보인가 (가설 — 상용화 전) */
  readonly futureBolusCandidate?: boolean;
}

export interface ClosedLoopProtocolSummary {
  readonly key: string;
  readonly label: string;
  readonly verifyStartHours: number;
  readonly verifyWindowHours: number;
  readonly interventions: readonly InterventionOption[];
  readonly criteriaText: readonly string[];
  readonly caveat?: string;
}

export interface SensorWindowAvg {
  readonly temp: number | null;
  readonly rumination: number | null;
  readonly activity: number | null;
  readonly days: number;
}

export interface LoopVerification {
  readonly protocol: string;
  readonly verdict: LoopVerdict;
  readonly windowComplete: boolean;
  readonly baseline: SensorWindowAvg;
  readonly post: SensorWindowAvg;
  readonly metCriteria: readonly string[];
  readonly unmetCriteria: readonly string[];
  readonly explanation: string;
  readonly contributingFactors: readonly string[];
  readonly nextAction: string;
  readonly verifiedAt: string;
}

export interface ClosedLoopTreatmentItem {
  readonly treatmentId: string;
  readonly animalId: string;
  readonly earTag: string;
  readonly diagnosis: string;
  readonly drug: string;
  readonly administeredAt: string;
  /** 연결된 smaXtec 감지 시각 (센서 미감지 처치면 null) */
  readonly detectedAt: string | null;
  readonly vetOutcome: string | null;
  readonly verification: LoopVerification;
}

export interface ClosedLoopOpenDetection {
  readonly animalId: string;
  readonly earTag: string;
  readonly eventTypes: readonly string[];
  readonly severity: string;
  readonly detectedAt: string;
  readonly hoursOpen: number;
  readonly acknowledged: boolean;
}

export interface ClosedLoopFunnel {
  readonly detected: number;          // 감지 에피소드 (개체별 72h 병합)
  readonly intervened: number;        // 감지 후 개입 기록된 에피소드
  readonly sensorOnlyTreatments: number; // 감지 없이 기록된 처치 (현장 발견)
  readonly verified: number;          // 센서 판정 종결 (resolved/not_improved/worsened)
  readonly resolved: number;
  readonly vetConfirmed: number;      // 수의사가 결과 확정
  readonly interventionRate: number | null; // intervened / detected
  readonly closureRate: number | null;      // (verified ∪ vetConfirmed) / 전체 처치
}

export interface ClosedLoopStatus {
  readonly farmId: string;
  readonly days: number;
  readonly generatedAt: string;
  readonly funnel: ClosedLoopFunnel;
  readonly treatments: readonly ClosedLoopTreatmentItem[];
  readonly openDetections: readonly ClosedLoopOpenDetection[];
  readonly roleSpecific: {
    readonly farmer: string;
    readonly veterinarian: string;
    readonly government_admin: string;
  };
}
