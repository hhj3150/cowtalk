// Daily Decision Queue — "오늘 무엇을 해야 하는가" 결정 카드
// 소버린 알람(predictions) + smaXtec 이벤트 + 번식 긴급조치를 하나의 우선순위 큐로 합성.
// 원칙: 새 판단 엔진이 아니라 기존 판단들의 '합성 계층'. 각 카드는 원인 체인(why)과
// 즉시 실행 가능한 행동(actionKind)을 반드시 포함한다 (알람→행동 완결).

export type DecisionSeverity = 'critical' | 'high' | 'medium' | 'low';

/** 사용자향 5단계 긴급도 — "언제까지 해야 하는가" (분류기: constants/urgency.ts) */
export type ActionUrgency = 'emergency' | 'today' | 'within_48h' | 'watch' | 'info';

export type DecisionSource = 'sovereign' | 'smaxtec' | 'breeding' | 'weather';

export type DecisionActionKind = 'animal' | 'farm' | 'ai_analysis';

export interface DecisionCardSubject {
  readonly animalId?: string;
  readonly earTag?: string;
  readonly farmId?: string;
  readonly farmName?: string;
}

export interface DecisionEconomicImpact {
  /** 미조치 시 일 손실 추정 (원) */
  readonly dailyLossKrw: number;
  /** 적용 손실률 (%) */
  readonly lossFractionPct: number;
  /** 근거: 최근 7일 '실측' 평균 일 유량 (L) — 추정 유량으로는 계산하지 않음 */
  readonly basisYieldL: number;
  /** 적용 단가 (원/L) */
  readonly priceKrwPerL: number;
  /** 항상 true — 모델 기반 추정임을 UI에 명시 */
  readonly estimated: true;
}

export interface DecisionCard {
  readonly id: string;
  readonly rank: number;
  readonly severity: DecisionSeverity;
  readonly score: number;
  /** 행동 명령형 제목 — "무엇을 해야 하는가" */
  readonly title: string;
  readonly subject: DecisionCardSubject;
  /** 원인 체인 — 왜 이 조치가 필요한가 (근거 최대 4개) */
  readonly why: readonly string[];
  readonly actionLabel: string;
  readonly actionKind: DecisionActionKind;
  readonly source: DecisionSource;
  readonly detectedAt: string;
  /** 조치 골든타임 (시간). 없으면 시간 제약 없는 조치 */
  readonly dueInHours?: number;
  /** 5단계 긴급도 — severity+골든타임에서 결정적으로 분류 */
  readonly urgency: ActionUrgency;
  /** 경제 환산 — 실측 유량 보유 개체만, 항상 '추정' 표기 */
  readonly economicImpact?: DecisionEconomicImpact;
  /** 완료 여부 — decision_actions DB 기록 (기기·사용자 간 공유) */
  readonly done?: boolean;
}

export interface DecisionQueueData {
  readonly cards: readonly DecisionCard[];
  /** 합성 전 후보 총수 — "5건 외 N건 더" 표시용 */
  readonly totalCandidates: number;
  readonly generatedAt: string;
  /** 최근 7일 완료 처리된 결정 수 (스코프 기준) — 조치 완결 지표 */
  readonly completedLast7d?: number;
}

/** POST /decision/actions 요청 — 완료 처리할 카드의 스냅샷 */
export interface CompleteDecisionInput {
  readonly cardId: string;
  readonly farmId?: string;
  readonly animalId?: string;
  readonly source: DecisionSource;
  readonly severity: DecisionSeverity;
  readonly title: string;
}
