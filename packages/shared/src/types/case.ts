// 관리 케이스 (Case) — "알림"이 아니라 "사건" 단위로 관리한다
//
// 알림을 읽었다는 것과 문제가 해결되었다는 것은 다르다.
// 결정 카드(decision_actions)는 체크박스 한 번으로 끝나므로,
// 그 위에 감지→배정→현장확인→조치→재확인→종료의 수명주기를 얹는다.
//
// 이 파일은 타입과 순수 규칙만 담는다 (DB·HTTP 의존 없음).

// ======================================================================
// 상태·분류
// ======================================================================

/** 케이스 수명주기 — 되돌릴 수 있지만 건너뛸 수는 없다 */
export type CaseStatus =
  | 'detected' // 이상 감지 — 아직 담당자 없음
  | 'assigned' // 담당자 배정됨 — 현장 확인 전
  | 'field_checked' // 현장 확인 완료 — 조치 전
  | 'treated' // 진료·관리 조치 실시
  | 'rechecking' // 재확인 중 (센서 추세·현장 상태 관찰)
  | 'closed'; // 종료 (결과 확정)

/** 종료 결과 — '개선'만 성공이 아니다. 판정 불가도 기록해야 통계가 정직해진다 */
export type CaseOutcome =
  | 'improved' // 개선
  | 'ongoing' // 지속
  | 'worsened' // 악화
  | 'other_cause' // 다른 원인으로 확인
  | 'undetermined'; // 판정 불가 (데이터 부족·확인 못 함)

/** 케이스에 기록되는 사건 — 케이스의 이력 그 자체 */
export type CaseEventType =
  | 'detected'
  | 'assigned'
  | 'reassigned'
  | 'field_check'
  | 'treatment'
  | 'recheck'
  | 'note'
  | 'reopened'
  | 'closed';

/** 주의 표시 — 화면 뱃지가 아니라 쿼리 가능한 상태여야 한다 */
export type CaseFlag =
  | 'unassigned' // 담당자 미배정
  | 'overdue' // 확인 기한 초과
  | 'worsened' // 재확인에서 악화 관측
  | 'recheck_missing'; // 조치했으나 재확인 기록 없음

export type CaseSeverity = 'critical' | 'high' | 'medium' | 'low';

/** 케이스가 어디서 시작됐는가 */
export type CaseSource =
  | 'decision_card' // 통합 우선조치 목록에서 승격
  | 'sovereign_alarm'
  | 'smaxtec_event'
  | 'breeding'
  | 'manual'; // 사람이 직접 연 케이스

// ======================================================================
// 레코드
// ======================================================================

export interface CaseAssignment {
  readonly assignmentId: string;
  readonly caseId: string;
  /** 책임 담당자 */
  readonly assigneeId: string;
  readonly assigneeName: string | null;
  /** 보조 담당자 */
  readonly supportIds: readonly string[];
  readonly dueAt: string | null;
  readonly assignedBy: string | null;
  readonly assignedAt: string;
  /** 위임으로 대체된 시각 — null이면 현재 유효한 배정 */
  readonly supersededAt: string | null;
}

export interface CaseEvent {
  readonly eventId: string;
  readonly caseId: string;
  readonly eventType: CaseEventType;
  readonly occurredAt: string;
  readonly recordedBy: string | null;
  readonly recordedByName: string | null;
  readonly notes: string;
  /** 단계별 구조화 기록 (증상·검사·투약·추세 등) */
  readonly details: Record<string, unknown>;
}

export interface CaseRecord {
  readonly caseId: string;
  readonly farmId: string;
  readonly farmName: string | null;
  readonly animalId: string | null;
  readonly earTag: string | null;
  readonly source: CaseSource;
  /** 원래 알림 출처 (결정 카드 ID·알람 ID 등) — 추적 가능해야 한다 */
  readonly sourceRef: string | null;
  readonly severity: CaseSeverity;
  readonly status: CaseStatus;
  readonly title: string;
  /** 감지 근거 신호 (무엇을 보고 열었는가) */
  readonly detectedSignals: readonly string[];
  readonly detectedAt: string;
  /** 최종 책임자 — 위임해도 남는다 */
  readonly ownerId: string | null;
  readonly ownerName: string | null;
  readonly currentAssigneeId: string | null;
  readonly currentAssigneeName: string | null;
  readonly dueAt: string | null;
  readonly lastFieldCheckAt: string | null;
  readonly lastTreatmentAt: string | null;
  readonly lastRecheckAt: string | null;
  readonly closedAt: string | null;
  readonly outcome: CaseOutcome | null;
  readonly outcomeNotes: string;
  /** 종료 시점 센서 추세 스냅샷 — 나중에 AI 개선의 근거가 된다 */
  readonly outcomeSnapshot: Record<string, unknown> | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 목록 1행 — 플래그가 계산되어 함께 온다 */
export interface CaseListItem extends CaseRecord {
  readonly flags: readonly CaseFlag[];
}

export interface CaseDetail extends CaseListItem {
  readonly assignments: readonly CaseAssignment[];
  readonly events: readonly CaseEvent[];
}

export interface CaseSummary {
  readonly total: number;
  readonly open: number;
  readonly closed: number;
  readonly unassigned: number;
  readonly overdue: number;
  readonly worsened: number;
  readonly recheckMissing: number;
  readonly byStatus: Readonly<Record<CaseStatus, number>>;
}

// ======================================================================
// 입력
// ======================================================================

export interface CreateCaseInput {
  readonly farmId: string;
  readonly animalId?: string;
  readonly source: CaseSource;
  readonly sourceRef?: string;
  readonly severity: CaseSeverity;
  readonly title: string;
  readonly detectedSignals?: readonly string[];
  readonly detectedAt?: string;
  readonly assigneeId?: string;
  readonly dueAt?: string;
  readonly notes?: string;
}

export interface AssignCaseInput {
  readonly assigneeId: string;
  readonly supportIds?: readonly string[];
  readonly dueAt?: string;
  readonly notes?: string;
}

export interface AddCaseEventInput {
  readonly eventType: Extract<
    CaseEventType,
    'field_check' | 'treatment' | 'recheck' | 'note' | 'reopened'
  >;
  readonly occurredAt?: string;
  readonly notes?: string;
  readonly details?: Record<string, unknown>;
}

export interface CloseCaseInput {
  readonly outcome: CaseOutcome;
  readonly notes?: string;
  readonly snapshot?: Record<string, unknown>;
}

export interface CaseListFilters {
  readonly farmId?: string;
  readonly animalId?: string;
  readonly status?: CaseStatus;
  /** 열린 케이스만 (closed 제외) */
  readonly openOnly?: boolean;
  readonly assigneeId?: string;
  readonly flag?: CaseFlag;
  readonly since?: string;
  readonly limit?: number;
}

// ======================================================================
// 순수 규칙 — 서버·웹이 같은 규칙을 쓴다
// ======================================================================

export const CASE_STATUS_LABELS: Readonly<Record<CaseStatus, string>> = {
  detected: '감지',
  assigned: '배정',
  field_checked: '현장확인',
  treated: '조치',
  rechecking: '재확인',
  closed: '종료',
};

export const CASE_OUTCOME_LABELS: Readonly<Record<CaseOutcome, string>> = {
  improved: '개선',
  ongoing: '지속',
  worsened: '악화',
  other_cause: '다른 원인',
  undetermined: '판정 불가',
};

export const CASE_FLAG_LABELS: Readonly<Record<CaseFlag, string>> = {
  unassigned: '미배정',
  overdue: '기한 초과',
  worsened: '악화',
  recheck_missing: '재확인 누락',
};

/** 사건이 케이스 상태를 어디로 옮기는가. null이면 상태는 그대로 (기록만 남음) */
export function statusAfterEvent(
  current: CaseStatus,
  eventType: CaseEventType,
): CaseStatus | null {
  switch (eventType) {
    case 'assigned':
    case 'reassigned':
      // 이미 진행된 케이스를 재배정해도 진척을 뒤로 돌리지 않는다
      return current === 'detected' ? 'assigned' : null;
    case 'field_check':
      return current === 'closed' ? null : 'field_checked';
    case 'treatment':
      return current === 'closed' ? null : 'treated';
    case 'recheck':
      return current === 'closed' ? null : 'rechecking';
    case 'closed':
      return 'closed';
    case 'reopened':
      return current === 'closed' ? 'rechecking' : null;
    case 'detected':
    case 'note':
      return null;
  }
}

/** 종료된 케이스에는 재개(reopened) 외의 기록을 붙이지 않는다 */
export function canAppendEvent(current: CaseStatus, eventType: CaseEventType): boolean {
  if (current !== 'closed') return true;
  return eventType === 'reopened' || eventType === 'note';
}

const MS_PER_HOUR = 3_600_000;

/** 재확인 누락 판정 기준 — 조치 후 이 시간이 지나도록 재확인이 없으면 표시 */
export const RECHECK_DUE_HOURS = 48;

export interface CaseFlagInput {
  readonly status: CaseStatus;
  readonly currentAssigneeId: string | null;
  readonly dueAt: string | null;
  readonly lastTreatmentAt: string | null;
  readonly lastRecheckAt: string | null;
  readonly outcome: CaseOutcome | null;
  /** 재확인 기록에서 악화가 관측됐는가 */
  readonly worsenedObserved?: boolean;
}

/**
 * 주의 표시 계산 — 종료된 케이스는 플래그를 달지 않는다
 * (닫힌 건이 '기한 초과'로 영원히 목록을 어지럽히지 않게).
 */
export function computeCaseFlags(input: CaseFlagInput, now: Date): readonly CaseFlag[] {
  if (input.status === 'closed') {
    return input.outcome === 'worsened' ? ['worsened'] : [];
  }

  const flags: CaseFlag[] = [];

  if (!input.currentAssigneeId) {
    flags.push('unassigned');
  }

  if (input.dueAt !== null) {
    const due = new Date(input.dueAt).getTime();
    if (Number.isFinite(due) && due < now.getTime()) {
      flags.push('overdue');
    }
  }

  if (input.worsenedObserved === true) {
    flags.push('worsened');
  }

  // 조치는 했는데 재확인이 없다 — 가장 조용히 새는 구멍
  if (input.lastTreatmentAt !== null) {
    const treated = new Date(input.lastTreatmentAt).getTime();
    const rechecked = input.lastRecheckAt !== null ? new Date(input.lastRecheckAt).getTime() : null;
    const recheckedAfterTreatment = rechecked !== null && Number.isFinite(rechecked) && rechecked >= treated;
    const elapsedHours = (now.getTime() - treated) / MS_PER_HOUR;
    if (Number.isFinite(treated) && !recheckedAfterTreatment && elapsedHours >= RECHECK_DUE_HOURS) {
      flags.push('recheck_missing');
    }
  }

  return flags;
}

const SEVERITY_RANK: Readonly<Record<CaseSeverity, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const FLAG_RANK: Readonly<Record<CaseFlag, number>> = {
  worsened: 0,
  overdue: 1,
  recheck_missing: 2,
  unassigned: 3,
};

/**
 * 목록 정렬 키 — 낮을수록 먼저.
 * 악화·기한초과가 심각도보다 앞선다: 놓친 건이 새 건보다 급하다.
 */
export function caseSortKey(item: {
  readonly severity: CaseSeverity;
  readonly flags: readonly CaseFlag[];
  readonly detectedAt: string;
}): readonly [number, number, number] {
  const worstFlag = item.flags.reduce<number>(
    (acc, f) => Math.min(acc, FLAG_RANK[f] ?? 99),
    99,
  );
  const detected = new Date(item.detectedAt).getTime();
  return [worstFlag, SEVERITY_RANK[item.severity], Number.isFinite(detected) ? -detected : 0];
}

/** 케이스 목록 정렬 (원본 불변) */
export function sortCases<T extends { severity: CaseSeverity; flags: readonly CaseFlag[]; detectedAt: string }>(
  items: readonly T[],
): readonly T[] {
  return [...items].sort((a, b) => {
    const ka = caseSortKey(a);
    const kb = caseSortKey(b);
    for (let i = 0; i < ka.length; i += 1) {
      const d = (ka[i] ?? 0) - (kb[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  });
}

/** 요약 집계 — 화면 상단 4개 숫자의 유일한 계산처 */
export function summarizeCases(items: readonly CaseListItem[]): CaseSummary {
  const byStatus: Record<CaseStatus, number> = {
    detected: 0,
    assigned: 0,
    field_checked: 0,
    treated: 0,
    rechecking: 0,
    closed: 0,
  };
  let unassigned = 0;
  let overdue = 0;
  let worsened = 0;
  let recheckMissing = 0;
  let closed = 0;

  for (const item of items) {
    byStatus[item.status] += 1;
    if (item.status === 'closed') closed += 1;
    if (item.flags.includes('unassigned')) unassigned += 1;
    if (item.flags.includes('overdue')) overdue += 1;
    if (item.flags.includes('worsened')) worsened += 1;
    if (item.flags.includes('recheck_missing')) recheckMissing += 1;
  }

  return {
    total: items.length,
    open: items.length - closed,
    closed,
    unassigned,
    overdue,
    worsened,
    recheckMissing,
    byStatus,
  };
}
