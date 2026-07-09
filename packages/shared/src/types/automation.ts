// 자동화 룰 — "알람 → 행동" 자동 연결 (P3 AIP Automate)
//
// smaXtec/CowTalk 알람이 오면 정해진 도구 액션을 자동 실행한다.
// 고위험 도구는 기존 승인 게이트(tool_approval_requests)를 그대로 통과하므로
// 자동화가 승인 체계를 우회하지 않는다.

/** 트리거 소스 — alert: alerts 테이블, smaxtec_event: smaxtec_events 테이블 */
export type AutomationTriggerSource = 'alert' | 'smaxtec_event';

export interface AutomationTrigger {
  readonly source: AutomationTriggerSource;
  /** 매칭할 이벤트/알림 유형 (alerts.alertType 또는 smaxtec_events.eventType). 빈 배열 = 전체 */
  readonly eventTypes: readonly string[];
  /** alert 소스: 최소 우선순위 (low < medium < high < critical) */
  readonly minPriority?: 'low' | 'medium' | 'high' | 'critical';
  /** smaxtec_event 소스: 최소 신뢰도 (0~1) */
  readonly minConfidence?: number;
}

export interface AutomationAction {
  /** 실행할 팅커벨 도구명 (서버 AUTOMATABLE_TOOLS 허용 목록 내) */
  readonly toolName: string;
  /**
   * 도구 파라미터 템플릿 — 문자열 값의 {{animalId}} {{farmId}} {{eventType}} 가
   * 트리거 이벤트 컨텍스트로 치환된다.
   */
  readonly params: Readonly<Record<string, string | number | boolean>>;
}

export interface AutomationRule {
  readonly ruleId: string;
  /** null = 생성자 스코프 전체 농장 (수의사·행정관) */
  readonly farmId: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly enabled: boolean;
  readonly trigger: AutomationTrigger;
  readonly action: AutomationAction;
  /** 같은 룰+개체 재실행 유예 시간 */
  readonly cooldownHours: number;
  readonly createdBy: string | null;
  /** 생성 시점 역할 스냅샷 — 도구 실행 컨텍스트 (승인 게이트 판정에 사용) */
  readonly actorRole: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AutomationRunStatus = 'executed' | 'pending_approval' | 'denied' | 'failed';

export interface AutomationRuleRun {
  readonly runId: string;
  readonly ruleId: string;
  readonly ruleName?: string;
  readonly sourceType: AutomationTriggerSource;
  readonly sourceId: string;
  readonly animalId: string | null;
  readonly earTag?: string | null;
  readonly farmId: string | null;
  readonly status: AutomationRunStatus;
  readonly resultSummary: string | null;
  readonly executedAt: string;
}
